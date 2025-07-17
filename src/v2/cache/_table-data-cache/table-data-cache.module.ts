import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

// 기존 서비스
import { TableDataCacheService } from './table-data-cache.service';
import { TableDataCacheController } from './table-data-cache.controller';

// 개선된 서비스들
import { TableDataCacheImprovedService } from './table-data-cache-improved.service';
import { RedisDistributedLockService } from './redis-distributed-lock.service';
import { CacheCleanupService } from './cache-cleanup.service';
import { RedisPipelineService } from './redis-pipeline.service';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Cron 작업을 위한 스케줄 모듈
  ],
  controllers: [TableDataCacheController],
  providers: [
    // 기존 서비스 (호환성 유지)
    TableDataCacheService,
    
    // 개선된 서비스들
    TableDataCacheImprovedService,
    RedisDistributedLockService,
    CacheCleanupService,
    RedisPipelineService,
  ],
  exports: [
    TableDataCacheService,
    TableDataCacheImprovedService,
    RedisDistributedLockService,
    CacheCleanupService,
    RedisPipelineService,
  ],
})
export class TableDataCacheModule {}
