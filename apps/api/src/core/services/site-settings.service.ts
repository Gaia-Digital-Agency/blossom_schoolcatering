import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser } from '../core.types';
import { HelpersService } from './helpers.service';
import { SchemaService } from './schema.service';

/**
 * SiteSettingsService
 * ===================
 *
 * Scope:
 *   - Owns read/write on the site_settings key/value store (chef
 *     message, hero image URL + caption, ordering cutoff time,
 *     assistance message, multiorder_future_enabled, ai_future_enabled).
 *   - Lazy-seeds the `multiorder_future_enabled` row on every
 *     getSiteSettings call (ON CONFLICT DO NOTHING) so older
 *     deployments auto-upgrade without a dedicated migration.
 *   - Normalizes ordering_cutoff_time through HelpersService before
 *     returning/persisting.
 *
 * Owned methods (moved from CoreService in this extraction):
 *   - getSiteSettings    (public read, no auth — used by /public/site-settings)
 *   - updateSiteSettings (admin-gated write)
 *
 * Hero image upload (uploadSiteHeroImage) lives on MediaService; the
 * facade exposes it separately.
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureSiteSettingsTable — DDL + default seed rows)
 *   - HelpersService (normalizeOrderingCutoffTime)
 *
 * Consumers:
 *   - CoreService facade → /public/site-settings (no auth),
 *     /admin/site-settings (admin only).
 *   - HelpersService.getOrderingCutoffTime reads the cutoff row
 *     directly from site_settings via its own runSql, bypassing this
 *     service to avoid a circular dependency.
 */
@Injectable()
export class SiteSettingsService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
  ) {}

  async getSiteSettings() {
    await this.schema.ensureSiteSettingsTable();
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('multiorder_future_enabled', 'false')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT
          COALESCE(MAX(CASE WHEN setting_key = 'chef_message' THEN setting_value END), '') AS chef_message,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_url' THEN setting_value END), '/schoolcatering/assets/hero-meal.jpg') AS hero_image_url,
          COALESCE(MAX(CASE WHEN setting_key = 'hero_image_caption' THEN setting_value END), 'Enchanting Nourished Zesty Original Meals') AS hero_image_caption,
          COALESCE(MAX(CASE WHEN setting_key = 'ordering_cutoff_time' THEN setting_value END), '08:00') AS ordering_cutoff_time,
          COALESCE(MAX(CASE WHEN setting_key = 'assistance_message' THEN setting_value END), 'For Assistance Please Whatsapp +6285211710217') AS assistance_message,
          COALESCE(MAX(CASE WHEN setting_key = 'multiorder_future_enabled' THEN setting_value END), 'false') AS multiorder_future_enabled,
          COALESCE(MAX(CASE WHEN setting_key = 'ai_future_enabled' THEN setting_value END), 'false') AS ai_future_enabled
        FROM site_settings
      ) t;
    `);
    const lines = out.split('\n').map((x: string) => x.trim()).filter(Boolean);
    const data = lines[0]
      ? (JSON.parse(lines[0]) as {
          chef_message?: string;
          hero_image_url?: string;
          hero_image_caption?: string;
          ordering_cutoff_time?: string;
          assistance_message?: string;
          multiorder_future_enabled?: string;
          ai_future_enabled?: string;
        })
      : {};
    return {
      chef_message: data.chef_message ?? '',
      hero_image_url: data.hero_image_url ?? '/schoolcatering/assets/hero-meal.jpg',
      hero_image_caption: data.hero_image_caption ?? 'Enchanting Nourished Zesty Original Meals',
      ordering_cutoff_time: this.helpers.normalizeOrderingCutoffTime(data.ordering_cutoff_time ?? '08:00'),
      assistance_message: data.assistance_message ?? 'For Assistance Please Whatsapp +6285211710217',
      multiorder_future_enabled: String(data.multiorder_future_enabled || 'false').trim().toLowerCase() === 'true',
      ai_future_enabled: String(data.ai_future_enabled || 'false').trim().toLowerCase() === 'true',
    };
  }

  async updateSiteSettings(actor: AccessUser, input: {
    chef_message?: string;
    hero_image_url?: string;
    hero_image_caption?: string;
    ordering_cutoff_time?: string;
    assistance_message?: string;
    multiorder_future_enabled?: boolean;
    ai_future_enabled?: boolean;
  }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const current = await this.getSiteSettings();
    const chefMessage = typeof input.chef_message === 'string' ? input.chef_message.trim() : current.chef_message;
    const heroImageUrl = typeof input.hero_image_url === 'string' ? input.hero_image_url.trim() : current.hero_image_url;
    const heroImageCaption = typeof input.hero_image_caption === 'string' ? input.hero_image_caption.trim() : current.hero_image_caption;
    const orderingCutoffTime = this.helpers.normalizeOrderingCutoffTime(input.ordering_cutoff_time ?? current.ordering_cutoff_time);
    const assistanceMessage = typeof input.assistance_message === 'string'
      ? input.assistance_message.trim()
      : current.assistance_message;
    const multiorderFutureEnabled = typeof input.multiorder_future_enabled === 'boolean'
      ? input.multiorder_future_enabled
      : Boolean(current.multiorder_future_enabled);
    const aiFutureEnabled = typeof input.ai_future_enabled === 'boolean'
      ? input.ai_future_enabled
      : Boolean(current.ai_future_enabled);
    if (chefMessage.length > 500) throw new BadRequestException('chef_message must be 500 characters or fewer');
    if (heroImageCaption.length > 200) throw new BadRequestException('hero_image_caption must be 200 characters or fewer');
    if (heroImageUrl.length > 2000) throw new BadRequestException('hero_image_url must be 2000 characters or fewer');
    if (assistanceMessage.length > 200) throw new BadRequestException('assistance_message must be 200 characters or fewer');
    await this.schema.ensureSiteSettingsTable();
    await runSql(
      `INSERT INTO site_settings (setting_key, setting_value, updated_at)
       VALUES
         ('chef_message', $1, now()),
         ('hero_image_url', $2, now()),
         ('hero_image_caption', $3, now()),
         ('ordering_cutoff_time', $4, now()),
         ('assistance_message', $5, now()),
         ('multiorder_future_enabled', $6, now()),
         ('ai_future_enabled', $7, now())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = now();`,
      [
        chefMessage,
        heroImageUrl || '/schoolcatering/assets/hero-meal.jpg',
        heroImageCaption,
        orderingCutoffTime,
        assistanceMessage,
        multiorderFutureEnabled ? 'true' : 'false',
        aiFutureEnabled ? 'true' : 'false',
      ],
    );
    return {
      chef_message: chefMessage,
      hero_image_url: heroImageUrl || '/schoolcatering/assets/hero-meal.jpg',
      hero_image_caption: heroImageCaption,
      ordering_cutoff_time: orderingCutoffTime,
      assistance_message: assistanceMessage,
      multiorder_future_enabled: multiorderFutureEnabled,
      ai_future_enabled: aiFutureEnabled,
    };
  }
}
