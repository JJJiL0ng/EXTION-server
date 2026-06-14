import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { createHttpErrorResponse } from './http-error-response';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body = createHttpErrorResponse(exception, request.url);

    if (statusCode >= 500) {
      this.logger.error(
        `HTTP error ${body.code} ${statusCode} ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`HTTP error ${body.code} ${statusCode} ${request.method} ${request.url}`);
    }

    response.status(statusCode).json(body);
  }
}
