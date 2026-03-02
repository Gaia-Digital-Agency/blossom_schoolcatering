# Observability and Monitoring Setup

Date: 2026-03-02

## Structured JSON logs
- API now emits JSON logs for:
  - startup events
  - every HTTP request (method, path, status, duration, correlationId)
  - exceptions (normalized with stack for server errors)
  - process-level failures (`unhandledRejection`, `uncaughtException`, `warning`)
- Correlation ID is returned in `x-correlation-id` and included in request/exception logs.

## Where logs are generated
- `apps/api/src/shared/json.logger.ts`
- `apps/api/src/shared/request-logging.middleware.ts`
- `apps/api/src/shared/standard-http-exception.filter.ts`
- `apps/api/src/shared/monitoring.ts`

## PM2 log handling
- Keep PM2 logs enabled and rotate them:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 14
pm2 save
```

## Health probes
- Liveness: `GET /health`
- Readiness: `GET /ready`
- Backward compatibility:
  - `GET /api/v1/health`
  - `GET /api/v1/ready`

## Example monitor checks
```bash
curl -fsS http://127.0.0.1:3006/health
curl -fsS http://127.0.0.1:3006/ready
pm2 logs schoolcatering-api --lines 100
```
