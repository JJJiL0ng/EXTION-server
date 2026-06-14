import { AiChatRateLimitService } from './ai-chat-rate-limit.service';

describe('AiChatRateLimitService', () => {
  let service: AiChatRateLimitService;

  beforeEach(() => {
    service = new AiChatRateLimitService();
  });

  it('blocks a user after the per-minute user limit', () => {
    for (let i = 0; i < 10; i++) {
      expect(service.check('user-1', `10.0.0.${i}`, 1000 + i).blocked).toBe(false);
    }

    expect(service.check('user-1', '10.0.0.99', 1011)).toMatchObject({
      blocked: true,
      reason: 'USER_RATE_LIMIT_EXCEEDED',
      retryAfter: 300,
    });
  });

  it('blocks an IP after the per-minute IP limit', () => {
    for (let i = 0; i < 20; i++) {
      expect(service.check(`user-${i}`, '10.0.0.1', 1000 + i).blocked).toBe(false);
    }

    expect(service.check('user-21', '10.0.0.1', 1021)).toMatchObject({
      blocked: true,
      reason: 'IP_RATE_LIMIT_EXCEEDED',
      retryAfter: 300,
    });
  });

  it('cleans stale tracking data', () => {
    service.check('user-1', '10.0.0.1', 1000);

    expect(service.cleanup(122001)).toEqual({
      userCleanedCount: 1,
      ipCleanedCount: 1,
    });
  });
});
