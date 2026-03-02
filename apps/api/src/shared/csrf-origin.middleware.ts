import type { NextFunction, Request, Response } from 'express';

const PROTECTED_AUTH_PATHS = new Set([
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
  '/api/v1/auth/password/reset',
]);

function isSafeMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

function isSameOrigin(candidate: string, host: string, allowedOrigins: Set<string>) {
  try {
    const parsed = new URL(candidate);
    const origin = `${parsed.protocol}//${parsed.host}`.toLowerCase();
    if (allowedOrigins.has(origin)) return true;
    return parsed.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export function CsrfOriginMiddleware(allowedOriginsRaw: string[]) {
  const allowedOrigins = new Set(
    allowedOriginsRaw
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .map((x) => x.replace(/\/+$/, '').toLowerCase()),
  );

  return (req: Request, res: Response, next: NextFunction) => {
    if (isSafeMethod(req.method)) return next();
    const path = (req.path || '').toLowerCase();
    if (!PROTECTED_AUTH_PATHS.has(path)) return next();

    const origin = String(req.headers.origin || '');
    const referer = String(req.headers.referer || '');
    const host = String(req.headers.host || '');

    if (!origin && !referer) return next(); // non-browser clients

    const validOrigin = origin ? isSameOrigin(origin, host, allowedOrigins) : false;
    const validReferer = referer ? isSameOrigin(referer, host, allowedOrigins) : false;

    if (!validOrigin && !validReferer) {
      return res.status(403).json({
        success: false,
        statusCode: 403,
        error: {
          code: 'CSRF_ORIGIN_REJECTED',
          message: 'Invalid request origin',
        },
      });
    }
    return next();
  };
}
