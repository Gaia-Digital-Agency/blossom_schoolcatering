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

  @Get('api/v1/health')
  async health() {
    const db = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    return {
      status: db === 'ok' ? 'healthy' : 'degraded',
      db,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
