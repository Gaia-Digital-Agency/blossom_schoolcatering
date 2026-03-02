import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from './correlation-id.middleware';

type NormalizedError = {
  code: string;
  message: string;
  details?: unknown;
};

@Catch()
export class StandardHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const correlationId = getCorrelationId(req);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = this.normalizeError(exception, status);
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: status >= 500 ? 'error' : 'warn',
      event: 'http_exception',
      correlationId,
      statusCode: status,
      method: req.method,
      path: req.originalUrl || req.url,
      error,
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    if (status >= 500) {
      process.stderr.write(`${line}\n`);
    } else {
      process.stdout.write(`${line}\n`);
    }

    res.status(status).json({
      success: false,
      statusCode: status,
      path: req.originalUrl || req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
      correlationId,
      error,
    });
  }

  private normalizeError(exception: unknown, status: number): NormalizedError {
    if (!(exception instanceof HttpException)) {
      return {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      };
    }

    const response = exception.getResponse();
    const defaultCode = HttpStatus[status] || 'HTTP_EXCEPTION';
    const fallbackMessage = exception.message || 'Request failed';

    if (typeof response === 'string') {
      return {
        code: defaultCode,
        message: response,
      };
    }

    if (response && typeof response === 'object') {
      const value = response as Record<string, unknown>;
      const messageValue = value.message;
      const message = Array.isArray(messageValue)
        ? messageValue.join('; ')
        : typeof messageValue === 'string'
          ? messageValue
          : fallbackMessage;

      const code =
        typeof value.error === 'string'
          ? value.error.toUpperCase().replace(/\s+/g, '_')
          : defaultCode;

      const details = Array.isArray(messageValue) ? messageValue : undefined;
      return { code, message, details };
    }

    return {
      code: defaultCode,
      message: fallbackMessage,
    };
  }
}
