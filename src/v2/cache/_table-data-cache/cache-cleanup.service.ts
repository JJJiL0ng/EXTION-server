import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

export interface CacheCleanupConfig {
  maxUserCacheSize: number;
  maxUserCacheAge: number;
  maxResponseTimesCount: number;
  maxPendingRequestAge: number;
  cleanupIntervalMs: number;
}

export interface CleanupTarget {
  userCacheKeys: Map<string, Set<string>>;
  responseTimes: number[];
  pendingRequests: Map<string, { promise: Promise<any>; timestamp: number }>;
  memoryCache: any;
}

@Injectable()
export class CacheCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheCleanupService.name);
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  private readonly config: CacheCleanupConfig = {
    maxUserCacheSize: 100, // 사용자당 최대 캐시 엔트리 수
    maxUserCacheAge: 30 * 60 * 1000, // 30분
    maxResponseTimesCount: 1000,
    maxPendingRequestAge: 2 * 60 * 1000, // 2분
    cleanupIntervalMs: 5 * 60 * 1000, // 5분마다 정리
  };

  async onModuleInit() {
    this.startPeriodicCleanup();
    this.logger.log('Cache cleanup service initialized');
  }

  async onModuleDestroy() {
    this.stopPeriodicCleanup();
    this.logger.log('Cache cleanup service destroyed');
  }

  /**
   * 주기적 정리 시작
   */
  private startPeriodicCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.performScheduledCleanup();
    }, this.config.cleanupIntervalMs);
  }

  /**
   * 주기적 정리 중지
   */
  private stopPeriodicCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * 예약된 정리 작업 수행
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async performScheduledCleanup(): Promise<void> {
    try {
      this.logger.debug('Starting scheduled cache cleanup');
      // 실제 정리는 main service에서 호출
    } catch (error) {
      this.logger.error(`Scheduled cleanup failed: ${error.message}`);
    }
  }

  /**
   * 사용자 캐시 키 맵 정리
   */
  cleanupUserCacheKeys(
    userCacheKeys: Map<string, Set<string>>,
    memoryCache: any
  ): { cleanedUsers: number; cleanedKeys: number } {
    let cleanedUsers = 0;
    let cleanedKeys = 0;
    const now = Date.now();

    for (const [userId, keySet] of Array.from(userCacheKeys.entries())) {
      const validKeys = new Set<string>();
      
      for (const key of keySet) {
        const entry = memoryCache?.get?.(key);
        
        if (entry) {
          // 캐시 엔트리가 존재하고 유효한 경우
          const age = now - entry.metadata.createdAt;
          if (age < this.config.maxUserCacheAge) {
            validKeys.add(key);
          } else {
            // 만료된 캐시 제거
            memoryCache?.delete?.(key);
            cleanedKeys++;
          }
        } else {
          // 메모리 캐시에 없는 키 제거
          cleanedKeys++;
        }
      }

      // 사용자 캐시 키 수 제한
      if (validKeys.size > this.config.maxUserCacheSize) {
        const keysArray = Array.from(validKeys);
        const excessKeys = keysArray.slice(this.config.maxUserCacheSize);
        
        for (const key of excessKeys) {
          memoryCache?.delete?.(key);
          validKeys.delete(key);
          cleanedKeys++;
        }
      }

      if (validKeys.size === 0) {
        userCacheKeys.delete(userId);
        cleanedUsers++;
      } else {
        userCacheKeys.set(userId, validKeys);
      }
    }

    if (cleanedUsers > 0 || cleanedKeys > 0) {
      this.logger.debug(`Cleaned up ${cleanedUsers} users and ${cleanedKeys} keys`);
    }

    return { cleanedUsers, cleanedKeys };
  }

  /**
   * 응답 시간 배열 정리
   */
  cleanupResponseTimes(responseTimes: number[]): number {
    const originalLength = responseTimes.length;
    
    if (originalLength > this.config.maxResponseTimesCount) {
      const excessCount = originalLength - this.config.maxResponseTimesCount;
      responseTimes.splice(0, excessCount);
      
      this.logger.debug(`Cleaned up ${excessCount} old response time entries`);
      return excessCount;
    }
    
    return 0;
  }

  /**
   * 오래된 Pending Request 정리
   */
  cleanupPendingRequests(
    pendingRequests: Map<string, { promise: Promise<any>; timestamp: number }>
  ): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, request] of Array.from(pendingRequests.entries())) {
      const age = now - request.timestamp;
      
      if (age > this.config.maxPendingRequestAge) {
        pendingRequests.delete(key);
        cleanedCount++;
        
        // Promise가 아직 pending 상태라면 경고 로그
        this.logger.warn(`Cleaned up stale pending request: ${key} (age: ${age}ms)`);
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned up ${cleanedCount} stale pending requests`);
    }

    return cleanedCount;
  }

  /**
   * 전체 정리 작업 수행
   */
  performFullCleanup(target: CleanupTarget): {
    userCleanup: { cleanedUsers: number; cleanedKeys: number };
    responseTimesCleanup: number;
    pendingRequestsCleanup: number;
  } {
    const userCleanup = this.cleanupUserCacheKeys(target.userCacheKeys, target.memoryCache);
    const responseTimesCleanup = this.cleanupResponseTimes(target.responseTimes);
    const pendingRequestsCleanup = this.cleanupPendingRequests(target.pendingRequests);

    const totalCleaned = userCleanup.cleanedKeys + responseTimesCleanup + pendingRequestsCleanup;
    
    if (totalCleaned > 0) {
      this.logger.log(`Full cleanup completed: ${totalCleaned} items cleaned`);
    }

    return {
      userCleanup,
      responseTimesCleanup,
      pendingRequestsCleanup
    };
  }

  /**
   * 메모리 사용량 추정
   */
  estimateMemoryUsage(target: CleanupTarget): {
    userCacheKeysSize: number;
    responseTimesSize: number;
    pendingRequestsSize: number;
    totalEstimatedSize: number;
  } {
    // 간단한 메모리 사용량 추정
    let userCacheKeysSize = 0;
    for (const [userId, keySet] of Array.from(target.userCacheKeys.entries())) {
      userCacheKeysSize += userId.length * 2; // String overhead
      userCacheKeysSize += keySet.size * 50; // Set overhead + average key length
    }

    const responseTimesSize = target.responseTimes.length * 8; // Number = 8 bytes
    
    let pendingRequestsSize = 0;
    for (const [key] of Array.from(target.pendingRequests.entries())) {
      pendingRequestsSize += key.length * 2 + 100; // String + Promise overhead estimate
    }

    const totalEstimatedSize = userCacheKeysSize + responseTimesSize + pendingRequestsSize;

    return {
      userCacheKeysSize,
      responseTimesSize,
      pendingRequestsSize,
      totalEstimatedSize
    };
  }

  /**
   * 정리 통계 조회
   */
  getCleanupStats(): CacheCleanupConfig {
    return { ...this.config };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(newConfig: Partial<CacheCleanupConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Cleanup configuration updated');
  }
}