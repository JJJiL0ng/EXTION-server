import {
  DEFAULT_BODY_LIMIT,
  DEFAULT_CORS_ORIGINS,
  FIXED_CORS_ORIGINS,
  getCorsOrigins,
  getPayloadLimits,
  isCorsOriginAllowed,
  parseCsv,
  parsePort,
} from './app-config';

describe('app-config', () => {
  it('parses comma separated env values', () => {
    expect(parseCsv('http://localhost:3000, https://extion.co ,,')).toEqual([
      'http://localhost:3000',
      'https://extion.co',
    ]);
  });

  it('uses CORS_ORIGINS before ALLOWED_ORIGINS and appends fixed origins', () => {
    expect(
      getCorsOrigins({
        CORS_ORIGINS: 'https://app.extion.co',
        ALLOWED_ORIGINS: 'https://legacy.extion.co',
      }),
    ).toEqual(['https://app.extion.co', ...FIXED_CORS_ORIGINS]);
  });

  it('falls back to default CORS origins', () => {
    expect(getCorsOrigins({})).toEqual([
      ...DEFAULT_CORS_ORIGINS,
      ...FIXED_CORS_ORIGINS,
    ]);
  });

  it('matches exact and wildcard CORS origins', () => {
    const origins = ['http://localhost:3000', 'https://*.googleusercontent.com'];

    expect(isCorsOriginAllowed('http://localhost:3000', origins)).toBe(true);
    expect(isCorsOriginAllowed('https://foo.googleusercontent.com', origins)).toBe(true);
    expect(isCorsOriginAllowed('https://foo.example.com', origins)).toBe(false);
  });

  it('parses and validates ports', () => {
    expect(parsePort(undefined)).toBe(8080);
    expect(parsePort('3001')).toBe(3001);
    expect(() => parsePort('70000')).toThrow('PORT must be an integer');
  });

  it('returns default payload limits', () => {
    expect(getPayloadLimits({})).toEqual({
      jsonLimit: DEFAULT_BODY_LIMIT,
      urlencodedLimit: DEFAULT_BODY_LIMIT,
    });
  });
});
