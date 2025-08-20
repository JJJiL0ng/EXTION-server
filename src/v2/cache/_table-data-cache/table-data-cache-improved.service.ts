// import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
// import { InjectRedis } from '@nestjs-modules/ioredis';
// import Redis from 'ioredis';
// import * as LRUCache from 'lru-cache';
// import * as zlib from 'zlib';
// import { promisify } from 'util';
// import { createHash } from 'crypto';

// import { RedisDistributedLockService } from './redis-distributed-lock.service';
// import { CacheCleanupService, CleanupTarget } from './cache-cleanup.service';
// import { RedisPipelineService } from './redis-pipeline.service';

// import {
//   CellDelta,
//   SpreadSheetStructure,
//   GPTReadyData,
//   GPTSheetData,
//   DataTable,
//   createSafeError,
//   CacheOptions,
//   CacheResult,
//   InvalidationResult,
//   OptimizationResult,
//   ParsingOptions,
//   CacheMetrics
// } from '../../sheet/types/spreadsheet.types';

// const gzip = promisify(zlib.gzip);
// const gunzip = promisify(zlib.gunzip);

// // 개선된 인터페이스들
// interface PendingRequest {
//   promise: Promise<GPTReadyData>;
//   timestamp: number;
//   lockKey?: string;
// }

// interface MemoryCacheEntry {
//   key: string;
//   data: GPTReadyData;
//   metadata: {
//     userId: string;
//     dataVersion: number;
//     optionsHash: string;
//     createdAt: number;
//     lastAccessed: number;
//     hitCount: number;
//     size: number;
//   };
//   dependencies: {
//     affectedSheets: Set<string>;
//     deltaTimestamp: number;
//   };
// }

// interface RedisCacheEntry {
//   compressedData: Buffer;
//   metadata: {
//     userId: string;
//     dataVersion: number;
//     optionsHash: string;
//     originalSize: number;
//     compressedSize: number;
//     createdAt: string;
//     ttl: number;
//   };
//   checksum: string;
// }

// @Injectable()
// export class TableDataCacheImprovedService implements OnModuleInit, OnModuleDestroy {
//   private readonly logger = new Logger(TableDataCacheImprovedService.name);

//   // L1 메모리 캐시
//   private memoryCache: LRUCache.LRUCache<string, MemoryCacheEntry>;
  
//   // 개선된 Pending Requests 관리 (타임스탬프 포함)
//   private pendingRequests = new Map<string, PendingRequest>();
  
//   // 캐시 통계
//   private stats = {
//     l1Hits: 0,
//     l1Misses: 0,
//     l2Hits: 0,
//     l2Misses: 0,
//     totalRequests: 0,
//     avgResponseTime: 0,
//     memoryUsage: 0,
//     stampedePrevented: 0,
//     lockFailures: 0
//   };

//   // 설정값
//   private readonly config = {
//     memory: {
//       maxSize: 1000,
//       maxAge: 5 * 60 * 1000, // 5분
//       maxUserCacheSize: 20 * 1024 * 1024, // 20MB per user
//     },
//     redis: {
//       ttl: 30 * 60, // 30분
//       keyPrefix: 'spreadsheet:cache:',
//       compressionThreshold: 1024, // 1KB
//       lockTtl: 30000, // 30초
//       lockTimeout: 5000, // 5초
//     },
//     performance: {
//       compressionLevel: 6,
//       batchSize: 100,
//       batchTimeout: 50,
//     }
//   };

//   // 사용자별 캐시 키 추적 (메모리 누수 방지)
//   private userCacheKeys = new Map<string, Set<string>>();
  
//   // 성능 측정용
//   private responseTimes: number[] = [];

//   constructor(
//     @InjectRedis() private readonly redis: Redis,
//     private readonly distributedLock: RedisDistributedLockService,
//     private readonly cleanupService: CacheCleanupService,
//     private readonly pipelineService: RedisPipelineService,
//   ) {
//     this.initializeMemoryCache();
//   }

//   async onModuleInit() {
//     await this.initializeRedisConnection();
//     this.startPerformanceMonitoring();
//     this.logger.log('Improved TableDataCacheService initialized');
//   }

