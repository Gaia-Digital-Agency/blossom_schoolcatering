import { Injectable } from '@nestjs/common';

/**
 * SiteSettingsService
 * ===================
 *
 * Scope:
 *   - Owns the singleton site_settings row (hero image URL, site copy,
 *     feature toggles exposed publicly).
 *   - Serves the /public/site-settings read endpoint and the admin
 *     write endpoints.
 *   - Proxies hero image upload through MediaService.
 *
 * Methods that will move here from CoreService:
 *   - ensureSiteSettingsTable (private migration; may stay in SchemaService)
 *   - getSiteSettings
 *   - updateSiteSettings
 *   - uploadSiteHeroImage (public wrapper; actual upload via MediaService)
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - MediaService (hero image upload)
 *   - AuditService (recordAdminAudit on update)
 *
 * Consumers:
 *   - CoreService facade (public + admin endpoints)
 *   - Web app loads hero image and site copy on every page.
 */
@Injectable()
export class SiteSettingsService {}
