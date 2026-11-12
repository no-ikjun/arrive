import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiError, errorBody } from './api-error';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'no-store');

    if (exception instanceof ApiError) {
      response.status(exception.getStatus()).json(errorBody(exception));
      return;
    }

    if (exception instanceof ThrottlerException) {
      if (!response.getHeader('Retry-After')) {
        response.setHeader('Retry-After', '1');
      }
      response.status(429).json({
        code: 'RATE_LIMITED',
        message: '요청이 너무 많습니다.',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      if (status === 400 || status === 413) {
        response.status(400).json({
          code: 'INVALID_REQUEST',
          message: status === 413 ? '요청 본문이 너무 큽니다.' : '요청 형식이 올바르지 않습니다.',
        });
        return;
      }
      response.status(status).json({
        code: 'INVALID_REQUEST',
        message: '요청을 처리하지 못했습니다.',
      });
      return;
    }

    response.status(500).json({
      code: 'INTERNAL',
      message: '서버 오류가 발생했습니다.',
    });
  }
}
