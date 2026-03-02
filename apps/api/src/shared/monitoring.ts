function emit(level: 'info' | 'error' | 'fatal', event: string, payload?: Record<string, unknown>) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    service: 'schoolcatering-api',
    env: process.env.NODE_ENV || 'development',
    ...(payload || {}),
  });
  if (level === 'error' || level === 'fatal') {
    process.stderr.write(`${line}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

export function setupProcessMonitoring() {
  process.on('unhandledRejection', (reason) => {
    emit('error', 'process_unhandled_rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  process.on('uncaughtException', (error) => {
    emit('fatal', 'process_uncaught_exception', {
      message: error.message,
      stack: error.stack,
    });
    setTimeout(() => process.exit(1), 200).unref();
  });

  process.on('warning', (warning) => {
    emit('error', 'process_warning', {
      name: warning.name,
      message: warning.message,
      stack: warning.stack,
    });
  });
}

export function logStartupMonitorInfo(port: number | string) {
  emit('info', 'service_started', {
    port: String(port),
    pid: process.pid,
    nodeVersion: process.version,
  });
}
