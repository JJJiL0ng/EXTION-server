import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

/**
 * API Rate Limiting을 위한 설정
 */
export interface RateLimitConfig {
  /** 추적 윈도우 (밀리초) */
  windowMs: number;
  /** 윈도우당 최대 요청 수 */
  maxRequests: number;
  /** 차단 시간 (밀리초) */
  blockDurationMs: number;
}

/**
 * Rate Limit 메타데이터 키
 */
export const RATE_LIMIT_KEY = 'rateLimitEXTIONSERVERJJJ';

/**
 * Rate Limiting Guard
 * 사용자별 API 요청 빈도를 제한하여 DDoS 및 과도한 요청 방지
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  // 사용자별 요청 추적
  private userRequestTracking = new Map<
    string, // userId
    {
      requestTimestamps: number[];
      blockedUntil?: number;
    }
  >();

  // IP별 요청 추적 (추가 보안 레이어)
  private ipRequestTracking = new Map<
    string, // IP address
    {
      requestTimestamps: number[];
      blockedUntil?: number;
    }
  >();

  // 기본 Rate Limit 설정
  private readonly DEFAULT_CONFIG: RateLimitConfig = {
    windowMs: 60 * 1000, // 1분
    maxRequests: 30, // 1분당 30개 요청
    blockDurationMs: 5 * 60 * 1000, // 5분 차단
  };

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // 메타데이터에서 커스텀 설정 가져오기
    const customConfig = this.reflector.get<RateLimitConfig>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    const config = customConfig || this.DEFAULT_CONFIG;

    // 사용자 ID 추출 (body 또는 query에서)
    const userId = this.extractUserId(request);
    if (!userId) {
      this.logger.warn(`Rate Limit Guard: userId not found in request`);
      // userId가 없으면 IP만으로 제한
      return this.checkIpRateLimit(request, config);
    }

    // IP 주소 추출
    const clientIp = this.extractClientIp(request);

    // 1. 사용자별 Rate Limiting 검증
    const userCheck = this.checkUserRateLimit(userId, config);
    if (!userCheck.allowed) {
      this.throwRateLimitException(userCheck.retryAfter!, 'USER_RATE_LIMIT_EXCEEDED');
    }

    // 2. IP별 Rate Limiting 검증
    const ipCheck = this.checkIpRateLimitInternal(clientIp, config);
    if (!ipCheck.allowed) {
      this.throwRateLimitException(ipCheck.retryAfter!, 'IP_RATE_LIMIT_EXCEEDED');
    }

    return true;
  }

  /**
   * 사용자 ID 추출
   */
  private extractUserId(request: Request): string | null {
    return (
      (request.body?.userId as string) ||
      (request.query?.userId as string) ||
      null
    );
  }

  /**
   * 클라이언트 IP 추출
   */
  private extractClientIp(request: Request): string {
    const forwarded = request.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * 사용자별 Rate Limiting 검증
   */
  private checkUserRateLimit(
    userId: string,
    config: RateLimitConfig,
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const tracking = this.userRequestTracking.get(userId);

    if (tracking) {
      // 차단 기간 확인
      if (tracking.blockedUntil && now < tracking.blockedUntil) {
        const retryAfter = Math.ceil((tracking.blockedUntil - now) / 1000);
        this.logger.warn(
          `Rate Limit 차단 중 - 사용자: ${userId}, 남은 시간: ${retryAfter}초`,
        );
        return { allowed: false, retryAfter };
      }

      // 추적 윈도우 내 요청 필터링
      const recentRequests = tracking.requestTimestamps.filter(
        (timestamp) => now - timestamp < config.windowMs,
      );

      // 제한 초과 확인
      if (recentRequests.length >= config.maxRequests) {
        tracking.blockedUntil = now + config.blockDurationMs;
        this.logger.warn(
          `Rate Limit 초과 - 사용자: ${userId}, 요청 수: ${recentRequests.length}, 차단 시작`,
        );
        return {
          allowed: false,
          retryAfter: Math.ceil(config.blockDurationMs / 1000),
        };
      }

      // 오래된 타임스탬프 제거 후 새 요청 추가
      tracking.requestTimestamps = [...recentRequests, now];
    } else {
      // 첫 요청
      this.userRequestTracking.set(userId, {
        requestTimestamps: [now],
      });
    }

    return { allowed: true };
  }

  /**
   * IP별 Rate Limiting 검증 (내부용)
   */
  private checkIpRateLimitInternal(
    ip: string,
    config: RateLimitConfig,
  ): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const tracking = this.ipRequestTracking.get(ip);

    if (tracking) {
      // 차단 기간 확인
      if (tracking.blockedUntil && now < tracking.blockedUntil) {
        const retryAfter = Math.ceil((tracking.blockedUntil - now) / 1000);
        this.logger.warn(
          `Rate Limit 차단 중 - IP: ${ip}, 남은 시간: ${retryAfter}초`,
        );
        return { allowed: false, retryAfter };
      }

      // 추적 윈도우 내 요청 필터링
      const recentRequests = tracking.requestTimestamps.filter(
        (timestamp) => now - timestamp < config.windowMs,
      );

      // IP는 더 높은 제한 적용 (여러 사용자가 같은 IP 사용 가능)
      const ipMaxRequests = config.maxRequests * 2;

      if (recentRequests.length >= ipMaxRequests) {
        tracking.blockedUntil = now + config.blockDurationMs;
        this.logger.warn(
          `Rate Limit 초과 - IP: ${ip}, 요청 수: ${recentRequests.length}, 차단 시작`,
        );
        return {
          allowed: false,
          retryAfter: Math.ceil(config.blockDurationMs / 1000),
        };
      }

      // 오래된 타임스탬프 제거 후 새 요청 추가
      tracking.requestTimestamps = [...recentRequests, now];
    } else {
      // 첫 요청
      this.ipRequestTracking.set(ip, {
        requestTimestamps: [now],
      });
    }

    return { allowed: true };
  }

  /**
   * IP만으로 Rate Limiting 검증 (userId 없을 때)
   */
  private checkIpRateLimit(
    request: Request,
    config: RateLimitConfig,
  ): boolean {
    const clientIp = this.extractClientIp(request);
    const ipCheck = this.checkIpRateLimitInternal(clientIp, config);

    if (!ipCheck.allowed) {
      this.throwRateLimitException(ipCheck.retryAfter!, 'IP_RATE_LIMIT_EXCEEDED');
    }

    return true;
  }

  /**
   * Rate Limit 예외 발생
   */
  private throwRateLimitException(retryAfter: number, reason: string): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests. Please try again later.',
        error: reason,
        retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  /**
   * 오래된 추적 데이터 정리 (메모리 누수 방지)
   * 주기적으로 호출되어야 함
   */
  public cleanupOldTracking(maxAge: number = 10 * 60 * 1000) {
    const now = Date.now();
    let userCleanedCount = 0;
    let ipCleanedCount = 0;

    // 사용자별 추적 정리
    for (const [userId, tracking] of this.userRequestTracking.entries()) {
      const hasRecentActivity = tracking.requestTimestamps.some(
        (timestamp) => now - timestamp < maxAge,
      );

      const isBlockExpired = !tracking.blockedUntil || now > tracking.blockedUntil;

      if (isBlockExpired && !hasRecentActivity) {
        this.userRequestTracking.delete(userId);
        userCleanedCount++;
      }
    }

    // IP별 추적 정리
    for (const [ip, tracking] of this.ipRequestTracking.entries()) {
      const hasRecentActivity = tracking.requestTimestamps.some(
        (timestamp) => now - timestamp < maxAge,
      );

      const isBlockExpired = !tracking.blockedUntil || now > tracking.blockedUntil;

      if (isBlockExpired && !hasRecentActivity) {
        this.ipRequestTracking.delete(ip);
        ipCleanedCount++;
      }
    }

    if (userCleanedCount > 0 || ipCleanedCount > 0) {
      this.logger.log(
        `Rate Limit 추적 데이터 정리 완료 - 사용자: ${userCleanedCount}개, IP: ${ipCleanedCount}개`,
      );
    }
  }
}
