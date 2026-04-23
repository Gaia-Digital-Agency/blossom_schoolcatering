import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser, CartItemInput, SessionType } from '../core.types';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { MediaService } from './media.service';
import { SchemaService } from './schema.service';
import { SchoolsService } from './schools.service';

type DishCategory = 'MAIN' | 'APPETISER' | 'COMPLEMENT' | 'DESSERT' | 'SIDES' | 'GARNISH' | 'DRINK';
const DISH_CATEGORIES = ['MAIN', 'APPETISER', 'COMPLEMENT', 'DESSERT', 'SIDES', 'GARNISH', 'DRINK'] as const;
const SESSIONS: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];

/**
 * MenuService
 * ===========
 *
 * Scope: menu items lifecycle, ingredients, per-user ratings, public
 * (cached) and admin read views, the seed helpers, session-setting
 * toggle (uses clearPublicMenuCache), plus in-memory public-menu cache.
 *
 * See core.service public-surface.spec — these methods keep the same
 * signatures on the CoreService facade so all ~30 endpoints routed
 * through CoreController stay intact.
 */
@Injectable()
export class MenuService {
  private readonly publicMenuCacheTtlMs = 60_000;
  private publicMenuCache = new Map<string, {
    data: {
      serviceDate: string;
      session: SessionType | 'ALL';
      items: unknown[];
      sessionSettings: Array<{ session: SessionType; is_active: boolean }>;
    };
    expiresAt: number;
  }>();

  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly schools: SchoolsService,
  ) {}

  async resolveCreateMenuServiceDate(session: SessionType) {
    const latest = await runSql(
      `SELECT MAX(service_date)::text
       FROM menus
       WHERE session = $1::session_type
         AND deleted_at IS NULL;`,
      [session],
    );
    const trimmed = String(latest || '').trim();
    if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return this.helpers.nextWeekdayIsoDate();
  }

  sanitizePackingRequirement(value?: string) {
    return (value || '').trim().slice(0, 200);
  }

  normalizeDishCategory(value?: string): DishCategory {
    const normalized = String(value || '').trim().toUpperCase();
    // Backward compatibility: old SNACKS label is folded into SIDES.
    if (normalized === 'SNACKS') return 'SIDES';
    if ((DISH_CATEGORIES as readonly string[]).includes(normalized)) {
      return normalized as DishCategory;
    }
    throw new BadRequestException('Invalid dish category');
  }

  normalizeAllergies(allergiesRaw?: string) {
    const cleaned = (allergiesRaw || '').trim().replace(/\s+/g, ' ');
    const fallback = 'No Allergies';
    if (!cleaned) return fallback;
    if (cleaned.length > 50) {
      throw new BadRequestException('Allergies must be 50 characters or less');
    }
    return cleaned;
  }

  async ensureMenuForDateSession(serviceDate: string, session: SessionType) {
    const existing = await runSql(
      `SELECT id
       FROM menus
       WHERE service_date = $1::date
         AND session = $2::session_type
       LIMIT 1;`,
      [serviceDate, session],
    );
    if (existing) return existing;

    return runSql(
      `INSERT INTO menus (session, service_date, is_published)
       VALUES ($1::session_type, $2::date, true)
       RETURNING id;`,
      [session, serviceDate],
    );
  }

  async updateSessionSetting(actor: AccessUser, sessionRaw: string, isActive?: boolean) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const session = this.helpers.normalizeSession(sessionRaw);
    if (session === 'LUNCH' && !isActive) {
      throw new BadRequestException('LUNCH session must remain active');
    }
    const out = await runSql(
      `WITH updated AS (
         UPDATE session_settings
         SET is_active = $1,
             updated_at = now()
         WHERE session = $2::session_type
         RETURNING session::text AS session, is_active
       )
       SELECT row_to_json(updated)::text
       FROM updated;`,
      [isActive, session],
    );
    if (!out) throw new NotFoundException('Session setting not found');
    this.clearPublicMenuCache();
    const updated = this.helpers.parseJsonLine<{ session: SessionType; is_active: boolean }>(out);
    await this.audit.recordAdminAudit(actor, 'SESSION_SETTING_UPDATED', 'session-setting', updated.session, {
      isActive: updated.is_active,
    });
    return updated;
  }

  normalizeMenuText(raw?: string | null) {
    return String(raw || '').trim() || 'TBA';
  }

  async ensureTbaIngredientId() {
    const existingId = await runSql(
      `
      SELECT id
      FROM ingredients
      WHERE lower(name) = 'tba'
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT 1;
      `,
    );
    if (existingId) return existingId;
    return runSql(
      `
      INSERT INTO ingredients (name, allergen_flag, is_active)
      VALUES ('TBA', false, true)
      RETURNING id;
      `,
    );
  }

  async getMenus(actor: AccessUser, query: {
    serviceDate?: string;
    session?: string;
    search?: string;
    priceMin?: string;
    priceMax?: string;
    allergenExclude?: string;
    favouritesOnly?: string;
  }) {
    if (!['PARENT', 'YOUNGSTER', 'ADMIN', 'KITCHEN'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const serviceDate = query.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(query.serviceDate)
      ? query.serviceDate
      : null;
    const session = query.session ? this.helpers.normalizeSession(query.session) : null;
    const search = (query.search || '').trim().toLowerCase();
    const priceMin = query.priceMin ? Number(query.priceMin) : null;
    const priceMax = query.priceMax ? Number(query.priceMax) : null;
    const favouritesOnly = String(query.favouritesOnly || '').toLowerCase() === 'true';
    const allergenExcludeIds = (query.allergenExclude || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

    const filters: string[] = [];
    const params: unknown[] = [];
    const dateFilter = serviceDate
      ? `AND m.service_date = $${params.push(serviceDate)}::date`
      : '';
    if (['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      if (session) {
        const active = await this.schools.isSessionActive(session);
        if (!active) {
          return { serviceDate, session, items: [] };
        }
      } else {
        filters.push(`EXISTS (
          SELECT 1
          FROM session_settings ss
          WHERE ss.session = m.session
            AND ss.is_active = true
        )`);
      }
    }
    if (session) {
      params.push(session);
      filters.push(`m.session = $${params.length}::session_type`);
    }
    if (search) {
      params.push(`%${search}%`, `%${search}%`);
      filters.push(`(lower(mi.name) LIKE $${params.length - 1} OR lower(mi.description) LIKE $${params.length})`);
    }
    if (priceMin !== null && Number.isFinite(priceMin)) {
      params.push(Number(priceMin.toFixed(2)));
      filters.push(`mi.price >= $${params.length}`);
    }
    if (priceMax !== null && Number.isFinite(priceMax)) {
      params.push(Number(priceMax.toFixed(2)));
      filters.push(`mi.price <= $${params.length}`);
    }
    if (favouritesOnly) {
      params.push(actor.uid);
      filters.push(`EXISTS (
        SELECT 1
        FROM favourite_meal_items fmi
        JOIN favourite_meals fm ON fm.id = fmi.favourite_meal_id
        WHERE fmi.menu_item_id = mi.id
          AND fm.created_by_user_id = $${params.length}
          AND fm.is_active = true
          AND fm.deleted_at IS NULL
      )`);
    }
    if (allergenExcludeIds.length > 0) {
      const ph = allergenExcludeIds.map(() => {
        params.push('');
        return `$${params.length}`;
      });
      for (let i = 0; i < allergenExcludeIds.length; i += 1) params[params.length - allergenExcludeIds.length + i] = allergenExcludeIds[i];
      filters.push(`NOT EXISTS (
        SELECT 1
        FROM menu_item_ingredients mii2
        WHERE mii2.menu_item_id = mi.id
          AND mii2.ingredient_id IN (${ph.join(', ')})
      )`);
    }
    const filterSql = filters.length ? `AND ${filters.join('\n          AND ')}` : '';

    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients,
               COALESCE(bool_or(i.allergen_flag), false) AS has_allergen
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE 1=1
          ${dateFilter}
          AND m.is_published = true
          AND m.deleted_at IS NULL
          AND mi.is_available = true
          AND mi.deleted_at IS NULL
          ${filterSql}
        GROUP BY mi.id, m.service_date, m.session
        ORDER BY m.session ASC, lower(mi.name) ASC
      ) t;
    `,
      params,
    );

    return {
      serviceDate,
      session: session || 'ALL',
      items: this.helpers.parseJsonLines(out),
    };
  }

  async getPublicActiveMenu(query: { serviceDate?: string; session?: string }) {
    const serviceDate = query.serviceDate ? this.helpers.validateServiceDate(query.serviceDate) : 'ALL_ACTIVE';
    const session = query.session ? this.helpers.normalizeSession(query.session) : null;
    const cacheKey = this.getPublicMenuCacheKey(serviceDate, session);
    const cached = this.publicMenuCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.data;
    const sessionSettings = await this.schools.getSessionSettings();
    if (session) {
      const active = await this.schools.isSessionActive(session);
      if (!active) {
        const emptyResult = {
          serviceDate,
          session,
          items: [],
          sessionSettings,
        };
        this.publicMenuCache.set(cacheKey, {
          data: emptyResult,
          expiresAt: Date.now() + this.publicMenuCacheTtlMs,
        });
        return emptyResult;
      }
    }
    const params: unknown[] = [];
    const whereSession = session
      ? `AND m.session = $1::session_type`
      : '';
    const activeSessionFilter = session
      ? ''
      : `AND EXISTS (
            SELECT 1
            FROM session_settings ss
            WHERE ss.session = m.session
              AND ss.is_active = true
          )`;
    if (session) params.push(session);
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               mi.name,
               mi.description,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.updated_at::text AS updated_at,
               m.session::text AS session,
               m.service_date::text AS service_date
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        WHERE 1=1
          ${whereSession}
          ${activeSessionFilter}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
        ORDER BY m.service_date DESC, m.session ASC, lower(mi.name) ASC
      ) t;
      `,
      params,
    );

    const result: {
      serviceDate: string;
      session: SessionType | 'ALL';
      items: unknown[];
      sessionSettings: Array<{ session: SessionType; is_active: boolean }>;
    } = {
      serviceDate,
      session: (session || 'ALL') as SessionType | 'ALL',
      items: this.helpers.parseJsonLines(out),
      sessionSettings,
    };
    this.publicMenuCache.set(cacheKey, {
      data: result,
      expiresAt: Date.now() + this.publicMenuCacheTtlMs,
    });
    return result;
  }

  async getAdminIngredients() {
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT id, name, allergen_flag, is_active
        FROM ingredients
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      ) t;
    `);
    return this.helpers.parseJsonLines(out);
  }

  async getAdminMenus(query: { session?: string }) {
    const session = query.session ? this.helpers.normalizeSession(query.session) : null;
    const params: unknown[] = [];
    const filterSql = session
      ? (() => { params.push(session); return `AND m.session = $${params.length}::session_type`; })()
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               mi.menu_id,
               m.service_date::text AS service_date,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               mi.display_order,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids,
               COALESCE(array_agg(DISTINCT i.name) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredients
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE 1 = 1
          ${filterSql}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
        GROUP BY mi.id, m.service_date, m.session
        ORDER BY m.service_date DESC, m.session ASC, lower(mi.name) ASC
      ) t;
    `,
      params,
    );
    return {
      session: session || 'ALL',
      items: this.helpers.parseJsonLines(out),
    };
  }

  async getAdminMenuRatings(query: { serviceDate?: string; session?: string }) {
    const serviceDate = query.serviceDate && /^\d{4}-\d{2}-\d{2}$/.test(query.serviceDate)
      ? query.serviceDate
      : null;
    const session = query.session ? this.helpers.normalizeSession(query.session) : null;
    const params: unknown[] = [];
    const dateFilter = serviceDate
      ? `AND m.service_date = $${params.push(serviceDate)}::date`
      : '';
    const sessionFilter = session
      ? `AND m.session = $${params.push(session)}::session_type`
      : '';
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id AS menu_item_id,
               mi.name,
               m.session::text AS session,
               m.service_date::text AS service_date,
               COALESCE(SUM(CASE WHEN mir.stars = 1 THEN 1 ELSE 0 END), 0)::int AS star_1_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 2 THEN 1 ELSE 0 END), 0)::int AS star_2_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 3 THEN 1 ELSE 0 END), 0)::int AS star_3_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 4 THEN 1 ELSE 0 END), 0)::int AS star_4_votes,
               COALESCE(SUM(CASE WHEN mir.stars = 5 THEN 1 ELSE 0 END), 0)::int AS star_5_votes,
               COALESCE(COUNT(mir.user_id), 0)::int AS total_votes
        FROM menus m
        JOIN menu_items mi ON mi.menu_id = m.id
        LEFT JOIN menu_item_ratings mir
          ON mir.menu_item_id = mi.id
         AND mir.session = m.session
        WHERE 1=1
          ${dateFilter}
          ${sessionFilter}
          AND m.deleted_at IS NULL
          AND mi.deleted_at IS NULL
        GROUP BY mi.id, mi.name, m.session, m.service_date
        ORDER BY m.service_date DESC, m.session ASC, mi.display_order ASC, mi.name ASC
      ) t;
      `,
      params,
    );
    return {
      serviceDate,
      session,
      items: this.helpers.parseJsonLines(out),
    };
  }

  async createOrUpdateMenuRating(actor: AccessUser, input: { menuItemId: string; stars: number }) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) {
      throw new ForbiddenException('Role not allowed');
    }
    const menuItemId = (input.menuItemId || '').trim();
    const stars = Number(input.stars);
    if (!menuItemId) throw new BadRequestException('menuItemId is required');
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      throw new BadRequestException('stars must be an integer between 1 and 5');
    }

    const activeItem = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT mi.id, m.session::text AS session
         FROM menu_items mi
         JOIN menus m ON m.id = mi.menu_id
         WHERE mi.id = $1
           AND mi.is_available = true
           AND mi.deleted_at IS NULL
           AND m.is_published = true
           AND m.deleted_at IS NULL
         LIMIT 1
       ) t;`,
      [menuItemId],
    );
    if (!activeItem) throw new NotFoundException('Active dish not found');
    const item = this.helpers.parseJsonLine<{ id: string; session: SessionType }>(activeItem);

    await runSql(
      `INSERT INTO menu_item_ratings (menu_item_id, user_id, session, user_role, stars)
       VALUES ($1, $2, $3::session_type, $4, $5)
       ON CONFLICT (menu_item_id, user_id, session)
       DO UPDATE SET stars = EXCLUDED.stars,
                     user_role = EXCLUDED.user_role,
                     updated_at = now();`,
      [menuItemId, actor.uid, item.session, actor.role, stars],
    );

    return { ok: true, menuItemId, session: item.session, stars };
  }

  async createAdminMenuItem(actor: AccessUser, input: {
    serviceDate?: string;
    session?: string;
    name?: string;
    description?: string;
    nutritionFactsText?: string;
    caloriesKcal?: number;
    price?: number;
    imageUrl?: string;
    ingredientIds?: string[];
    isAvailable?: boolean;
    displayOrder?: number;
    cutleryRequired?: boolean;
    packingRequirement?: string;
    isVegetarian?: boolean;
    isGlutenFree?: boolean;
    isDairyFree?: boolean;
    containsPeanut?: boolean;
    dishCategory?: string;
  }) {
    const session = this.helpers.normalizeSession(input.session);
    const serviceDate = input.serviceDate
      ? this.helpers.validateServiceDate(input.serviceDate)
      : await this.resolveCreateMenuServiceDate(session);
    const name = this.normalizeMenuText(input.name);
    const description = this.normalizeMenuText(input.description);
    const nutritionFactsText = this.normalizeMenuText(input.nutritionFactsText);
    const caloriesKcal = input.caloriesKcal === undefined || input.caloriesKcal === null ? null : Number(input.caloriesKcal);
    const price = input.price === undefined || input.price === null || String(input.price).trim() === '' ? 0 : Number(input.price);
    const rawImageUrl = (input.imageUrl || '').trim();
    const ingredientIdsRaw = Array.isArray(input.ingredientIds) ? input.ingredientIds.filter(Boolean) : [];
    const isAvailable = input.isAvailable !== false;
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : 0;
    const cutleryRequired = Boolean(input.cutleryRequired);
    const packingRequirement = this.sanitizePackingRequirement(input.packingRequirement);
    const isVegetarian = Boolean(input.isVegetarian);
    const isGlutenFree = Boolean(input.isGlutenFree);
    const isDairyFree = Boolean(input.isDairyFree);
    const containsPeanut = Boolean(input.containsPeanut);
    const dishCategory = this.normalizeDishCategory(input.dishCategory);

    if (price < 0 || Number.isNaN(price)) {
      throw new BadRequestException('Invalid price');
    }
    if (name !== 'TBA' && description !== 'TBA' && name.localeCompare(description, undefined, { sensitivity: 'accent' }) === 0) {
      throw new BadRequestException('Dish name and description must be different');
    }
    const ingredientIds = ingredientIdsRaw.length > 0 ? ingredientIdsRaw : [await this.ensureTbaIngredientId()];
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = await this.media.resolveMenuImageUrl(rawImageUrl, name);

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    const itemOut = await runSql(
      `WITH inserted AS (
         INSERT INTO menu_items (
           menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement,
           is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           $12, $13, $14, $15, $16
         )
         RETURNING id, name
       )
       SELECT row_to_json(inserted)::text
       FROM inserted;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
        isVegetarian,
        isGlutenFree,
        isDairyFree,
        containsPeanut,
        dishCategory,
      ],
    );
    const item = this.helpers.parseJsonLine<{ id: string; name: string }>(itemOut);

    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [item.id, ingredientId],
      );
    }

    this.clearPublicMenuCache();
    await this.audit.recordAdminAudit(actor, 'MENU_ITEM_CREATED', 'menu-item', item.id, { itemName: item.name });
    return { ok: true, itemId: item.id, itemName: item.name };
  }

  async updateAdminMenuItem(
    actor: AccessUser,
    itemId: string,
    input: {
      serviceDate?: string;
      session?: string;
      name?: string;
      description?: string;
      nutritionFactsText?: string;
      caloriesKcal?: number;
      price?: number;
      imageUrl?: string;
      ingredientIds?: string[];
      isAvailable?: boolean;
      displayOrder?: number;
      cutleryRequired?: boolean;
      packingRequirement?: string;
      isVegetarian?: boolean;
      isGlutenFree?: boolean;
      isDairyFree?: boolean;
      containsPeanut?: boolean;
      dishCategory?: string;
    },
  ) {
    const currentOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT mi.id,
               m.service_date::text AS service_date,
               m.session::text AS session,
               mi.name,
               mi.description,
               mi.nutrition_facts_text,
               mi.calories_kcal,
               mi.price,
               mi.dish_category,
               mi.image_url,
               mi.is_available,
               mi.display_order,
               mi.is_vegetarian,
               mi.is_gluten_free,
               mi.is_dairy_free,
               mi.contains_peanut,
               mi.cutlery_required,
               mi.packing_requirement,
               COALESCE(array_agg(DISTINCT i.id::text) FILTER (WHERE i.id IS NOT NULL), '{}') AS ingredient_ids
        FROM menu_items mi
        JOIN menus m ON m.id = mi.menu_id
        LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
        LEFT JOIN ingredients i ON i.id = mii.ingredient_id AND i.deleted_at IS NULL
        WHERE mi.id = $1
          AND mi.deleted_at IS NULL
        GROUP BY mi.id, m.service_date, m.session
        LIMIT 1
      ) t;
    `,
      [itemId],
    );
    if (!currentOut) throw new NotFoundException('Menu item not found');
    const current = this.helpers.parseJsonLine<{
      id: string;
      service_date: string;
      session: SessionType;
      name: string;
      description: string;
      nutrition_facts_text?: string | null;
      calories_kcal?: number | null;
      price: string | number;
      dish_category: string;
      image_url?: string | null;
      is_available: boolean;
      display_order: number;
      is_vegetarian: boolean;
      is_gluten_free: boolean;
      is_dairy_free: boolean;
      contains_peanut: boolean;
      cutlery_required: boolean;
      packing_requirement?: string | null;
      ingredient_ids: string[];
    }>(currentOut);

    const serviceDate = input.serviceDate ? this.helpers.validateServiceDate(input.serviceDate) : current.service_date;
    const session = input.session ? this.helpers.normalizeSession(input.session) : current.session;
    const name = input.name !== undefined ? this.normalizeMenuText(input.name) : this.normalizeMenuText(current.name);
    const description = input.description !== undefined ? this.normalizeMenuText(input.description) : this.normalizeMenuText(current.description);
    const nutritionFactsText = input.nutritionFactsText !== undefined
      ? this.normalizeMenuText(input.nutritionFactsText)
      : this.normalizeMenuText(current.nutrition_facts_text);
    const caloriesKcal = input.caloriesKcal === undefined
      ? (current.calories_kcal ?? null)
      : (input.caloriesKcal === null ? null : Number(input.caloriesKcal));
    const price = input.price === undefined
      ? Number(current.price || 0)
      : (input.price === null || String(input.price).trim() === '' ? 0 : Number(input.price));
    const rawImageUrl = input.imageUrl !== undefined
      ? input.imageUrl.trim()
      : String(current.image_url || '').trim();
    const ingredientIdsRaw = Array.isArray(input.ingredientIds)
      ? input.ingredientIds.filter(Boolean)
      : Array.isArray(current.ingredient_ids) ? current.ingredient_ids : [];
    const isAvailable = input.isAvailable === undefined ? Boolean(current.is_available) : Boolean(input.isAvailable);
    const displayOrder = Number.isInteger(input.displayOrder) ? Number(input.displayOrder) : Number(current.display_order || 0);
    const cutleryRequired = input.cutleryRequired === undefined ? Boolean(current.cutlery_required) : Boolean(input.cutleryRequired);
    const isVegetarian = input.isVegetarian === undefined ? Boolean(current.is_vegetarian) : Boolean(input.isVegetarian);
    const isGlutenFree = input.isGlutenFree === undefined ? Boolean(current.is_gluten_free) : Boolean(input.isGlutenFree);
    const isDairyFree = input.isDairyFree === undefined ? Boolean(current.is_dairy_free) : Boolean(input.isDairyFree);
    const containsPeanut = input.containsPeanut === undefined ? Boolean(current.contains_peanut) : Boolean(input.containsPeanut);
    const dishCategory = input.dishCategory === undefined
      ? this.normalizeDishCategory(current.dish_category)
      : this.normalizeDishCategory(input.dishCategory);
    const packingRequirement = this.sanitizePackingRequirement(
      input.packingRequirement === undefined ? (current.packing_requirement || '') : input.packingRequirement,
    );

    if (price < 0 || Number.isNaN(price)) {
      throw new BadRequestException('Invalid price');
    }
    if (name !== 'TBA' && description !== 'TBA' && name.localeCompare(description, undefined, { sensitivity: 'accent' }) === 0) {
      throw new BadRequestException('Dish name and description must be different');
    }
    const ingredientIds = ingredientIdsRaw.length > 0 ? ingredientIdsRaw : [await this.ensureTbaIngredientId()];
    if (caloriesKcal !== null && (!Number.isInteger(caloriesKcal) || caloriesKcal < 0)) {
      throw new BadRequestException('Invalid caloriesKcal');
    }
    if (ingredientIds.length > 20) {
      throw new BadRequestException('Maximum 20 ingredients per dish');
    }
    const imageUrl = input.imageUrl !== undefined
      ? await this.media.resolveMenuImageUrl(rawImageUrl, name)
      : (rawImageUrl || '/schoolcatering/assets/hero-meal.jpg');

    const menuId = await this.ensureMenuForDateSession(serviceDate, session);
    await runSql(
      `UPDATE menu_items
       SET menu_id = $1,
           name = $2,
           description = $3,
           nutrition_facts_text = $4,
           calories_kcal = $5,
           price = $6,
           image_url = $7,
           is_available = $8,
           display_order = $9,
           cutlery_required = $10,
           packing_requirement = $11,
           is_vegetarian = $12,
           is_gluten_free = $13,
           is_dairy_free = $14,
           contains_peanut = $15,
           dish_category = $16,
           updated_at = now()
       WHERE id = $17
         AND deleted_at IS NULL;`,
      [
        menuId,
        name,
        description,
        nutritionFactsText,
        caloriesKcal,
        Number(price.toFixed(2)),
        imageUrl,
        isAvailable,
        displayOrder,
        cutleryRequired,
        packingRequirement || null,
        isVegetarian,
        isGlutenFree,
        isDairyFree,
        containsPeanut,
        dishCategory,
        itemId,
      ],
    );

    await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
    for (const ingredientId of ingredientIds) {
      await runSql(
        `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
         VALUES ($1, $2)
         ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
        [itemId, ingredientId],
      );
    }
    this.clearPublicMenuCache();
    await this.audit.recordAdminAudit(actor, 'MENU_ITEM_UPDATED', 'menu-item', itemId, {
      serviceDate,
      session,
      name,
      isAvailable,
    });
    return { ok: true };
  }

  async seedAdminMenuSample(serviceDateRaw?: string) {
    const serviceDate = this.helpers.validateServiceDate(serviceDateRaw);
    const sourceBySessionOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT m.session::text AS session,
                MAX(m.service_date)::text AS source_service_date
         FROM menus m
         JOIN menu_items mi
           ON mi.menu_id = m.id
          AND mi.deleted_at IS NULL
          AND mi.is_available = true
         WHERE m.deleted_at IS NULL
         GROUP BY m.session
       ) t;`,
    );
    const sourceBySession = this.helpers.parseJsonLines<{ session: SessionType; source_service_date: string }>(sourceBySessionOut);
    const sourceDateMap = new Map<SessionType, string>();
    for (const row of sourceBySession) {
      sourceDateMap.set(row.session, row.source_service_date);
    }

    const createdIds: string[] = [];
    const sourceDatesUsed: Array<{ session: SessionType; sourceServiceDate: string }> = [];

    for (const session of SESSIONS) {
      const sourceServiceDate = sourceDateMap.get(session);
      if (!sourceServiceDate) {
        throw new BadRequestException(`No active dishes found to seed for session: ${session}`);
      }
      sourceDatesUsed.push({ session, sourceServiceDate });

      const sourceItemsOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT mi.name,
                  mi.description,
                  mi.nutrition_facts_text,
                  mi.calories_kcal,
                  mi.price,
                  mi.image_url,
                  mi.is_available,
                  mi.display_order,
                  mi.cutlery_required,
                  mi.packing_requirement,
                  mi.is_vegetarian,
                  mi.is_gluten_free,
                  mi.is_dairy_free,
                  mi.contains_peanut,
                  COALESCE(mi.dish_category, 'MAIN') AS dish_category,
                  COALESCE(
                    array_agg(DISTINCT mii.ingredient_id::text) FILTER (WHERE mii.ingredient_id IS NOT NULL),
                    '{}'
                  ) AS ingredient_ids
           FROM menu_items mi
           JOIN menus m ON m.id = mi.menu_id
           LEFT JOIN menu_item_ingredients mii ON mii.menu_item_id = mi.id
           WHERE m.session = $1::session_type
             AND m.service_date = $2::date
             AND m.deleted_at IS NULL
             AND mi.deleted_at IS NULL
             AND mi.is_available = true
           GROUP BY mi.id
           ORDER BY mi.display_order ASC, mi.name ASC
         ) t;`,
        [session, sourceServiceDate],
      );
      const sourceItems = this.helpers.parseJsonLines<{
        name: string;
        description?: string | null;
        nutrition_facts_text?: string | null;
        calories_kcal?: number | null;
        price: string | number;
        image_url?: string | null;
        is_available: boolean;
        display_order: number;
        cutlery_required: boolean;
        packing_requirement?: string | null;
        is_vegetarian?: boolean;
        is_gluten_free?: boolean;
        is_dairy_free?: boolean;
        contains_peanut?: boolean;
        dish_category?: string | null;
        ingredient_ids: string[];
      }>(sourceItemsOut);
      if (sourceItems.length === 0) {
        continue;
      }

      const targetMenuId = await this.ensureMenuForDateSession(serviceDate, session);
      for (const sourceItem of sourceItems) {
        const existing = await runSql(
          `SELECT id
           FROM menu_items
           WHERE menu_id = $1
             AND lower(name) = lower($2)
             AND deleted_at IS NULL
           LIMIT 1;`,
          [targetMenuId, sourceItem.name],
        );

        const normalizedDishCategory = this.normalizeDishCategory(sourceItem.dish_category || 'MAIN');
        let itemId = existing;
        if (itemId) {
          await runSql(
            `UPDATE menu_items
             SET description = $1,
                 nutrition_facts_text = $2,
                 calories_kcal = $3,
                 price = $4,
                 image_url = $5,
                 is_available = $6,
                 display_order = $7,
                 cutlery_required = $8,
                 packing_requirement = $9,
                 is_vegetarian = $10,
                 is_gluten_free = $11,
                 is_dairy_free = $12,
                 contains_peanut = $13,
                 dish_category = $14,
                 updated_at = now()
             WHERE id = $15;`,
            [
              sourceItem.description || '',
              String(sourceItem.nutrition_facts_text || '').trim() || 'TBA',
              sourceItem.calories_kcal ?? null,
              Number(Number(sourceItem.price || 0).toFixed(2)),
              sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg',
              Boolean(sourceItem.is_available),
              Number(sourceItem.display_order || 0),
              Boolean(sourceItem.cutlery_required),
              sourceItem.packing_requirement || null,
              Boolean(sourceItem.is_vegetarian),
              Boolean(sourceItem.is_gluten_free),
              Boolean(sourceItem.is_dairy_free),
              Boolean(sourceItem.contains_peanut),
              normalizedDishCategory,
              itemId,
            ],
          );
        } else {
          itemId = await runSql(
            `INSERT INTO menu_items (
               menu_id, name, description, nutrition_facts_text, calories_kcal, price, image_url, is_available, display_order, cutlery_required, packing_requirement,
               is_vegetarian, is_gluten_free, is_dairy_free, contains_peanut, dish_category
             )
             VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
               $12, $13, $14, $15, $16
             )
             RETURNING id;`,
            [
              targetMenuId,
              sourceItem.name,
              sourceItem.description || '',
              String(sourceItem.nutrition_facts_text || '').trim() || 'TBA',
              sourceItem.calories_kcal ?? null,
              Number(Number(sourceItem.price || 0).toFixed(2)),
              sourceItem.image_url || '/schoolcatering/assets/hero-meal.jpg',
              Boolean(sourceItem.is_available),
              Number(sourceItem.display_order || 0),
              Boolean(sourceItem.cutlery_required),
              sourceItem.packing_requirement || null,
              Boolean(sourceItem.is_vegetarian),
              Boolean(sourceItem.is_gluten_free),
              Boolean(sourceItem.is_dairy_free),
              Boolean(sourceItem.contains_peanut),
              normalizedDishCategory,
            ],
          );
        }

        createdIds.push(itemId);
        await runSql(`DELETE FROM menu_item_ingredients WHERE menu_item_id = $1;`, [itemId]);
        for (const ingredientId of (sourceItem.ingredient_ids || [])) {
          await runSql(
            `INSERT INTO menu_item_ingredients (menu_item_id, ingredient_id)
             VALUES ($1, $2)
             ON CONFLICT (menu_item_id, ingredient_id) DO NOTHING;`,
            [itemId, ingredientId],
          );
        }
      }

      await runSql(
        `UPDATE menus
         SET is_published = true, updated_at = now()
         WHERE id = $1;`,
        [targetMenuId],
      );
    }
    this.clearPublicMenuCache();
    return { ok: true, serviceDate, sourceDatesUsed, createdItemIds: createdIds };
  }

  async createIngredient(actor: AccessUser, input: { name?: string; allergenFlag?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const name = (input.name || '').trim();
    const allergenFlag = input.allergenFlag === true;
    const existingOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, name, allergen_flag, is_active
         FROM ingredients
         WHERE lower(name) = lower($1)
         LIMIT 1
       ) t;`,
      [name],
    );
    if (existingOut) {
      const existing = this.helpers.parseJsonLine<{ id: string; allergen_flag: boolean }>(existingOut);
      const updateOut = await runSql(
        `WITH updated AS (
           UPDATE ingredients
           SET name = $1,
               allergen_flag = ($2 OR allergen_flag),
               is_active = true,
               deleted_at = NULL,
               updated_at = now()
           WHERE id = $3
           RETURNING id, name, allergen_flag, is_active
         )
         SELECT row_to_json(updated)::text FROM updated;`,
        [name, allergenFlag, existing.id],
      );
      if (!updateOut) throw new BadRequestException('Failed to update ingredient');
      const ingredient = this.helpers.parseJsonLine<{ id: string; name: string }>(updateOut);
      await this.audit.recordAdminAudit(actor, 'INGREDIENT_UPSERTED', 'ingredient', ingredient.id, {
        name: ingredient.name,
      });
      return ingredient;
    }
    const insertOut = await runSql(
      `WITH inserted AS (
         INSERT INTO ingredients (name, allergen_flag, is_active)
         VALUES ($1, $2, true)
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(inserted)::text FROM inserted;`,
      [name, allergenFlag],
    );
    if (!insertOut) throw new BadRequestException('Failed to create ingredient');
    const ingredient = this.helpers.parseJsonLine<{ id: string; name: string }>(insertOut);
    await this.audit.recordAdminAudit(actor, 'INGREDIENT_CREATED', 'ingredient', ingredient.id, {
      name: ingredient.name,
    });
    return ingredient;
  }

  async updateIngredient(actor: AccessUser, ingredientId: string, input: { name?: string; allergenFlag?: boolean; isActive?: boolean }) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(ingredientId, 'ingredientId');
    const updates: string[] = [];
    const params: unknown[] = [];
    if (input.name) { params.push(input.name.trim()); updates.push(`name = $${params.length}`); }
    if (typeof input.allergenFlag === 'boolean') { params.push(input.allergenFlag); updates.push(`allergen_flag = $${params.length}`); }
    if (typeof input.isActive === 'boolean') { params.push(input.isActive); updates.push(`is_active = $${params.length}`); }
    if (updates.length === 0) throw new BadRequestException('No fields to update');
    updates.push('updated_at = now()');
    params.push(ingredientId);
    const out = await runSql(
      `WITH updated AS (
         UPDATE ingredients SET ${updates.join(', ')}
         WHERE id = $${params.length} AND deleted_at IS NULL
         RETURNING id, name, allergen_flag, is_active
       )
       SELECT row_to_json(updated)::text FROM updated;`,
      params,
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    const ingredient = this.helpers.parseJsonLine<{ id: string; name: string }>(out);
    await this.audit.recordAdminAudit(actor, 'INGREDIENT_UPDATED', 'ingredient', ingredient.id, {
      name: ingredient.name,
    });
    return ingredient;
  }

  async deleteIngredient(actor: AccessUser, ingredientId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(ingredientId, 'ingredientId');
    const out = await runSql(
      `UPDATE ingredients SET deleted_at = now(), is_active = false, updated_at = now()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING id;`,
      [ingredientId],
    );
    if (!out) throw new NotFoundException('Ingredient not found');
    await this.audit.recordAdminAudit(actor, 'INGREDIENT_DELETED', 'ingredient', ingredientId);
    return { ok: true };
  }

  async deleteMenuItem(actor: AccessUser, itemId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(itemId, 'itemId');

    const itemOut = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id, is_available, deleted_at::text AS deleted_at
         FROM menu_items
         WHERE id = $1
         LIMIT 1
       ) t;`,
      [itemId],
    );
    if (!itemOut) throw new NotFoundException('Menu item not found');
    const item = this.helpers.parseJsonLine<{ id: string; is_available: boolean; deleted_at?: string | null }>(itemOut);

    if (item.is_available) {
      throw new BadRequestException('Deactivate dish first before deleting permanently');
    }

    // Soft-delete the dish so FK references in order history remain valid.
    // Clear cart and favourite references (pending/ephemeral data) before hiding.
    await runSql(`DELETE FROM cart_items WHERE menu_item_id = $1;`, [itemId]);
    await runSql(`DELETE FROM favourite_meal_items WHERE menu_item_id = $1;`, [itemId]);
    await runSql(
      `UPDATE menu_items SET deleted_at = now(), updated_at = now() WHERE id = $1;`,
      [itemId],
    );
    this.clearPublicMenuCache();
    await this.audit.recordAdminAudit(actor, 'MENU_ITEM_DELETED', 'menu-item', itemId);
    return { ok: true };
  }

  getPublicMenuCacheKey(serviceDate: string, session: SessionType | null) {
    return `${serviceDate}|${session || 'ALL'}`;
  }

  clearPublicMenuCache() {
    this.publicMenuCache.clear();
  }

}