//   async onModuleDestroy() {
//     this.stopPerformanceMonitoring();
//     await this.cleanupResources();
//     this.logger.log('Improved TableDataCacheService destroyed');
//   }

//   /**
//    * 개선된 GPT용 데이터 조회 - Redis 분산 락 기반 Cache Stampede 방지
//    */
//   async getGPTReadyData(
//     userId: string,
//     spreadSheetData: SpreadSheetStructure,
//     options: CacheOptions = {}
//   ): Promise<CacheResult<GPTReadyData>> {
//     const startTime = Date.now();
//     this.stats.totalRequests++;
    
//     try {
//       // 캐시 키 생성
//       const dataHash = this.generateDataHash(JSON.stringify(spreadSheetData));
//       const optionsHash = this.generateOptionsHash(options);
//       const cacheKey = this.generateCacheKey(userId, dataHash, optionsHash);

//       // L1: 메모리 캐시 확인
//       const memoryResult = await this.checkMemoryCache(cacheKey, userId);
//       if (memoryResult) {
//         this.recordHit('l1', startTime);
//         return {
//           data: memoryResult,
//           source: 'memory',
//           timing: Date.now() - startTime,
//           cached: true
//         };
//       }

//       // L2: Redis 캐시 확인
//       const redisResult = await this.checkRedisCache(cacheKey);
//       if (redisResult) {
//         await this.updateMemoryCache(cacheKey, userId, redisResult, options);
//         this.recordHit('l2', startTime);
//         return {
//           data: redisResult,
//           source: 'redis',
//           timing: Date.now() - startTime,
//           cached: true
//         };
//       }

//       // L3: 분산 락 기반 실시간 생성
//       return await this.generateWithDistributedLock(
//         cacheKey, 
//         userId, 
//         spreadSheetData, 
//         options, 
//         startTime
//       );

//     } catch (error) {
//       const safeError = createSafeError(error);
//       this.logger.error(`Cache operation failed: ${safeError.message}`, safeError.details);
//       throw error;
//     }
//   }

//   /**
//    * Redis 분산 락을 사용한 안전한 데이터 생성
//    */
//   private async generateWithDistributedLock(
//     cacheKey: string,
//     userId: string,
//     spreadSheetData: SpreadSheetStructure,
//     options: CacheOptions,
//     startTime: number
//   ): Promise<CacheResult<GPTReadyData>> {
//     const lockKey = `generate:${cacheKey}`;
    
//     // 진행 중인 요청 확인 (개선된 타임스탬프 기반)
//     const existingRequest = this.pendingRequests.get(cacheKey);
//     if (existingRequest) {
//       const age = Date.now() - existingRequest.timestamp;
      
//       if (age < this.config.redis.lockTimeout * 2) { // 2배 시간까지 대기
//         try {
//           this.stats.stampedePrevented++;
//           this.logger.debug(`Cache stampede prevented for key: ${cacheKey}`);
          
//           const data = await existingRequest.promise;
//           this.recordHit('l2', startTime);
//           return {
//             data,
//             source: 'pending',
//             timing: Date.now() - startTime,
//             cached: false
//           };
//         } catch (error) {
//           // 진행 중인 요청이 실패한 경우 정리하고 새로 시도
//           this.pendingRequests.delete(cacheKey);
//           this.logger.warn(`Pending request failed for ${cacheKey}, retrying`);
//         }
//       } else {
//         // 너무 오래된 요청은 정리
//         this.pendingRequests.delete(cacheKey);
//         this.logger.warn(`Cleaned up stale pending request: ${cacheKey}`);
//       }
//     }

//     // 분산 락 획득 시도
//     const unlock = await this.distributedLock.acquireLock(
//       lockKey,
//       this.config.redis.lockTtl,
//       this.config.redis.lockTimeout
//     );

//     if (!unlock) {
//       this.stats.lockFailures++;
      
//       // 락 획득 실패 시 다른 인스턴스의 결과 대기
//       await this.sleep(100); // 짧은 대기
      
//       // 다시 캐시 확인
//       const retryResult = await this.checkMemoryCache(cacheKey, userId) ||
//                           await this.checkRedisCache(cacheKey);
      
