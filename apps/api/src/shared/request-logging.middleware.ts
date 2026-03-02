import type { NextFunction, Request, Response } from 'express';
import { getCorrelationId } from './correlation-id.middleware';

export function RequestLoggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const correlationId = getCorrelationId(req);

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const durationMs = Number(end - start) / 1_000_000;
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'info',
      event: 'http_request',
      correlationId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      remoteIp: req.ip,
      userAgent: req.headers['user-agent'] || '',
    });
    process.stdout.write(`${line}\n`);
  });

  next();
}
