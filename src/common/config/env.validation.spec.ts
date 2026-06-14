import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  it('normalizes valid runtime env values', () => {
    expect(
      validateEnv({
        NODE_ENV: 'production',
        PORT: '3001',
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/extion',
        GOOGLE_API_KEY: 'google-key',
        CORS_ORIGINS: 'https://extion.co',
      }),
    ).toMatchObject({
      NODE_ENV: 'production',
      PORT: 3001,
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/extion',
      GOOGLE_API_KEY: 'google-key',
      CORS_ORIGINS: expect.stringContaining('https://extion.co'),
      JSON_BODY_LIMIT: '10mb',
      URLENCODED_BODY_LIMIT: '10mb',
    });
  });

  it('requires database and Google API env outside test', () => {
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      'DATABASE_URL is required',
    );
    expect(() => validateEnv({ NODE_ENV: 'production' })).toThrow(
      'GOOGLE_API_KEY is required',
    );
  });

  it('does not require external service keys in test env', () => {
    expect(validateEnv({ NODE_ENV: 'test' })).toMatchObject({
      NODE_ENV: 'test',
      PORT: 8080,
    });
  });
});
