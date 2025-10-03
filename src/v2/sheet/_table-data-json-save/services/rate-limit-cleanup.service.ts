import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RateLimitGuard } from '../guards/rate-limit.guard';

/**
 * Rate Limit 추적 데이터 자동 정리 서비스
 */
@Injectable()
export class RateLimitCleanupService {
  private readonly logger = new Logger(RateLimitCleanupService.name);

  constructor(private readonly rateLimitGuard: RateLimitGuard) {}

  /**
   * 10분마다 오래된 Rate Limit 추적 데이터 정리
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  handleCleanup() {
    this.logger.log('Rate Limit 추적 데이터 정리 시작');
    this.rateLimitGuard.cleanupOldTracking();
  }
}
