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

/**
 * Loads environment variables from a specified .env file path.
 * It reads the file, parses each line, and sets the environment variables
 * if they are not already set. It skips empty lines, comments, and lines without an '='.
 * @param path The path to the .env file.
 */
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

/**
 * Validates that all required environment variables are set.
 * If any of the required variables are missing, it logs an error
 * to the console and exits the process with a status code of 1.
 */
function validateRequiredEnv() {
  const required = ['DATABASE_URL', 'AUTH_JWT_SECRET', 'AUTH_JWT_REFRESH_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error(`[STARTUP] Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

/**
 * Bootstraps the NestJS application.
 * This function sets up and initializes everything the application needs to run.
 */
async function bootstrap() {
  // Set up process monitoring and load environment variables from .env files.
  setupProcessMonitoring();
  loadDotEnv(join(process.cwd(), '.env'));
  loadDotEnv('/var/www/schoolcatering/.env');
  validateRequiredEnv();

  // Create a new NestJS application instance.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Configure express to handle larger payloads, specifically for image uploads.
  // The default limit of 100kb is too small.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express') as typeof import('express');
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Use a custom JSON logger for application-wide logging.
  app.useLogger(new JsonLogger());

  // Define the list of allowed origins for Cross-Origin Resource Sharing (CORS).
  const corsOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://34.158.47.112',
    process.env.CORS_ORIGIN,
  ].filter(Boolean) as string[];

  // Apply various middleware for security and request handling.
  app.use(SecurityHeadersMiddleware);
  app.use(CorrelationIdMiddleware);
  app.use(RequestLoggingMiddleware);
  app.use(CsrfOriginMiddleware(corsOrigins));

  // Apply global filters and pipes for exception handling and data validation/transformation.
  app.useGlobalFilters(new StandardHttpExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Enable and configure CORS for the application.
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Configure Swagger for API documentation.
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

  // Start the application, listening on the configured port.
  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logStartupMonitorInfo(port);
}

// Start the application by calling the bootstrap function.
bootstrap();
