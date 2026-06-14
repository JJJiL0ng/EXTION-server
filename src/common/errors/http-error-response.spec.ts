import { BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { createHttpErrorResponse } from './http-error-response';
import { AppErrorCode } from './error-code';

describe('createHttpErrorResponse', () => {
  it('uses explicit error code from HttpException response body', () => {
    const exception = new HttpException(
      {
        message: 'invalid payload',
        code: 'CUSTOM_VALIDATION',
      },
      HttpStatus.BAD_REQUEST,
    );

    expect(
      createHttpErrorResponse(exception, '/v2/user/create', false, 'now'),
    ).toEqual({
      success: false,
      statusCode: 400,
      code: 'CUSTOM_VALIDATION',
      message: 'invalid payload',
      timestamp: 'now',
      path: '/v2/user/create',
    });
  });

  it('maps Nest HttpException status to app error code', () => {
    expect(
      createHttpErrorResponse(new BadRequestException('bad'), '/path', false, 'now'),
    ).toMatchObject({
      code: AppErrorCode.BAD_REQUEST,
      message: 'bad',
    });
  });

  it('hides unknown error messages in production', () => {
    expect(
      createHttpErrorResponse(new Error('database password leaked'), '/path', true, 'now'),
    ).toMatchObject({
      statusCode: 500,
      code: AppErrorCode.INTERNAL_SERVER_ERROR,
      message: AppErrorCode.INTERNAL_SERVER_ERROR,
    });
  });
});
