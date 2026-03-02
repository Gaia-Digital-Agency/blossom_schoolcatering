import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { runSql } from './auth/db.util';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  private async buildHealth() {
    const db = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    return {
      status: db === 'ok' ? 'healthy' : 'degraded',
      db,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('health')
  health() {
    return this.buildHealth();
  }

  @Get('ready')
  async ready() {
    const required = ['DATABASE_URL', 'AUTH_JWT_SECRET', 'AUTH_JWT_REFRESH_SECRET'];
    const missing = required.filter((key) => !process.env[key]);
    const db = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    const ready = missing.length === 0 && db === 'ok';
    return {
      status: ready ? 'ready' : 'not_ready',
      checks: {
        env: missing.length === 0 ? 'ok' : 'error',
        db,
      },
      missingEnv: missing,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('api/v1/health')
  healthV1() {
    return this.buildHealth();
  }

  @Get('api/v1/ready')
  readyV1() {
    return this.ready();
  }
}
