import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { runSql } from './auth/db.util';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * Ensures that the 'site_settings' table exists in the database and seeds it with an initial 'chef_message'.
   * This method creates the table if it doesn't exist and inserts a default message
   * to be displayed on the site.
   */
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
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('hero_image_url', '/schoolcatering/assets/hero-meal.jpg')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('hero_image_caption', 'Enchanting Nourished Zesty Original Meals')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
  }

  /**
   * Retrieves public site settings for the homepage.
   * It ensures the settings table is created and then fetches the message.
   * @returns An object containing the chef_message and hero image settings.
   */
  @Get('api/v1/public/site-settings')
  async getPublicSiteSettings() {
    await this.ensureSiteSettings();
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT
          COALESCE(MAX(CASE WHEN setting_key = 'chef_message' THEN setting_value END), '') AS chef_message,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_url' THEN setting_value END), '/schoolcatering/assets/hero-meal.jpg') AS hero_image_url,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_caption' THEN setting_value END), 'Enchanting Nourished Zesty Original Meals') AS hero_image_caption
        FROM site_settings
      ) t;
    `);
    const line = out.split('\n').map((x: string) => x.trim()).find(Boolean);
    const data = line ? (JSON.parse(line) as { chef_message?: string; hero_image_url?: string; hero_image_caption?: string }) : {};
    return {
      chef_message: data.chef_message ?? '',
      hero_image_url: data.hero_image_url ?? '/schoolcatering/assets/hero-meal.jpg',
      hero_image_caption: data.hero_image_caption ?? 'Enchanting Nourished Zesty Original Meals',
    };
  }

  /**
   * Ensures that the 'site_counters' table exists and has an initial 'global_page_visits' count.
   * This method creates the table if it doesn't exist and sets a baseline page visit count.
   */
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

  /**
   * Returns a simple greeting string from the AppService.
   * @returns A 'Hello World!' string.
   */
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Builds a health check response object.
   * This method checks the database connection status and combines it with process uptime
   * and a timestamp to provide a comprehensive health status.
   * @returns A health check object with status, db connection, uptime, and timestamp.
   */
  private async buildHealth() {
    const db = await runSql('SELECT 1;').then(() => 'ok').catch(() => 'error');
    return {
      status: db === 'ok' ? 'healthy' : 'degraded',
      db,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Endpoint to check the health of the application.
   * @returns A health check response.
   */
  @Get('health')
  health() {
    return this.buildHealth();
  }

  /**
   * Checks if the application is ready to serve requests.
   * It verifies that all required environment variables are set and that the database is accessible.
   * @returns An object indicating the readiness status and status of individual checks.
   */
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

  /**
   * Versioned endpoint to check the health of the application.
   * @returns A health check response.
   */
  @Get('api/v1/health')
  healthV1() {
    return this.buildHealth();
  }

  /**
   * Versioned endpoint to check if the application is ready to serve requests.
   * @returns A readiness check response.
   */
  @Get('api/v1/ready')
  readyV1() {
    return this.ready();
  }

  /**
   * Retrieves the global page visit count.
   * It ensures the counter table is initialized and then fetches the current count.
   * @returns An object containing the page visit count.
   */
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

  /**
   * Increments the global page visit counter.
   * This endpoint is called to register a new page visit, and it returns the updated count.
   * @returns An object with the new page visit count.
   */
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
