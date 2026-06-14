export const DEFAULT_NODE_ENV = 'development';
export const DEFAULT_PORT = 8080;
export const DEFAULT_BODY_LIMIT = '10mb';
export const DEFAULT_CORS_ORIGINS = ['http://localhost:3000'];
export const FIXED_CORS_ORIGINS = [
  'https://docs.google.com',
  'https://*.googleusercontent.com',
  'https://extion-server.railway.internal',
];

type EnvSource = Record<string, string | number | undefined>;

export interface PayloadLimitConfig {
  jsonLimit: string;
  urlencodedLimit: string;
}

export function parseCsv(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parsePort(value: string | number | undefined): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }

  const port = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535. Received: ${value}`);
  }

  return port;
}

export function getCorsOrigins(source: EnvSource = process.env): string[] {
  const corsOrigins = parseCsv(String(source.CORS_ORIGINS ?? ''));
  const allowedOrigins = parseCsv(String(source.ALLOWED_ORIGINS ?? ''));
  const configuredOrigins = corsOrigins.length > 0 ? corsOrigins : allowedOrigins;
  const baseOrigins =
    configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_CORS_ORIGINS;

  return Array.from(new Set([...baseOrigins, ...FIXED_CORS_ORIGINS]));
}

export function getPayloadLimits(source: EnvSource = process.env): PayloadLimitConfig {
  return {
    jsonLimit: String(source.JSON_BODY_LIMIT || DEFAULT_BODY_LIMIT),
    urlencodedLimit: String(source.URLENCODED_BODY_LIMIT || DEFAULT_BODY_LIMIT),
  };
}

export function isCorsOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin.includes('*')) {
      return wildcardOriginToRegExp(allowedOrigin).test(origin);
    }

    return origin === allowedOrigin;
  });
}

function wildcardOriginToRegExp(origin: string): RegExp {
  const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*')}$`);
}