//       if (retryResult) {
//         return {
//           data: retryResult,
//           source: 'memory',
//           timing: Date.now() - startTime,
//           cached: true
//         };
//       }
      
//       // 여전히 없으면 락 없이 생성 (fallback)
//       this.logger.warn(`Lock acquisition failed for ${cacheKey}, proceeding without lock`);
//     }

//     try {
//       // 데이터 생성 Promise 등록
//       const generationPromise = this.generateFreshDataSafely(
//         cacheKey, 
//         userId, 
//         spreadSheetData, 
//         options
//       );

//       this.pendingRequests.set(cacheKey, {
//         promise: generationPromise,
//         timestamp: Date.now(),
//         lockKey: unlock ? lockKey : undefined
//       });

//       const freshData = await generationPromise;
      
//       this.recordMiss(startTime);
//       return {
//         data: freshData,
//         source: 'generated',
//         timing: Date.now() - startTime,
//         cached: false
//       };

//     } finally {
//       // 정리 작업
//       this.pendingRequests.delete(cacheKey);
//       if (unlock) {
//         await unlock().catch(err => 
//           this.logger.warn(`Lock release failed: ${err.message}`)
//         );
//       }
//     }
//   }

//   /**
//    * 안전한 데이터 생성 (에러 처리 강화)
//    */
//   private async generateFreshDataSafely(
//     cacheKey: string,
//     userId: string,
//     spreadSheetData: SpreadSheetStructure,
//     options: CacheOptions
//   ): Promise<GPTReadyData> {
//     try {
//       const freshData = await this.generateFreshData(spreadSheetData, options);
      
//       // 백그라운드에서 캐시 저장 (non-blocking)
//       this.updateAllCachesSafely(cacheKey, userId, freshData, options, spreadSheetData)
//         .catch(error => 
//           this.logger.error(`Background cache update failed: ${error.message}`)
//         );
      
//       return freshData;
//     } catch (error) {
//       this.logger.error(`Fresh data generation failed for ${cacheKey}: ${error.message}`);
//       throw error;
//     }
//   }

//   /**
//    * 안전한 모든 캐시 업데이트
//    */
//   private async updateAllCachesSafely(
//     cacheKey: string,
//     userId: string,
//     data: GPTReadyData,
//     options: CacheOptions,
//     originalData: SpreadSheetStructure
//   ): Promise<void> {
//     try {
//       // 메모리 캐시 우선 업데이트
//       await this.updateMemoryCache(cacheKey, userId, data, options);
      
//       // Redis 캐시 업데이트 (에러가 발생해도 메모리 캐시는 유지)
//       await this.updateRedisCacheSafely(cacheKey, userId, data, options);
      
//     } catch (error) {
//       this.logger.error(`Cache update failed for ${cacheKey}: ${error.message}`);
//     }
//   }

//   /**
//    * 안전한 Redis 캐시 업데이트
//    */
//   private async updateRedisCacheSafely(
//     cacheKey: string,
//     userId: string,
//     data: GPTReadyData,
//     options: CacheOptions
//   ): Promise<void> {
//     const result = await this.pipelineService.safeExecute(
//       'setex',
//       [
//         `${this.config.redis.keyPrefix}${cacheKey}`,
//         this.config.redis.ttl,
//         await this.serializeForRedis(data, userId, options)
//       ],
//       3, // 3번 재시도
//       100 // 100ms 지연
//     );

//     if (!result.success) {
//       this.logger.warn(`Redis cache update failed: ${result.error?.message}`);
//     }
//   }

//   /**
//    * 개선된 캐시 무효화 (Pipeline 사용)
//    */
//   async invalidateOnDelta(userId: string, delta: CellDelta): Promise<InvalidationResult> {
//     try {
//       const affectedSheet = delta.sheetName;
//       const userKeys = this.userCacheKeys.get(userId) || new Set();
//       const keysToInvalidate: string[] = [];

//       // 영향받은 캐시 키들 수집
//       for (const cacheKey of userKeys) {
//         const entry = this.memoryCache?.get?.(cacheKey);
//         if (entry && entry.dependencies.affectedSheets.has(affectedSheet)) {
//           keysToInvalidate.push(cacheKey);
          
