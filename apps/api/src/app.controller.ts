import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { runSql } from './auth/db.util';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  private async ensureSiteSettings() {
    await runSql(`
      CREATE TABLE IF NOT EXISTS site_settings (
        setting_key   text PRIMARY KEY,
        setting_value text NOT NULL DEFAULT '',
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('chef_message', 'Every dish is prepared for school-day energy and balanced nutrition. We keep every meal fresh, consistent, and safe for all youngsters.')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
  }

  @Get('api/v1/public/site-settings')
  async getPublicSiteSettings() {
    await this.ensureSiteSettings();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT setting_value AS chef_message
        FROM site_settings
        WHERE setting_key = 'chef_message'
        LIMIT 1
      ) t;
    `);
    const line = out.split('\n').map((x: string) => x.trim()).find(Boolean);
    const data = line ? (JSON.parse(line) as { chef_message?: string }) : {};
    return { chef_message: data.chef_message ?? '' };
  }

  private async ensurePageVisitCounter() {
    await runSql(`
      CREATE TABLE IF NOT EXISTS site_counters (
        counter_key text PRIMARY KEY,
        counter_value bigint NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Baseline starts at 100 so the first tracked page hit becomes 101.
    await runSql(`
      INSERT INTO site_counters (counter_key, counter_value)
      VALUES ('global_page_visits', 100)
      ON CONFLICT (counter_key) DO NOTHING;
    `);
  }

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

  @Get('api/v1/public/page-visits')
  async getGlobalPageVisits() {
    await this.ensurePageVisitCounter();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT counter_value::bigint AS count
        FROM site_counters
        WHERE counter_key = 'global_page_visits'
        LIMIT 1
      ) t;
    `);
    const line = out.split('\n').map((x) => x.trim()).find(Boolean);
    const data = line ? (JSON.parse(line) as { count?: number }) : { count: 100 };
    return { count: Number(data.count || 100) };
  }

  @Post('api/v1/public/page-visits/hit')
  async incrementGlobalPageVisits() {
    await this.ensurePageVisitCounter();
    const out = await runSql(`
      WITH updated AS (
        INSERT INTO site_counters (counter_key, counter_value, updated_at)
        VALUES ('global_page_visits', 101, now())
        ON CONFLICT (counter_key)
        DO UPDATE
        SET counter_value = site_counters.counter_value + 1,
            updated_at = now()
        RETURNING counter_value::bigint AS count
      )
      SELECT row_to_json(updated)::text
      FROM updated;
    `);
    const line = out.split('\n').map((x) => x.trim()).find(Boolean);
    const data = line ? (JSON.parse(line) as { count?: number }) : { count: 101 };
    return { count: Number(data.count || 101) };
  }
}
