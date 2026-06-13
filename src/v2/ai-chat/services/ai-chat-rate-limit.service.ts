import { Injectable, Logger } from '@nestjs/common';

export interface RateLimitCheckResult {
  blocked: boolean;
  reason?: 'USER_RATE_LIMIT_EXCEEDED' | 'IP_RATE_LIMIT_EXCEEDED';
  retryAfter?: number;
}

export interface RateLimitCleanupResult {
  userCleanedCount: number;
  ipCleanedCount: number;
}

interface RequestTracking {
  requestTimestamps: number[];
  blockedUntil?: number;
}

const RATE_LIMIT_CONFIG = {
  USER_REQUESTS_PER_MINUTE: 10,
  IP_REQUESTS_PER_MINUTE: 20,
  BLOCK_DURATION_MS: 5 * 60 * 1000,
  TRACKING_WINDOW_MS: 60 * 1000,
};

@Injectable()
export class AiChatRateLimitService {
  private readonly logger = new Logger(AiChatRateLimitService.name);
  private readonly userRequestTracking = new Map<string, RequestTracking>();
  private readonly ipRequestTracking = new Map<string, RequestTracking>();

  check(userId: string, clientIp: string, now = Date.now()): RateLimitCheckResult {
    const userResult = this.checkUserRateLimit(userId, now);
    if (userResult.blocked) {
      return userResult;
    }

    return this.checkIpRateLimit(clientIp, now);
  }

  cleanup(now = Date.now()): RateLimitCleanupResult {
    const userCleanedCount = this.cleanupTrackingMap(this.userRequestTracking, now);
    const ipCleanedCount = this.cleanupTrackingMap(this.ipRequestTracking, now);

    return { userCleanedCount, ipCleanedCount };
  }

  private checkUserRateLimit(userId: string, now: number): RateLimitCheckResult {
    const tracking = this.userRequestTracking.get(userId);

    if (!tracking) {
      this.userRequestTracking.set(userId, { requestTimestamps: [now] });
      return { blocked: false };
    }

    if (tracking.blockedUntil && now < tracking.blockedUntil) {
      const retryAfter = Math.ceil((tracking.blockedUntil - now) / 1000);
      this.logger.warn(`Rate Limit 차단 중 - 사용자: ${userId}, 남은 시간: ${retryAfter}초`);
      return {
        blocked: true,
        reason: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter,
      };
    }

    const recentRequests = this.getRecentRequests(tracking, now);
    if (recentRequests.length >= RATE_LIMIT_CONFIG.USER_REQUESTS_PER_MINUTE) {
      tracking.blockedUntil = now + RATE_LIMIT_CONFIG.BLOCK_DURATION_MS;
      this.logger.warn(`Rate Limit 초과 - 사용자: ${userId}, 요청 수: ${recentRequests.length}, 5분간 차단`);
      return {
        blocked: true,
        reason: 'USER_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(RATE_LIMIT_CONFIG.BLOCK_DURATION_MS / 1000),
      };
    }

    tracking.requestTimestamps = [...recentRequests, now];
    return { blocked: false };
  }

  private checkIpRateLimit(clientIp: string, now: number): RateLimitCheckResult {
    const tracking = this.ipRequestTracking.get(clientIp);

    if (!tracking) {
      this.ipRequestTracking.set(clientIp, { requestTimestamps: [now] });
      return { blocked: false };
    }

    if (tracking.blockedUntil && now < tracking.blockedUntil) {
      const retryAfter = Math.ceil((tracking.blockedUntil - now) / 1000);
      this.logger.warn(`Rate Limit 차단 중 - IP: ${clientIp}, 남은 시간: ${retryAfter}초`);
      return {
        blocked: true,
        reason: 'IP_RATE_LIMIT_EXCEEDED',
        retryAfter,
      };
    }

    const recentRequests = this.getRecentRequests(tracking, now);
    if (recentRequests.length >= RATE_LIMIT_CONFIG.IP_REQUESTS_PER_MINUTE) {
      tracking.blockedUntil = now + RATE_LIMIT_CONFIG.BLOCK_DURATION_MS;
      this.logger.warn(`Rate Limit 초과 - IP: ${clientIp}, 요청 수: ${recentRequests.length}, 5분간 차단`);
      return {
        blocked: true,
        reason: 'IP_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(RATE_LIMIT_CONFIG.BLOCK_DURATION_MS / 1000),
      };
    }

    tracking.requestTimestamps = [...recentRequests, now];
    return { blocked: false };
  }

  private getRecentRequests(tracking: RequestTracking, now: number): number[] {
    return tracking.requestTimestamps.filter(
      (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.TRACKING_WINDOW_MS,
    );
  }

  private cleanupTrackingMap(
    trackingMap: Map<string, RequestTracking>,
    now: number,
  ): number {
    let cleanedCount = 0;

    for (const [key, tracking] of trackingMap.entries()) {
      const hasRecentActivity = tracking.requestTimestamps.some(
        (timestamp) => now - timestamp < RATE_LIMIT_CONFIG.TRACKING_WINDOW_MS * 2,
      );
      const isBlockExpired = !tracking.blockedUntil || now > tracking.blockedUntil;

      if (isBlockExpired && !hasRecentActivity) {
        trackingMap.delete(key);
        cleanedCount++;
      } else if (tracking.blockedUntil && now > tracking.blockedUntil) {
        delete tracking.blockedUntil;
      }
    }

    return cleanedCount;
  }
}