//           // 메모리 캐시에서 제거
//           this.memoryCache?.delete?.(cacheKey);
//         }
//       }

//       // Redis에서 배치 삭제
//       let redisDeleteCount = 0;
//       if (keysToInvalidate.length > 0) {
//         const redisKeys = keysToInvalidate.map(key => `${this.config.redis.keyPrefix}${key}`);
//         const pipelineResult = await this.pipelineService.batchDelete(redisKeys);
//         redisDeleteCount = pipelineResult.successCount;
        
//         if (pipelineResult.failureCount > 0) {
//           this.logger.warn(`Redis batch delete partially failed: ${pipelineResult.failureCount} failures`);
//         }
//       }

//       // 사용자 캐시 키 목록 업데이트
//       this.updateUserCacheKeys(userId, keysToInvalidate);

//       this.logger.debug(
//         `Invalidated ${keysToInvalidate.length} cache entries for user ${userId}, sheet ${affectedSheet}`
//       );

//       return {
//         success: true,
//         invalidatedCount: keysToInvalidate.length,
//         affectedSheets: [affectedSheet]
//       };

//     } catch (error) {
//       const safeError = createSafeError(error);
//       this.logger.error(`Cache invalidation failed: ${safeError.message}`, safeError.details);
//       return {
//         success: false,
//         invalidatedCount: 0,
//         affectedSheets: [],
//         error: safeError.message
//       };
//     }
//   }

//   /**
//    * 개선된 캐시 최적화 (자동 정리 통합)
//    */
//   async optimizeCache(userId?: string): Promise<OptimizationResult> {
//     try {
//       // 정리 대상 준비
//       const cleanupTarget: CleanupTarget = {
//         userCacheKeys: this.userCacheKeys,
//         responseTimes: this.responseTimes,
//         pendingRequests: this.pendingRequests as Map<string, { promise: Promise<any>; timestamp: number }>,
//         memoryCache: this.memoryCache
//       };

//       if (userId) {
//         // 특정 사용자 최적화
//         const userCleanup = this.cleanupService.cleanupUserCacheKeys(
//           new Map([[userId, this.userCacheKeys.get(userId) || new Set()]]),
//           this.memoryCache
//         );
        
//         return {
//           success: true,
//           optimizedCount: userCleanup.cleanedKeys,
//           freedMemory: 0,
//           currentMemoryUsage: this.getCurrentMemoryUsage()
//         };
//       } else {
//         // 전체 최적화
//         const cleanupResult = this.cleanupService.performFullCleanup(cleanupTarget);
//         const totalOptimized = cleanupResult.userCleanup.cleanedKeys + 
//                               cleanupResult.responseTimesCleanup + 
//                               cleanupResult.pendingRequestsCleanup;

//         return {
//           success: true,
//           optimizedCount: totalOptimized,
//           freedMemory: cleanupResult.userCleanup.cleanedKeys * 1000, // 추정
//           currentMemoryUsage: this.getCurrentMemoryUsage()
//         };
//       }

//     } catch (error) {
//       const safeError = createSafeError(error);
//       this.logger.error(`Cache optimization failed: ${safeError.message}`, safeError.details);
//       return {
//         success: false,
//         optimizedCount: 0,
//         freedMemory: 0,
//         currentMemoryUsage: this.getCurrentMemoryUsage(),
//         error: safeError.message
//       };
//     }
//   }

//   /**
//    * 향상된 캐시 메트릭스
//    */
//   getCacheMetrics(): CacheMetrics & { 
//     stampedePrevented: number; 
//     lockFailures: number;
//     pendingRequestsCount: number;
//     memoryEstimate: ReturnType<CacheCleanupService['estimateMemoryUsage']>;
//   } {
//     const baseMetrics = this.calculateBaseMetrics();
//     const memoryEstimate = this.cleanupService.estimateMemoryUsage({
//       userCacheKeys: this.userCacheKeys,
//       responseTimes: this.responseTimes,
//       pendingRequests: this.pendingRequests as any,
//       memoryCache: this.memoryCache
//     });

//     return {
//       ...baseMetrics,
//       stampedePrevented: this.stats.stampedePrevented,
//       lockFailures: this.stats.lockFailures,
//       pendingRequestsCount: this.pendingRequests.size,
//       memoryEstimate
//     };
//   }

