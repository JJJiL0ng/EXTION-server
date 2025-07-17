// src/v2/sheet/cache/table-data-cache.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import * as LRUCache from 'lru-cache';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { createHash } from 'crypto';
import {
  CellDelta,
  SpreadSheetStructure,
  GPTReadyData,
  GPTSheetData,
  DataTable,
  createSafeError,
  // 새로 추가된 캐시 관련 타입들
  CacheOptions,
  CacheResult,
  InvalidationResult,
  OptimizationResult,
  ParsingOptions,
  CacheMetrics
} from '../../sheet/types/spreadsheet.types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

// 캐시 엔트리 인터페이스
interface MemoryCacheEntry {
  key: string;
  data: GPTReadyData;
  metadata: {
    userId: string;
    dataVersion: number;
    optionsHash: string;
    createdAt: number;
    lastAccessed: number;
    hitCount: number;
    size: number;
  };
  dependencies: {
    affectedSheets: Set<string>;
    deltaTimestamp: number;
  };
}

interface RedisCacheEntry {
  compressedData: Buffer;
  metadata: {
    userId: string;
    dataVersion: number;
    optionsHash: string;
    originalSize: number;
    compressedSize: number;
    createdAt: string;
    ttl: number;
  };
  checksum: string;
}

// 캐시 통계
interface CacheStats {
  l1Hits: number;
  l1Misses: number;
  l2Hits: number;
  l2Misses: number;
  totalRequests: number;
  avgResponseTime: number;
  memoryUsage: number;
}

