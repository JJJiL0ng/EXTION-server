import { HttpStatus } from '@nestjs/common';

export enum AppErrorCode {
  BAD_REQUEST = 'BAD_REQUEST',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
}

export function mapHttpStatusToErrorCode(statusCode: number): AppErrorCode {
  switch (statusCode) {
    case HttpStatus.BAD_REQUEST:
      return AppErrorCode.BAD_REQUEST;
    case HttpStatus.UNAUTHORIZED:
      return AppErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return AppErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return AppErrorCode.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return AppErrorCode.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return AppErrorCode.RATE_LIMIT_EXCEEDED;
    default:
      return AppErrorCode.INTERNAL_SERVER_ERROR;
  }
}