//   // ===== 기존 메서드들 (개선된 버전) =====

//   private initializeMemoryCache(): void {
//     this.memoryCache = new LRUCache({
//       max: this.config.memory.maxSize,
//       maxAge: this.config.memory.maxAge,
//       updateAgeOnGet: true,
//       dispose: (entry: MemoryCacheEntry, key: string) => {
//         this.onCacheEvict(entry, key);
//       }
//     });
//   }

//   private async initializeRedisConnection(): Promise<void> {
//     const healthCheck = await this.pipelineService.healthCheck();
//     if (!healthCheck.healthy) {
//       throw new Error(`Redis connection failed: ${healthCheck.error}`);
//     }
//     this.logger.log(`Redis connection established (latency: ${healthCheck.latency}ms)`);
//   }

//   private startPerformanceMonitoring(): void {
//     setInterval(() => {
//       this.performPeriodicMaintenance();
//     }, 60000); // 1분마다
//   }

//   private stopPerformanceMonitoring(): void {
//     // interval은 onModuleDestroy에서 자동으로 정리됨
//   }

//   private async performPeriodicMaintenance(): Promise<void> {
//     try {
//       // 자동 정리 수행
//       await this.optimizeCache();
      
//       // 메모리 사용량 업데이트
//       this.stats.memoryUsage = this.getCurrentMemoryUsage();
      
//     } catch (error) {
//       this.logger.error(`Periodic maintenance failed: ${error.message}`);
//     }
//   }

//   private async cleanupResources(): Promise<void> {
//     // 메모리 캐시 정리
//     this.memoryCache?.reset?.();
    
//     // Pending requests 정리
//     this.pendingRequests.clear();
    
//     // 사용자 캐시 키 정리
//     this.userCacheKeys.clear();
    
//     // Redis 연결 종료
//     await this.redis.quit().catch(err => 
//       this.logger.warn(`Redis quit failed: ${err.message}`)
//     );
//   }

//   // ===== 헬퍼 메서드들 =====

//   private sleep(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
//   }

//   private updateUserCacheKeys(userId: string, keysToRemove: string[]): void {
//     const userKeys = this.userCacheKeys.get(userId);
//     if (userKeys) {
//       for (const key of keysToRemove) {
//         userKeys.delete(key);
//       }
//       if (userKeys.size === 0) {
//         this.userCacheKeys.delete(userId);
//       }
//     }
//   }

//   private async serializeForRedis(
//     data: GPTReadyData, 
//     userId: string, 
//     options: CacheOptions
//   ): Promise<string> {
//     const dataString = JSON.stringify(data);
//     const originalSize = dataString.length;
    
//     let compressedData: Buffer;
//     if (originalSize > this.config.redis.compressionThreshold) {
//       compressedData = await gzip(dataString);
//     } else {
//       compressedData = Buffer.from(dataString);
//     }

//     const entry: RedisCacheEntry = {
//       compressedData,
//       metadata: {
//         userId,
//         dataVersion: 1,
//         optionsHash: this.generateOptionsHash(options),
//         originalSize,
//         compressedSize: compressedData.length,
//         createdAt: new Date().toISOString(),
//         ttl: this.config.redis.ttl
//       },
//       checksum: this.generateDataHash(compressedData)
//     };

//     return JSON.stringify(entry);
//   }

//   // ===== 기존 메서드들 (수정 없음) =====
  
//   private async checkMemoryCache(cacheKey: string, userId: string): Promise<GPTReadyData | null> {
//     const entry = this.memoryCache?.get?.(cacheKey);
//     if (!entry) {
//       this.stats.l1Misses++;
//       return null;
//     }

//     if (entry.metadata.userId !== userId) {
//       this.memoryCache?.delete?.(cacheKey);
//       this.stats.l1Misses++;
//       return null;
//     }

//     entry.metadata.lastAccessed = Date.now();
//     entry.metadata.hitCount++;
//     this.stats.l1Hits++;
    
//     return entry.data;
//   }

//   private async checkRedisCache(cacheKey: string): Promise<GPTReadyData | null> {
//     const result = await this.pipelineService.safeExecute(
//       'get',
//       [`${this.config.redis.keyPrefix}${cacheKey}`]
//     );

