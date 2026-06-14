import { createSocketErrorPayload } from './socket-error-payload';

describe('createSocketErrorPayload', () => {
  it('adds timestamp when one is not provided', () => {
    expect(
      createSocketErrorPayload({
        code: 'VALIDATION_ERROR',
        message: 'MISSING_REQUIRED_PARAMETERS',
      }),
    ).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'MISSING_REQUIRED_PARAMETERS',
      timestamp: expect.any(String),
    });
  });

  it('preserves explicit timestamp', () => {
    expect(
      createSocketErrorPayload({
        code: 'RATE_LIMIT_EXCEEDED',
        timestamp: 'now',
      }),
    ).toMatchObject({
      code: 'RATE_LIMIT_EXCEEDED',
      timestamp: 'now',
    });
  });
});
