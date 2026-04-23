import { Injectable } from '@nestjs/common';
import { runSql } from '../../auth/db.util';

/**
 * SchemaService
 * =============
 *
 * Scope:
 *   - Owns every idempotent runtime schema guard moved out of
 *     CoreService: 18 ensure*Table / ensure*Column methods plus the
 *     corresponding per-instance "ready" flags.
 *   - Exposes runAll() called once from CoreService.onModuleInit to
 *     keep boot order byte-identical with the previous implementation.
 *   - Each individual ensure* method is also public so lazy code paths
 *     (e.g. getSiteSettings calling ensureSiteSettingsTable) keep the
 *     same "check just before use" semantics.
 *
 * NOT moved here (intentionally — these have domain side-effects or
 * aren't pure DDL):
 *   - ensureFamilyIdColumns (runs backfillFamilyIds, which touches
 *     parents/children via UsersService logic — stays on CoreService
 *     until HelpersService / UsersService is extracted).
 *   - ensureAdminAuditTrailTable (already owned by AuditService).
 *   - ensureAiFutureEnabled, ensureParentOwnsChild, ensureCartIsOpenAndOwned,
 *     ensureMenuForDateSession, ensureTbaIngredientId (not DDL — domain
 *     checks / seed operations).
 *
 * Dependencies:
 *   - runSql (db.util)
 *
 * Consumers:
 *   - CoreService.onModuleInit → runAll()
 *   - Lazy callers still hit individual ensure*() through the facade
 *     (this.schema!.ensureXxx()).
 */
@Injectable()
export class SchemaService {
  private blackoutDaysSessionReady = false;
  private parentDietaryRestrictionsReady = false;
  private deliverySchoolAssignmentsReady = false;
  private deliveryDailyNotesReady = false;
  private orderNotificationLogsReady = false;
  private billingReviewColumnsReady = false;
  private schoolShortNameReady = false;
  private multiOrderSchemaReady = false;
  private adminVisiblePasswordsReady = false;
  private menuItemExtendedColumnsReady = false;
  private menuItemNameUniquenessReady = false;
  private menuRatingsTableReady = false;
  private sessionSettingsTableReady = false;
  private aiUsageLogsReady = false;
  private childRegistrationSourceColumnsReady = false;
  private childCurrentGradeColumnReady = false;
  private menuItemTextDefaultsReady = false;
  private parent2ColsReady = false;
  private siteSettingsSeededReady = false;

  /**
   * Boot-time sequential migration run. Order matches the previous
   * onModuleInit in CoreService.
   *
   * Note: audit trail (AuditService.ensureAdminAuditTrailTable) and
   * family-id columns (CoreService.ensureFamilyIdColumns) are NOT run
   * here — they stay on their respective owners for now and are
   * invoked directly from CoreService.onModuleInit before/after this.
   */
  async runAll() {
    await this.ensureBlackoutDaysSessionColumn();
    await this.ensureMenuItemExtendedColumns();
    await this.ensureMenuItemNameUniquenessScope();
    await this.ensureSessionSettingsTable();
    await this.ensureMenuRatingsTable();
    await this.ensureDeliverySchoolAssignmentsTable();
    await this.ensureChildRegistrationSourceColumns();
    await this.ensureChildCurrentGradeColumn();
    await this.ensureDeliveryDailyNotesTable();
    await this.ensureOrderNotificationLogsTable();
    await this.ensureBillingReviewColumns();
    await this.ensureSchoolShortNameColumn();
    await this.ensureMultiOrderSchema();
    await this.ensureMenuItemTextDefaults();
  }