//     if (!result.success || !result.data) {
//       this.stats.l2Misses++;
//       return null;
//     }

//     try {
//       if (typeof result.data !== 'string') {
//         this.stats.l2Misses++;
//         return null;
//       }
//       const entry: RedisCacheEntry = JSON.parse(result.data);
      
//       // 체크섬 검증
//       const currentChecksum = this.generateDataHash(entry.compressedData);
//       if (currentChecksum !== entry.checksum) {
//         this.stats.l2Misses++;
//         return null;
//       }

//       // 압축 해제
//       const decompressed = await gunzip(entry.compressedData);
//       const data: GPTReadyData = JSON.parse(decompressed.toString());
      
//       this.stats.l2Hits++;
//       return data;

//     } catch (error) {
//       this.stats.l2Misses++;
//       return null;
//     }
//   }

//   private async generateFreshData(
//     spreadSheetData: SpreadSheetStructure,
//     options: CacheOptions
//   ): Promise<GPTReadyData> {
//     return await this.parseForGPT(spreadSheetData, {
//       includeFormulas: options.includeFormulas,
//       includeStyles: options.includeStyles,
//       maxSheets: options.maxSheets,
//       sheetNames: options.sheetNames
//     });
//   }

//   private async parseForGPT(
//     data: SpreadSheetStructure,
//     options: ParsingOptions
//   ): Promise<GPTReadyData> {
//     const sheets = new Map<string, GPTSheetData>();
//     let totalCells = 0;

//     if (data.sheets) {
//       for (const [sheetName, sheet] of Object.entries(data.sheets)) {
//         if (options.sheetNames && !options.sheetNames.includes(sheetName)) {
//           continue;
//         }

//         if (options.maxSheets && sheets.size >= options.maxSheets) {
//           break;
//         }

//         if (sheet.data?.dataTable) {
//           const cellCount = Object.keys(sheet.data.dataTable).length;
//           if (cellCount > 0) {
//             sheets.set(sheetName, {
//               csvData: this.convertToCSV(sheet.data.dataTable),
//               cellCount,
//               metadata: {
//                 name: sheetName,
//                 cellCount,
//                 includeFormulas: options.includeFormulas,
//                 includeStyles: options.includeStyles
//               }
//             });
//             totalCells += cellCount;
//           }
//         }
//       }
//     }

//     return {
//       sheets,
//       totalCells,
//       dataHash: this.generateDataHash(JSON.stringify(data)),
//       parsedAt: new Date(),
//       options: options
//     };
//   }

//   private convertToCSV(dataTable: DataTable): string {
//     const cells = Object.entries(dataTable)
//       .map(([address, cell]) => ({
//         address,
//         row: this.parseRowFromAddress(address),
//         col: this.parseColFromAddress(address),
//         value: cell.value || cell.formula || ''
//       }))
//       .sort((a, b) => a.row - b.row || a.col - b.col);

//     if (cells.length === 0) return '';

//     const maxRow = Math.max(...cells.map(c => c.row));
//     const maxCol = Math.max(...cells.map(c => c.col));
    
//     const rows: string[][] = [];
//     for (let r = 0; r <= maxRow; r++) {
//       rows[r] = new Array(maxCol + 1).fill('');
//     }

//     for (const cell of cells) {
//       rows[cell.row][cell.col] = String(cell.value || '');
//     }

//     return rows
//       .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
//       .join('\n');
//   }

//   private async updateMemoryCache(
//     cacheKey: string,
//     userId: string,
//     data: GPTReadyData,
//     options: CacheOptions
//   ): Promise<void> {
//     const size = this.estimateDataSize(data);
//     const optionsHash = this.generateOptionsHash(options);
    
//     const entry: MemoryCacheEntry = {
//       key: cacheKey,
//       data,
//       metadata: {
//         userId,
//         dataVersion: 1,
//         optionsHash,
//         createdAt: Date.now(),
//         lastAccessed: Date.now(),
//         hitCount: 0,
//         size
//       },
//       dependencies: {
//         affectedSheets: new Set(data.sheets.keys()),
//         deltaTimestamp: Date.now()
//       }
//     };

