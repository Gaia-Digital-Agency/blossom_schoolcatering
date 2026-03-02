import { ConsoleLogger, LogLevel } from '@nestjs/common';

type LogContext = {
  level: string;
  message: unknown;
  context?: string;
  trace?: string;
  meta?: Record<string, unknown>;
};

export class JsonLogger extends ConsoleLogger {
  constructor() {
    super('API', { logLevels: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'] as LogLevel[] });
  }

  log(message: unknown, context?: string) {
    this.emit({ level: 'info', message, context });
  }

  error(message: unknown, trace?: string, context?: string) {
    this.emit({ level: 'error', message, trace, context });
  }

  warn(message: unknown, context?: string) {
    this.emit({ level: 'warn', message, context });
  }

  debug(message: unknown, context?: string) {
    this.emit({ level: 'debug', message, context });
  }

  verbose(message: unknown, context?: string) {
    this.emit({ level: 'verbose', message, context });
  }

  fatal(message: unknown, trace?: string, context?: string) {
    this.emit({ level: 'fatal', message, trace, context });
  }

  private emit(payload: LogContext) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      service: 'schoolcatering-api',
      env: process.env.NODE_ENV || 'development',
      ...payload,
    });
    if (payload.level === 'error' || payload.level === 'fatal') {
      process.stderr.write(`${line}\n`);
      return;
    }
    process.stdout.write(`${line}\n`);
  }
}
