import { SetMetadata } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitConfig } from '../guards/rate-limit.guard';

/**
 * Rate Limit 데코레이터
 * 엔드포인트별로 커스텀 Rate Limit 설정 가능
 *
 * @example
 * // 1분당 10개 요청, 5분 차단
 * @RateLimit({ windowMs: 60000, maxRequests: 10, blockDurationMs: 300000 })
 * @Post('create')
 * async create() { ... }
 *
 * @example
 * // 30초당 5개 요청 (더 엄격한 제한)
 * @RateLimit({ windowMs: 30000, maxRequests: 5, blockDurationMs: 600000 })
 * @Post('add-version')
 * async addVersion() { ... }
 */
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

/**
 * 사전 정의된 Rate Limit 프리셋
 */
export const RateLimitPresets = {
  /** 일반 작업: 1분당 30개 요청, 5분 차단 */
  STANDARD: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    blockDurationMs: 5 * 60 * 1000,
  },

  /** 쓰기 작업: 1분당 20개 요청, 10분 차단 (더 엄격) */
  WRITE_OPERATION: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    blockDurationMs: 10 * 60 * 1000,
  },

  /** 읽기 작업: 1분당 60개 요청, 3분 차단 (더 관대) */
  READ_OPERATION: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    blockDurationMs: 3 * 60 * 1000,
  },

  /** 중요 작업: 1분당 10개 요청, 15분 차단 (매우 엄격) */
  CRITICAL_OPERATION: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    blockDurationMs: 15 * 60 * 1000,
  },

  /** 대용량 작업: 5분당 5개 요청, 30분 차단 */
  HEAVY_OPERATION: {
    windowMs: 5 * 60 * 1000,
    maxRequests: 5,
    blockDurationMs: 30 * 60 * 1000,
  },
};