//     this.memoryCache?.set?.(cacheKey, entry);

//     if (!this.userCacheKeys.has(userId)) {
//       this.userCacheKeys.set(userId, new Set());
//     }
//     this.userCacheKeys.get(userId)!.add(cacheKey);
//   }

//   private onCacheEvict(entry: MemoryCacheEntry, key: string): void {
//     const userKeys = this.userCacheKeys.get(entry.metadata.userId);
//     if (userKeys) {
//       userKeys.delete(key);
//       if (userKeys.size === 0) {
//         this.userCacheKeys.delete(entry.metadata.userId);
//       }
//     }
//   }

//   private generateCacheKey(userId: string, dataHash: string, optionsHash: string): string {
//     return `${userId}:${dataHash}:${optionsHash}`;
//   }

//   private generateOptionsHash(options: CacheOptions): string {
//     const optionsString = JSON.stringify(options, Object.keys(options).sort());
//     return createHash('md5').update(optionsString).digest('hex');
//   }

//   private generateDataHash(data: string | Buffer): string {
//     return createHash('sha256').update(data).digest('hex');
//   }

//   private recordHit(level: 'l1' | 'l2', startTime: number): void {
//     const responseTime = Date.now() - startTime;
//     this.responseTimes.push(responseTime);
    
//     if (level === 'l1') {
//       this.stats.l1Hits++;
//     } else {
//       this.stats.l2Hits++;
//     }
//   }

//   private recordMiss(startTime: number): void {
//     const responseTime = Date.now() - startTime;
//     this.responseTimes.push(responseTime);
//   }

//   private getCurrentMemoryUsage(): number {
//     let totalSize = 0;
//     if (this.memoryCache && typeof this.memoryCache.values === 'function') {
//       for (const entry of this.memoryCache.values()) {
//         totalSize += entry.metadata.size;
//       }
//     }
//     return totalSize;
//   }

//   private estimateDataSize(data: GPTReadyData): number {
//     return JSON.stringify(data).length;
//   }

//   private calculateBaseMetrics(): CacheMetrics {
//     const l1HitRate = this.stats.totalRequests > 0 ? 
//       (this.stats.l1Hits / this.stats.totalRequests) * 100 : 0;
//     const l2HitRate = this.stats.totalRequests > 0 ? 
//       (this.stats.l2Hits / this.stats.totalRequests) * 100 : 0;
//     const overallHitRate = this.stats.totalRequests > 0 ? 
//       ((this.stats.l1Hits + this.stats.l2Hits) / this.stats.totalRequests) * 100 : 0;

//     return {
//       l1HitRate,
//       l2HitRate,
//       overallHitRate,
//       avgResponseTime: this.calculateAverageResponseTime(),
//       p95ResponseTime: this.calculatePercentileResponseTime(95),
//       p99ResponseTime: this.calculatePercentileResponseTime(99),
//       memoryUsage: this.getCurrentMemoryUsage(),
//       memoryHitCount: this.stats.l1Hits,
//       redisLatency: 0,
//       redisConnectionCount: 1,
//     };
//   }

//   private calculateAverageResponseTime(): number {
//     if (this.responseTimes.length === 0) return 0;
//     const sum = this.responseTimes.reduce((a, b) => a + b, 0);
//     return sum / this.responseTimes.length;
//   }

//   private calculatePercentileResponseTime(percentile: number): number {
//     if (this.responseTimes.length === 0) return 0;
    
//     const sorted = [...this.responseTimes].sort((a, b) => a - b);
//     const index = Math.ceil((percentile / 100) * sorted.length) - 1;
//     return sorted[Math.max(0, index)];
//   }

//   private parseRowFromAddress(address: string): number {
//     const match = address.match(/^[A-Z]+(\d+)$/);
//     return match ? parseInt(match[1]) - 1 : 0;
//   }

//   private parseColFromAddress(address: string): number {
//     const match = address.match(/^([A-Z]+)\d+$/);
//     if (!match) return 0;
    
//     let result = 0;
//     const col = match[1];
//     for (let i = 0; i < col.length; i++) {
//       result = result * 26 + (col.charCodeAt(i) - 64);
//     }
//     return result - 1;
//   }
// }