@Injectable()
export class TableDataCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TableDataCacheService.name);

  // L1 메모리 캐시
  private memoryCache: LRUCache.LRUCache<string, MemoryCacheEntry>;
  
  // Cache Stampede 방지용 Promise 맵
  private pendingRequests = new Map<string, Promise<GPTReadyData>>();
  
  // 캐시 통계
  private stats: CacheStats = {
    l1Hits: 0,
    l1Misses: 0,
    l2Hits: 0,
    l2Misses: 0,
    totalRequests: 0,
    avgResponseTime: 0,
    memoryUsage: 0
  };

  // 설정값
  private readonly config = {
    memory: {
      maxSize: 1000,
      maxAge: 5 * 60 * 1000, // 5분
      maxUserCacheSize: 20 * 1024 * 1024, // 20MB per user
    },
    redis: {
      ttl: 30 * 60, // 30분
      keyPrefix: 'spreadsheet:cache:',
      compressionThreshold: 1024, // 1KB
    },
    performance: {
      compressionLevel: 6,
      batchSize: 100,
      batchTimeout: 50,
    }
  };

  // 사용자별 캐시 키 추적
  private userCacheKeys = new Map<string, Set<string>>();
  
  // 성능 측정용
  private responseTimes: number[] = [];

  constructor(
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.initializeMemoryCache();
  }

  async onModuleInit() {
    await this.initializeRedisConnection();
    this.startPerformanceMonitoring();
    this.logger.log('TableDataCacheService initialized');
  }

  async onModuleDestroy() {
    if (this.memoryCache && typeof this.memoryCache.reset === 'function') {
      this.memoryCache.reset();
    }
    this.pendingRequests.clear();
    await this.redis.quit();
    this.logger.log('TableDataCacheService destroyed');
  }

  /**
   * GPT용 데이터 조회 (메인 캐시 API) - Cache Stampede 방지 적용
   */
  async getGPTReadyData(
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    options: CacheOptions = {}
  ): Promise<CacheResult<GPTReadyData>> {
    const startTime = Date.now();
    this.stats.totalRequests++;
    
    try {
      // 캐시 키 생성
      const dataHash = this.generateDataHash(JSON.stringify(spreadSheetData));
      const optionsHash = this.generateOptionsHash(options);
      const cacheKey = this.generateCacheKey(userId, dataHash, optionsHash);

      // L1: 메모리 캐시 확인
      const memoryResult = await this.checkMemoryCache(cacheKey, userId);
      if (memoryResult) {
        this.recordHit('l1', startTime);
        return {
          data: memoryResult,
          source: 'memory',
          timing: Date.now() - startTime,
          cached: true
        };
      }


      // L2: Redis 캐시 확인
      const redisResult = await this.checkRedisCache(cacheKey);
      if (redisResult) {
        // 메모리 캐시에도 저장
        await this.updateMemoryCache(cacheKey, userId, redisResult, options);
        this.recordHit('l2', startTime);
        return {
          data: redisResult,
          source: 'redis',
          timing: Date.now() - startTime,
          cached: true
        };
      }

      // Cache Stampede 방지: 동일한 키에 대한 진행 중인 요청 확인
      const existingRequest = this.pendingRequests.get(cacheKey);
      if (existingRequest) {
        this.logger.debug(`Cache stampede prevented for key: ${cacheKey}`);
        try {
          const data = await existingRequest;
          this.recordHit('l2', startTime); // 대기 중인 요청도 효과적으로 캐시 히트로 간주
          return {
            data,
            source: 'pending',
            timing: Date.now() - startTime,
            cached: false
          };
        } catch (error) {
          // 진행 중인 요청이 실패한 경우, 새로운 요청 시도
          this.pendingRequests.delete(cacheKey);
          throw error;
        }
      }

      // L3: 실시간 생성 (Promise를 맵에 저장하여 동시 요청 방지)
      const dataGenerationPromise = this.generateFreshDataWithCaching(
        cacheKey, 
        userId, 
        spreadSheetData, 
        options
      );
      
      this.pendingRequests.set(cacheKey, dataGenerationPromise);

      try {
        const freshData = await dataGenerationPromise;
        
        this.recordMiss(startTime);
        return {
          data: freshData,
          source: 'generated',
          timing: Date.now() - startTime,
          cached: false
        };
      } finally {
        // 요청 완료 후 Promise 맵에서 제거
        this.pendingRequests.delete(cacheKey);
      }

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Cache operation failed: ${safeError.message}`, safeError.details);
      throw error;
    }
  }

  /**
   * 델타 적용 시 캐시 무효화
   */
  async invalidateOnDelta(userId: string, delta: CellDelta): Promise<InvalidationResult> {
    try {
      const affectedSheet = delta.sheetName;
      const userKeys = this.userCacheKeys.get(userId) || new Set();
      let invalidatedCount = 0;

      // 영향받은 캐시들 선택적 무효화
      for (const cacheKey of userKeys) {
        const entry = this.memoryCache.get(cacheKey);
        if (entry && entry.dependencies.affectedSheets.has(affectedSheet)) {
          // 메모리 캐시에서 제거
          if (this.memoryCache && typeof this.memoryCache.delete === 'function') {
            this.memoryCache.delete(cacheKey);
          }
          
          // Redis 캐시에서도 제거 (비동기)
          setImmediate(() => this.redis.del(cacheKey));
          
          invalidatedCount++;
        }
      }

      // 사용자 캐시 키 목록 업데이트
      const remainingKeys = new Set<string>();
      for (const key of userKeys) {
        if (this.memoryCache.has(key)) {
          remainingKeys.add(key);
        }
      }
      this.userCacheKeys.set(userId, remainingKeys);

      this.logger.debug(`Invalidated ${invalidatedCount} cache entries for user ${userId}, sheet ${affectedSheet}`);

      // 예측적 캐싱 스케줄링
      this.schedulePredictiveCaching(userId, delta);

      return {
        success: true,
        invalidatedCount,
        affectedSheets: [affectedSheet]
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Cache invalidation failed: ${safeError.message}`, safeError.details);
      return {
        success: false,
        invalidatedCount: 0,
        affectedSheets: [],
        error: safeError.message
      };
    }
  }

  /**
   * 사용자별 전체 캐시 정리
   */
  async clearUserCache(userId: string): Promise<void> {
    try {
      const userKeys = this.userCacheKeys.get(userId) || new Set();
      
      // 메모리 캐시에서 제거
      for (const key of userKeys) {
        if (this.memoryCache && typeof this.memoryCache.delete === 'function') {
          this.memoryCache.delete(key);
        }
      }

      // Redis에서 제거 (배치)
      if (userKeys.size > 0) {
        const pipeline = this.redis.pipeline();
        for (const key of userKeys) {
          pipeline.del(key);
        }
        await pipeline.exec();
      }

      // 사용자 캐시 키 목록 정리
      this.userCacheKeys.delete(userId);

      this.logger.log(`Cleared ${userKeys.size} cache entries for user ${userId}`);

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Failed to clear user cache: ${safeError.message}`, safeError.details);
    }
  }

  /**
   * 캐시 성능 최적화
   */
  async optimizeCache(userId?: string): Promise<OptimizationResult> {
    try {
      let optimizedCount = 0;
      let freedMemory = 0;

      if (userId) {
        // 특정 사용자 최적화
        optimizedCount = await this.optimizeUserCache(userId);
      } else {
        // 전체 캐시 최적화
        const result = await this.optimizeGlobalCache();
        optimizedCount = result.optimizedCount;
        freedMemory = result.freedMemory;
      }

      return {
        success: true,
        optimizedCount,
        freedMemory,
        currentMemoryUsage: this.getCurrentMemoryUsage()
      };

    } catch (error) {
      const safeError = createSafeError(error);
      this.logger.error(`Cache optimization failed: ${safeError.message}`, safeError.details);
      return {
        success: false,
        optimizedCount: 0,
        freedMemory: 0,
        currentMemoryUsage: this.getCurrentMemoryUsage(),
        error: safeError.message
      };
    }
  }

  /**
   * 캐시 통계 조회
   */
  getCacheMetrics(): CacheMetrics {
    const l1HitRate = this.stats.totalRequests > 0 ? 
      (this.stats.l1Hits / this.stats.totalRequests) * 100 : 0;
    const l2HitRate = this.stats.totalRequests > 0 ? 
      (this.stats.l2Hits / this.stats.totalRequests) * 100 : 0;
    const overallHitRate = this.stats.totalRequests > 0 ? 
      ((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalRequests) * 100 : 0;

    return {
      l1HitRate,
      l2HitRate,
      overallHitRate,
      avgResponseTime: this.calculateAverageResponseTime(),
      p95ResponseTime: this.calculatePercentileResponseTime(95),
      p99ResponseTime: this.calculatePercentileResponseTime(99),
      memoryUsage: this.getCurrentMemoryUsage(),
      memoryHitCount: this.stats.l1Hits,
      redisLatency: 0, // TODO: Redis 지연시간 측정
      redisConnectionCount: 1, // TODO: Redis 연결 수 측정
    };
  }

  // ==============================================================
  // Private Methods
  // ==============================================================

  /**
   * 메모리 캐시 초기화
   */
  private initializeMemoryCache(): void {
    this.memoryCache = new LRUCache({
      max: this.config.memory.maxSize,
      maxAge: this.config.memory.maxAge,
      updateAgeOnGet: true,
      dispose: (entry, key) => {
        this.onCacheEvict(entry, key);
      }
    });
  }

  /**
   * Redis 연결 초기화
   */
  private async initializeRedisConnection(): Promise<void> {
    try {
      await this.redis.ping();
      this.logger.log('Redis connection established');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  /**
   * L1 메모리 캐시 확인
   */
  private async checkMemoryCache(cacheKey: string, userId: string): Promise<GPTReadyData | null> {
    const entry = this.memoryCache.get(cacheKey);
    if (!entry) {
      this.stats.l1Misses++;
      return null;
    }

    // 사용자 검증
    if (entry.metadata.userId !== userId) {
      this.memoryCache.delete(cacheKey);
      this.stats.l1Misses++;
      return null;
    }

    // 접근 통계 업데이트
    entry.metadata.lastAccessed = Date.now();
    entry.metadata.hitCount++;
    
    this.stats.l1Hits++;
    this.logger.debug(`Memory cache hit: ${cacheKey}, hits: ${entry.metadata.hitCount}`);
    
    return entry.data;
  }

  /**
   * L2 Redis 캐시 확인
   */
  private async checkRedisCache(cacheKey: string): Promise<GPTReadyData | null> {
    try {
      const redisKey = `${this.config.redis.keyPrefix}${cacheKey}`;
      const cachedData = await this.redis.get(redisKey);
      
      if (!cachedData) {
        this.stats.l2Misses++;
        return null;
      }

      const entry: RedisCacheEntry = JSON.parse(cachedData);
      
      // 체크섬 검증
      const currentChecksum = this.generateDataHash(entry.compressedData);
      if (currentChecksum !== entry.checksum) {
        await this.redis.del(redisKey);
        this.stats.l2Misses++;
        this.logger.warn(`Redis cache checksum mismatch: ${cacheKey}`);
        return null;
      }

      // 압축 해제
      const decompressed = await gunzip(entry.compressedData);
      const data: GPTReadyData = JSON.parse(decompressed.toString());
      
      this.stats.l2Hits++;
      this.logger.debug(`Redis cache hit: ${cacheKey}`);
      
      return data;

    } catch (error) {
      this.stats.l2Misses++;
      this.logger.warn(`Redis cache error: ${error.message}`);
      return null;
    }
  }

  /**
   * 실시간 데이터 생성
   */
  private async generateFreshData(
    spreadSheetData: SpreadSheetStructure,
    options: CacheOptions
  ): Promise<GPTReadyData> {
    return await this.parseForGPT(spreadSheetData, {
      includeFormulas: options.includeFormulas,
      includeStyles: options.includeStyles,
      maxSheets: options.maxSheets,
      sheetNames: options.sheetNames
    });
  }

  /**
   * 캐싱과 함께 실시간 데이터 생성 (Cache Stampede 방지용)
   */
  private async generateFreshDataWithCaching(
    cacheKey: string,
    userId: string,
    spreadSheetData: SpreadSheetStructure,
    options: CacheOptions
  ): Promise<GPTReadyData> {
    try {
      // 데이터 생성
      const freshData = await this.generateFreshData(spreadSheetData, options);
      
      // 모든 캐시 레이어에 저장
      await this.updateAllCaches(cacheKey, userId, freshData, options, spreadSheetData);
      
      return freshData;
    } catch (error) {
      // 에러 발생 시 Promise 맵에서 즉시 제거하여 다른 요청이 재시도할 수 있도록 함
      this.pendingRequests.delete(cacheKey);
      throw error;
    }
  }

  /**
   * GPT용 데이터 파싱
   */
  private async parseForGPT(
    data: SpreadSheetStructure,
    options: ParsingOptions
  ): Promise<GPTReadyData> {
    const sheets = new Map<string, GPTSheetData>();
    let totalCells = 0;

    if (data.sheets) {
      for (const [sheetName, sheet] of Object.entries(data.sheets)) {
        // 시트 필터링
        if (options.sheetNames && !options.sheetNames.includes(sheetName)) {
          continue;
        }

        if (options.maxSheets && sheets.size >= options.maxSheets) {
          break;
        }

        if (sheet.data?.dataTable) {
          const cellCount = Object.keys(sheet.data.dataTable).length;
          if (cellCount > 0) {
            sheets.set(sheetName, {
              csvData: this.convertToCSV(sheet.data.dataTable),
              cellCount,
              metadata: {
                name: sheetName,
                cellCount,
                includeFormulas: options.includeFormulas,
                includeStyles: options.includeStyles
              }
            });
            totalCells += cellCount;
          }
        }
      }
    }

    return {
      sheets,
      totalCells,
      dataHash: this.generateDataHash(JSON.stringify(data)),
      parsedAt: new Date(),
      options: options
    };
  }

  /**
   * DataTable을 CSV로 변환
   */
  private convertToCSV(dataTable: DataTable): string {
    const cells = Object.entries(dataTable)
      .map(([address, cell]) => ({
        address,
        row: this.parseRowFromAddress(address),
        col: this.parseColFromAddress(address),
        value: cell.value || cell.formula || ''
      }))
      .sort((a, b) => a.row - b.row || a.col - b.col);

    if (cells.length === 0) return '';

    const maxRow = Math.max(...cells.map(c => c.row));
    const maxCol = Math.max(...cells.map(c => c.col));
    
    const rows: string[][] = [];
    for (let r = 0; r <= maxRow; r++) {
      rows[r] = new Array(maxCol + 1).fill('');
    }

    for (const cell of cells) {
      rows[cell.row][cell.col] = String(cell.value || '');
    }

    return rows
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
  }

  /**
   * 모든 캐시 레이어에 저장
   */
  private async updateAllCaches(
    cacheKey: string,
    userId: string,
    data: GPTReadyData,
    options: CacheOptions,
    originalData: SpreadSheetStructure
  ): Promise<void> {
    // 메모리 캐시 저장
    await this.updateMemoryCache(cacheKey, userId, data, options);
    
    // Redis 캐시 저장 (비동기)
    setImmediate(() => this.updateRedisCache(cacheKey, userId, data, options));
  }

  /**
   * 메모리 캐시 업데이트
   */
  private async updateMemoryCache(
    cacheKey: string,
    userId: string,
    data: GPTReadyData,
    options: CacheOptions
  ): Promise<void> {
    const size = this.estimateDataSize(data);
    const optionsHash = this.generateOptionsHash(options);
    
    const entry: MemoryCacheEntry = {
      key: cacheKey,
      data,
      metadata: {
        userId,
        dataVersion: 1, // TODO: 실제 버전 관리
        optionsHash,
        createdAt: Date.now(),
        lastAccessed: Date.now(),
        hitCount: 0,
        size
      },
      dependencies: {
        affectedSheets: new Set(data.sheets.keys()),
        deltaTimestamp: Date.now()
      }
    };

    this.memoryCache.set(cacheKey, entry);

    // 사용자 캐시 키 추적
    if (!this.userCacheKeys.has(userId)) {
      this.userCacheKeys.set(userId, new Set());
    }
    this.userCacheKeys.get(userId)!.add(cacheKey);

    this.logger.debug(`Updated memory cache: ${cacheKey}, size: ${size} bytes`);
  }

  /**
   * Redis 캐시 업데이트
   */
  private async updateRedisCache(
    cacheKey: string,
    userId: string,
    data: GPTReadyData,
    options: CacheOptions
  ): Promise<void> {
    try {
      const dataString = JSON.stringify(data);
      const originalSize = dataString.length;
      
      // 압축 임계값 확인
      let compressedData: Buffer;
      if (originalSize > this.config.redis.compressionThreshold) {
        compressedData = await gzip(dataString);
      } else {
        compressedData = Buffer.from(dataString);
      }

      const entry: RedisCacheEntry = {
        compressedData,
        metadata: {
          userId,
          dataVersion: 1,
          optionsHash: this.generateOptionsHash(options),
          originalSize,
          compressedSize: compressedData.length,
          createdAt: new Date().toISOString(),
          ttl: this.config.redis.ttl
        },
        checksum: this.generateDataHash(compressedData)
      };

      const redisKey = `${this.config.redis.keyPrefix}${cacheKey}`;
      await this.redis.setex(
        redisKey,
        this.config.redis.ttl,
        JSON.stringify(entry)
      );

      this.logger.debug(`Updated Redis cache: ${cacheKey}, compressed: ${originalSize} → ${compressedData.length} bytes`);

    } catch (error) {
      this.logger.warn(`Failed to update Redis cache: ${error.message}`);
    }
  }

  /**
   * 예측적 캐싱 스케줄링
   */
  private schedulePredictiveCaching(userId: string, delta: CellDelta): void {
    // 백그라운드에서 실행
    setImmediate(async () => {
      try {
        // 사용자 활동 패턴 분석 후 캐시 준비
        // TODO: 더 정교한 예측 로직 구현
        this.logger.debug(`Scheduled predictive caching for user ${userId}`);
      } catch (error) {
        this.logger.debug(`Predictive caching failed: ${error.message}`);
      }
    });
  }

  /**
   * 캐시 키 생성
   */
  private generateCacheKey(userId: string, dataHash: string, optionsHash: string): string {
    return `${userId}:${dataHash}:${optionsHash}`;
  }

  /**
   * 옵션 해시 생성
   */
  private generateOptionsHash(options: CacheOptions): string {
    const optionsString = JSON.stringify(options, Object.keys(options).sort());
    return createHash('md5').update(optionsString).digest('hex');
  }

  /**
   * 데이터 해시 생성
   */
  private generateDataHash(data: string | Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * 성능 모니터링 시작
   */
  private startPerformanceMonitoring(): void {
    setInterval(() => {
      this.updateMemoryUsageStats();
      this.cleanupOldResponseTimes();
    }, 60000); // 1분마다
  }

  /**
   * 히트 기록
   */
  private recordHit(level: 'l1' | 'l2', startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);
    
    if (level === 'l1') {
      this.stats.l1Hits++;
    } else {
      this.stats.l2Hits++;
    }
  }

  /**
   * 미스 기록
   */
  private recordMiss(startTime: number): void {
    const responseTime = Date.now() - startTime;
    this.responseTimes.push(responseTime);
    // 미스는 이미 checkMemoryCache, checkRedisCache에서 기록됨
  }

  /**
   * 캐시 제거 콜백
   */
  private onCacheEvict(entry: MemoryCacheEntry, key: string): void {
    // 사용자 캐시 키 목록에서 제거
    const userKeys = this.userCacheKeys.get(entry.metadata.userId);
    if (userKeys) {
      userKeys.delete(key);
      if (userKeys.size === 0) {
        this.userCacheKeys.delete(entry.metadata.userId);
      }
    }
    
    this.logger.debug(`Cache entry evicted: ${key}`);
  }

  /**
   * 사용자별 캐시 최적화
   */
  private async optimizeUserCache(userId: string): Promise<number> {
    const userKeys = this.userCacheKeys.get(userId) || new Set();
    let optimizedCount = 0;

    for (const key of userKeys) {
      const entry = this.memoryCache.get(key);
      if (entry && entry.metadata.hitCount === 0 && 
          Date.now() - entry.metadata.createdAt > 60000) { // 1분 이상 미사용
        if (this.memoryCache && typeof this.memoryCache.delete === 'function') {
          this.memoryCache.delete(key);
        }
        optimizedCount++;
      }
    }

    return optimizedCount;
  }

  /**
   * 전체 캐시 최적화
   */
  private async optimizeGlobalCache(): Promise<{ optimizedCount: number; freedMemory: number }> {
    let optimizedCount = 0;
    let freedMemory = 0;

    // 메모리 사용량이 임계값 초과 시 정리
    const currentUsage = this.getCurrentMemoryUsage();
    const threshold = this.config.memory.maxUserCacheSize * 10; // 10명분

    if (currentUsage > threshold) {
      // 히트 횟수가 낮은 엔트리들부터 제거
      const entries = Array.from(this.memoryCache.keys())
        .map(key => ({ key, entry: this.memoryCache.get(key)! }))
        .sort((a, b) => a.entry.metadata.hitCount - b.entry.metadata.hitCount);

      for (const { key, entry } of entries) {
        if (currentUsage - freedMemory <= threshold) break;
        
        if (this.memoryCache && typeof this.memoryCache.delete === 'function') {
          this.memoryCache.delete(key);
        }
        optimizedCount++;
        freedMemory += entry.metadata.size;
      }
    }

    return { optimizedCount, freedMemory };
  }

  /**
   * 현재 메모리 사용량 계산
   */
  private getCurrentMemoryUsage(): number {
    let totalSize = 0;
    for (const entry of this.memoryCache.values()) {
      totalSize += entry.metadata.size;
    }
    return totalSize;
  }

  /**
   * 데이터 크기 추정
   */
  private estimateDataSize(data: GPTReadyData): number {
    return JSON.stringify(data).length;
  }

  /**
   * 평균 응답 시간 계산
   */
  private calculateAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    const sum = this.responseTimes.reduce((a, b) => a + b, 0);
    return sum / this.responseTimes.length;
  }

  /**
   * 백분위수 응답 시간 계산
   */
  private calculatePercentileResponseTime(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;
    
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * 메모리 사용량 통계 업데이트
   */
  private updateMemoryUsageStats(): void {
    this.stats.memoryUsage = this.getCurrentMemoryUsage();
  }

  /**
   * 오래된 응답 시간 데이터 정리
   */
  private cleanupOldResponseTimes(): void {
    // 최근 1000개만 유지
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-1000);
    }
  }

  /**
   * 주소 파싱 유틸리티
   */
  private parseRowFromAddress(address: string): number {
    const match = address.match(/^[A-Z]+(\d+)$/);
    return match ? parseInt(match[1]) - 1 : 0;
  }

  private parseColFromAddress(address: string): number {
    const match = address.match(/^([A-Z]+)\d+$/);
    if (!match) return 0;
    
    let result = 0;
    const col = match[1];
    for (let i = 0; i < col.length; i++) {
      result = result * 26 + (col.charCodeAt(i) - 64);
    }
    return result - 1;
  }
}