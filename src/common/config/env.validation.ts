import {
  DEFAULT_NODE_ENV,
  getCorsOrigins,
  getPayloadLimits,
  parsePort,
} from './app-config';

export interface ValidatedEnv {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL?: string;
  GOOGLE_API_KEY?: string;
  CORS_ORIGINS: string;
  ALLOWED_ORIGINS?: string;
  JSON_BODY_LIMIT: string;
  URLENCODED_BODY_LIMIT: string;
  [key: string]: unknown;
}

const REQUIRED_KEYS_OUTSIDE_TEST = ['DATABASE_URL', 'GOOGLE_API_KEY'];

export function validateEnv(config: Record<string, unknown>): ValidatedEnv {
  const nodeEnv = String(config.NODE_ENV || DEFAULT_NODE_ENV);
  const errors: string[] = [];
  let port = 8080;

  try {
    port = parsePort(config.PORT as string | number | undefined);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  if (nodeEnv !== 'test') {
    for (const key of REQUIRED_KEYS_OUTSIDE_TEST) {
      if (!config[key]) {
        errors.push(`${key} is required`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration: ${errors.join('; ')}`);
  }

  const source = config as Record<string, string | number | undefined>;
  const payloadLimits = getPayloadLimits(source);

  return {
    ...config,
    NODE_ENV: nodeEnv,
    PORT: port,
    CORS_ORIGINS: getCorsOrigins(source).join(','),
    ALLOWED_ORIGINS: config.ALLOWED_ORIGINS as string | undefined,
    JSON_BODY_LIMIT: payloadLimits.jsonLimit,
    URLENCODED_BODY_LIMIT: payloadLimits.urlencodedLimit,
  };
}