  async ensureBlackoutDaysSessionColumn() {
    if (this.blackoutDaysSessionReady) return;
    await runSql(`
      ALTER TABLE blackout_days
      ADD COLUMN IF NOT EXISTS session session_type NULL;
    `);
    await runSql(`
      ALTER TABLE blackout_days
      DROP CONSTRAINT IF EXISTS blackout_days_blackout_date_key;
    `);
    await runSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_blackout_days_date_all_sessions
      ON blackout_days(blackout_date)
      WHERE session IS NULL;
    `);
    await runSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_blackout_days_date_session
      ON blackout_days(blackout_date, session)
      WHERE session IS NOT NULL;
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_blackout_days_date_session
      ON blackout_days(blackout_date, session);
    `);
    this.blackoutDaysSessionReady = true;
  }

  async ensureSchoolShortNameColumn() {
    if (this.schoolShortNameReady) return;
    await runSql(`
      ALTER TABLE schools
      ADD COLUMN IF NOT EXISTS short_name varchar(30);
    `);
    this.schoolShortNameReady = true;
  }

  async ensureAdminVisiblePasswordsTable() {
    if (this.adminVisiblePasswordsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS admin_visible_passwords (
        user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        password_plaintext text NOT NULL,
        source text NOT NULL DEFAULT 'REGISTRATION',
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    this.adminVisiblePasswordsReady = true;
  }

  async ensureDeliveryDailyNotesTable() {
    if (this.deliveryDailyNotesReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS delivery_daily_notes (
        delivery_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_date date NOT NULL,
        note text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (delivery_user_id, service_date)
      );
    `);
    this.deliveryDailyNotesReady = true;
  }

  async ensureOrderNotificationLogsTable() {
    if (this.orderNotificationLogsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS order_notification_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        channel varchar(30) NOT NULL,
        notification_type varchar(50) NOT NULL,
        target_phone varchar(30),
        target_source varchar(20),
        status varchar(20) NOT NULL,
        attempted_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        provider varchar(30),
        provider_message_id varchar(100),
        message_hash varchar(128),
        failure_reason text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS order_notification_logs_order_idx
      ON order_notification_logs(order_id);
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS order_notification_logs_status_idx
      ON order_notification_logs(status, attempted_at DESC);
    `);
    await runSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS order_notification_logs_sent_once_uq
      ON order_notification_logs(order_id, channel, notification_type)
      WHERE status = 'SENT';
    `);
    this.orderNotificationLogsReady = true;
  }

  async ensureMenuItemNameUniquenessScope() {
    if (this.menuItemNameUniquenessReady) return;
    // Historical schema used a global unique index on lower(name), which blocks
    // valid renames across different menus/dates/sessions.
    // Current behavior expects uniqueness within a menu context only.
    await runSql(`DROP INDEX IF EXISTS menu_items_name_ci_uq;`);
    await runSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS menu_items_menu_name_ci_active_uq
      ON menu_items (menu_id, lower(name))
      WHERE deleted_at IS NULL;
    `);
    this.menuItemNameUniquenessReady = true;
  }

  async ensureAiUsageLogsTable() {
    if (this.aiUsageLogsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS ai_usage_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid NOT NULL REFERENCES users(id),
        actor_role text NOT NULL,
        parent_id uuid NULL REFERENCES parents(id) ON DELETE SET NULL,
        viewer_child_id uuid NULL REFERENCES children(id) ON DELETE SET NULL,
        child_ids_json text NOT NULL DEFAULT '[]',
        category text NOT NULL DEFAULT 'unknown',
        prompt_chars int NOT NULL DEFAULT 0,
        response_chars int NOT NULL DEFAULT 0,
        success boolean NOT NULL DEFAULT false,
        error_code text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON ai_usage_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_actor ON ai_usage_logs(actor_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_parent ON ai_usage_logs(parent_id, created_at DESC);
    `);
    this.aiUsageLogsReady = true;
  }

  async ensureMenuItemExtendedColumns() {
    if (this.menuItemExtendedColumnsReady) return;
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS cutlery_required boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS packing_requirement text;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS calories_kcal integer;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_vegetarian boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_gluten_free boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS is_dairy_free boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS contains_peanut boolean NOT NULL DEFAULT false;
    `);
    await runSql(`
      ALTER TABLE menu_items
      ADD COLUMN IF NOT EXISTS dish_category text NOT NULL DEFAULT 'MAIN';
    `);
    this.menuItemExtendedColumnsReady = true;
  }

  async ensureMenuRatingsTable() {
    if (this.menuRatingsTableReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS menu_item_ratings (
        menu_item_id uuid NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session session_type NOT NULL DEFAULT 'LUNCH',
        user_role text NOT NULL,
        stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (menu_item_id, user_id, session)
      );
    `);
    await runSql(`
      ALTER TABLE menu_item_ratings
      ADD COLUMN IF NOT EXISTS session session_type NOT NULL DEFAULT 'LUNCH';
    `);
    await runSql(`
      UPDATE menu_item_ratings mir
      SET session = m.session
      FROM menu_items mi
      JOIN menus m ON m.id = mi.menu_id
      WHERE mir.menu_item_id = mi.id
        AND mir.session IS DISTINCT FROM m.session;
    `);
    await runSql(`
      ALTER TABLE menu_item_ratings
      ALTER COLUMN session SET NOT NULL;
    `);
    await runSql(`
      ALTER TABLE menu_item_ratings
      DROP CONSTRAINT IF EXISTS menu_item_ratings_pkey;
    `);
    const ratingsPkExists = await runSql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'menu_item_ratings'::regclass
          AND conname = 'menu_item_ratings_pkey'
      );
    `);
    if (ratingsPkExists !== 't') {
      await runSql(`
        ALTER TABLE menu_item_ratings
        ADD CONSTRAINT menu_item_ratings_pkey PRIMARY KEY (menu_item_id, user_id, session);
      `);
    }
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_menu_item_ratings_item_stars
      ON menu_item_ratings(menu_item_id, session, stars);
    `);
    this.menuRatingsTableReady = true;
  }

  async ensureDeliverySchoolAssignmentsTable() {
    if (this.deliverySchoolAssignmentsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS delivery_school_assignments (
        delivery_user_id uuid NOT NULL REFERENCES users(id),
        school_id uuid NOT NULL REFERENCES schools(id),
        session session_type NOT NULL DEFAULT 'LUNCH',
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (school_id, session)
      );
    `);
    await runSql(`
      ALTER TABLE delivery_school_assignments
      ADD COLUMN IF NOT EXISTS session session_type NOT NULL DEFAULT 'LUNCH';
    `);
    await runSql(`
      UPDATE delivery_school_assignments
      SET session = 'LUNCH'
      WHERE session IS NULL;
    `);
    await runSql(`
      WITH ranked AS (
        SELECT ctid,
               ROW_NUMBER() OVER (
                 PARTITION BY school_id, session
                 ORDER BY is_active DESC, updated_at DESC, created_at DESC, delivery_user_id
               ) AS rn
        FROM delivery_school_assignments
      )
      DELETE FROM delivery_school_assignments dsa
      USING ranked
      WHERE dsa.ctid = ranked.ctid
        AND ranked.rn > 1;
    `);
    await runSql(`
      ALTER TABLE delivery_school_assignments
      DROP CONSTRAINT IF EXISTS delivery_school_assignments_pkey;
    `);
    const assignmentPkExists = await runSql(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'delivery_school_assignments'::regclass
          AND conname = 'delivery_school_assignments_pkey'
      );
    `);
    if (assignmentPkExists !== 't') {
      await runSql(`
        ALTER TABLE delivery_school_assignments
        ADD CONSTRAINT delivery_school_assignments_pkey PRIMARY KEY (school_id, session);
      `);
    }
    // Drop-and-recreate so the index always includes the session column
    // even if an older version was created without it.
    await runSql(`DROP INDEX IF EXISTS idx_delivery_school_assignments_school;`);
    await runSql(`
      CREATE INDEX idx_delivery_school_assignments_school
      ON delivery_school_assignments(school_id, session, is_active);
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_delivery_school_assignments_delivery_user
      ON delivery_school_assignments(delivery_user_id, session, is_active);
    `);
    this.deliverySchoolAssignmentsReady = true;
  }

  async ensureSessionSettingsTable() {
    if (this.sessionSettingsTableReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS session_settings (
        session session_type PRIMARY KEY,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Single batch INSERT for all sessions instead of one query per session.
    await runSql(`
      INSERT INTO session_settings (session, is_active)
      VALUES ('LUNCH'::session_type, true),
             ('SNACK'::session_type, true),
             ('BREAKFAST'::session_type, true)
      ON CONFLICT (session) DO NOTHING;
    `);
    this.sessionSettingsTableReady = true;
  }

  async ensureParentDietaryRestrictionsTable() {
    if (this.parentDietaryRestrictionsReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS parent_dietary_restrictions (
        parent_id uuid PRIMARY KEY REFERENCES parents(id) ON DELETE CASCADE,
        restriction_label text NOT NULL DEFAULT 'ALLERGIES',
        restriction_details text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz NULL
      );
    `);
    this.parentDietaryRestrictionsReady = true;
  }

  async ensureChildRegistrationSourceColumns() {
    if (this.childRegistrationSourceColumnsReady) return;
    await runSql(`
      ALTER TABLE children
      ADD COLUMN IF NOT EXISTS registration_actor_type varchar(20) NOT NULL DEFAULT 'PARENT',
      ADD COLUMN IF NOT EXISTS registration_actor_teacher_name varchar(50),
      ADD COLUMN IF NOT EXISTS registration_actor_teacher_phone varchar(30);
    `);
    this.childRegistrationSourceColumnsReady = true;
  }

  async ensureParent2Columns() {
    if (this.parent2ColsReady) return;
    await runSql(`ALTER TABLE parents ADD COLUMN IF NOT EXISTS parent2_first_name varchar(100), ADD COLUMN IF NOT EXISTS parent2_phone varchar(30), ADD COLUMN IF NOT EXISTS parent2_email varchar(255);`);
    this.parent2ColsReady = true;
  }

  async ensureChildCurrentGradeColumn() {
    if (this.childCurrentGradeColumnReady) return;
    await runSql(`
      ALTER TABLE children
      ADD COLUMN IF NOT EXISTS current_school_grade varchar(30);
    `);
    this.childCurrentGradeColumnReady = true;
  }

  async ensureBillingReviewColumns() {
    if (this.billingReviewColumnsReady) return;
    await runSql(`
      ALTER TABLE billing_records
      ADD COLUMN IF NOT EXISTS admin_note text;
    `);
    this.billingReviewColumnsReady = true;
  }

  async ensureMenuItemTextDefaults() {
    if (this.menuItemTextDefaultsReady) return;
    await runSql(`
      UPDATE menu_items
      SET description = 'TBA',
          updated_at = now()
      WHERE deleted_at IS NULL
        AND is_available = true
        AND COALESCE(NULLIF(BTRIM(description), ''), '') = '';

      UPDATE menu_items
      SET nutrition_facts_text = 'TBA',
          updated_at = now()
      WHERE deleted_at IS NULL
        AND is_available = true
        AND COALESCE(NULLIF(BTRIM(nutrition_facts_text), ''), '') = '';
    `);
    this.menuItemTextDefaultsReady = true;
  }

  async ensureSiteSettingsTable() {
    await runSql(`
      CREATE TABLE IF NOT EXISTS site_settings (
        setting_key   text PRIMARY KEY,
        setting_value text NOT NULL DEFAULT '',
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
    `);
    // Idempotent seed rows via ON CONFLICT DO NOTHING — safe to run on
    // every call, but we still gate on a "ready" flag so hot paths
    // (getSiteSettings) don't re-query the seeds after first success.
    if (this.siteSettingsSeededReady) return;
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
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('ordering_cutoff_time', '08:00')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('assistance_message', 'For Assistance Please Whatsapp +6285211710217')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    await runSql(`
      INSERT INTO site_settings (setting_key, setting_value)
      VALUES ('ai_future_enabled', 'false')
      ON CONFLICT (setting_key) DO NOTHING;
    `);
    this.siteSettingsSeededReady = true;
  }

  async ensureMultiOrderSchema() {
    if (this.multiOrderSchemaReady) return;
    await runSql(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'SINGLE';
    `);
    await runSql(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS multi_order_group_id uuid NULL;
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS multi_order_groups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
        parent_id uuid NULL REFERENCES parents(id) ON DELETE SET NULL,
        created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        source_role text NOT NULL,
        session session_type NOT NULL,
        start_date date NOT NULL,
        end_date date NOT NULL,
        repeat_days_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        dish_selection_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'ACTIVE',
        original_total_amount numeric(12,2) NOT NULL DEFAULT 0,
        current_total_amount numeric(12,2) NOT NULL DEFAULT 0,
        started_at timestamptz NULL,
        completed_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS multi_order_occurrences (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        multi_order_group_id uuid NOT NULL REFERENCES multi_order_groups(id) ON DELETE CASCADE,
        service_date date NOT NULL,
        session session_type NOT NULL,
        order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'PLACED',
        price_snapshot_total numeric(12,2) NOT NULL DEFAULT 0,
        items_snapshot_json jsonb NOT NULL DEFAULT '[]'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS multi_order_billings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        multi_order_group_id uuid NOT NULL UNIQUE REFERENCES multi_order_groups(id) ON DELETE CASCADE,
        parent_id uuid NULL REFERENCES parents(id) ON DELETE SET NULL,
        status text NOT NULL DEFAULT 'UNPAID',
        total_amount numeric(12,2) NOT NULL DEFAULT 0,
        proof_image_url text NULL,
        proof_uploaded_at timestamptz NULL,
        verified_at timestamptz NULL,
        verified_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        admin_note text NULL,
        receipt_id uuid NULL,
        receipt_version integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS multi_order_receipts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        multi_order_billing_id uuid NOT NULL REFERENCES multi_order_billings(id) ON DELETE CASCADE,
        receipt_number text NOT NULL,
        status text NOT NULL DEFAULT 'ACTIVE',
        version integer NOT NULL DEFAULT 1,
        pdf_path text NULL,
        breakdown_json jsonb NOT NULL DEFAULT '{}'::jsonb,
        voided_at timestamptz NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      CREATE TABLE IF NOT EXISTS multi_order_change_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        multi_order_group_id uuid NOT NULL REFERENCES multi_order_groups(id) ON DELETE CASCADE,
        requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_type text NOT NULL,
        reason text NOT NULL,
        payload_json jsonb NULL,
        status text NOT NULL DEFAULT 'OPEN',
        resolved_by_user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,
        resolved_at timestamptz NULL,
        resolution_note text NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
    `);
    await runSql(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_orders_multi_order_group'
        ) THEN
          ALTER TABLE orders
          ADD CONSTRAINT fk_orders_multi_order_group
          FOREIGN KEY (multi_order_group_id) REFERENCES multi_order_groups(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await runSql(`
      CREATE INDEX IF NOT EXISTS idx_orders_multi_order_group_id
      ON orders(multi_order_group_id);
      CREATE INDEX IF NOT EXISTS idx_orders_source_type
      ON orders(source_type, service_date DESC);
      CREATE INDEX IF NOT EXISTS idx_multi_order_groups_child
      ON multi_order_groups(child_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_multi_order_groups_parent
      ON multi_order_groups(parent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_multi_order_groups_session_status
      ON multi_order_groups(session, status, start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_multi_order_occurrences_group_date
      ON multi_order_occurrences(multi_order_group_id, service_date);
      CREATE INDEX IF NOT EXISTS idx_multi_order_occurrences_order
      ON multi_order_occurrences(order_id);
      CREATE INDEX IF NOT EXISTS idx_multi_order_billings_parent
      ON multi_order_billings(parent_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_multi_order_receipts_billing
      ON multi_order_receipts(multi_order_billing_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_multi_order_change_requests_group
      ON multi_order_change_requests(multi_order_group_id, status, created_at DESC);
    `);
    await runSql(`
      CREATE UNIQUE INDEX IF NOT EXISTS orders_child_session_date_active_uq
      ON orders(child_id, service_date, session)
      WHERE deleted_at IS NULL AND status <> 'CANCELLED';
    `);
    this.multiOrderSchemaReady = true;
  }
}
