import { HttpException, HttpStatus } from '@nestjs/common';
import {
  AppErrorCode,
  mapHttpStatusToErrorCode,
} from './error-code';

export interface HttpErrorResponseBody {
  success: false;
  statusCode: number;
  code: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

export function createHttpErrorResponse(
  exception: unknown,
  path: string,
  isProduction = process.env.NODE_ENV === 'production',
  timestamp = new Date().toISOString(),
): HttpErrorResponseBody {
  const statusCode =
    exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  const response =
    exception instanceof HttpException ? exception.getResponse() : undefined;

  return {
    success: false,
    statusCode,
    code: extractErrorCode(response) ?? mapHttpStatusToErrorCode(statusCode),
    message: extractErrorMessage(exception, response, isProduction),
    timestamp,
    path,
  };
}

function extractErrorCode(response: unknown): string | undefined {
  if (typeof response === 'object' && response !== null) {
    const code = (response as Record<string, unknown>).code;
    return typeof code === 'string' ? code : undefined;
  }

  return undefined;
}

function extractErrorMessage(
  exception: unknown,
  response: unknown,
  isProduction: boolean,
): string | string[] {
  if (!(exception instanceof HttpException) && isProduction) {
    return AppErrorCode.INTERNAL_SERVER_ERROR;
  }

  if (typeof response === 'string') {
    return response;
  }

  if (typeof response === 'object' && response !== null) {
    const message = (response as Record<string, unknown>).message;
    if (typeof message === 'string' || Array.isArray(message)) {
      return message as string | string[];
    }
  }

  if (exception instanceof Error) {
    return exception.message;
  }

  return AppErrorCode.INTERNAL_SERVER_ERROR;
}
