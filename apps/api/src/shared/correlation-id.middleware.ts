import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

const CORRELATION_ID_HEADER = 'x-correlation-id';

type CorrelatedRequest = Request & { correlationId?: string };

export function CorrelationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingValue = req.header(CORRELATION_ID_HEADER);
  const correlationId = incomingValue?.trim() || randomUUID();
  (req as CorrelatedRequest).correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}

export function getCorrelationId(req: Request): string {
  return (req as CorrelatedRequest).correlationId || req.header(CORRELATION_ID_HEADER) || 'unknown';
}
