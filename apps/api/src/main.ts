import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CorrelationIdMiddleware } from './shared/correlation-id.middleware';
import { StandardHttpExceptionFilter } from './shared/standard-http-exception.filter';
import { CsrfOriginMiddleware } from './shared/csrf-origin.middleware';
import { SecurityHeadersMiddleware } from './shared/security-headers.middleware';
import { JsonLogger } from './shared/json.logger';
import { RequestLoggingMiddleware } from './shared/request-logging.middleware';
import { logStartupMonitorInfo, setupProcessMonitoring } from './shared/monitoring';

function loadDotEnv(path: string) {
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function validateRequiredEnv() {
  const required = ['DATABASE_URL', 'AUTH_JWT_SECRET', 'AUTH_JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

async function bootstrap() {
  setupProcessMonitoring();
  loadDotEnv(join(process.cwd(), '.env'));
  loadDotEnv('/var/www/schoolcatering/.env');
  validateRequiredEnv();
  const app = await NestFactory.create(AppModule);
  app.useLogger(new JsonLogger());
  const corsOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://34.124.244.233',
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];

  app.use(SecurityHeadersMiddleware);
  app.use(CorrelationIdMiddleware);
  app.use(RequestLoggingMiddleware);
  app.use(CsrfOriginMiddleware(corsOrigins));
  app.useGlobalFilters(new StandardHttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Blossom School Catering API')
    .setDescription('REST API contract for Blossom School Catering')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/v1/docs', app, swaggerDocument, {
    jsonDocumentUrl: 'api/v1/docs-json',
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logStartupMonitorInfo(port);
}
bootstrap();
