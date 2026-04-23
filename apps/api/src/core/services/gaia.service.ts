import { Injectable } from '@nestjs/common';

/**
 * GaiaService
 * ===========
 *
 * Scope:
 *   - AI assistant ("Gaia") backing the /gaia endpoint: accepts a
 *     natural-language question, resolves family/user context, builds
 *     a grounded prompt with menus/orders/billing/dietary snapshots,
 *     and calls Google Vertex AI.
 *   - AI daily usage cap enforcement (per-actor) via ai_usage_logs.
 *   - Topic classification (orders / billing / menu / profile /
 *     dietary / unknown) and blocked-topic refusal.
 *   - Quick-order flow: NL input ("dumpling tomorrow") → parse →
 *     match menu → delegate to OrderService.
 *   - Phone-based lookups used by the WhatsApp notification bot:
 *     lookupNameByPhone, getDailyOrdersByPhone, and the admin
 *     equivalents that can look up any family by phone.
 *
 * Methods that will move here from CoreService:
 *   AI runtime:
 *     - getAiRuntimeConfig
 *     - ensureAiFutureEnabled
 *     - enforceAiDailyLimit
 *     - recordAiUsage
 *     - categorizeAiQuestion
 *     - isBlockedGaiaQuestion
 *     - resolveAiFamilyScope
 *     - buildAiFamilyContext
 *     - buildGaiaPrompt
 *     - callVertexGaia
 *   Public entry points:
 *     - quickOrder
 *     - queryGaia
 *   Phone lookups:
 *     - lookupNameByPhone
 *     - resolveFamilyScopeByPhone (private)
 *     - getDailyOrdersByPhone
 *     - getAdminFamilyContextByPhone
 *     - getAdminFamilyOrdersByPhone
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureAiUsageLogsTable)
 *   - MediaService (getComputeEngineAccessToken for Vertex auth)
 *   - HelpersService (phone normalization, family scope)
 *   - MenuService (menu context for prompt)
 *   - OrderService (quickOrder delegates here for placement)
 *   - global fetch (Vertex AI REST)
 *
 * Consumers:
 *   - CoreService facade:
 *       /gaia (query), /gaia/quick-order, /public/lookup-name,
 *       /notifications/orders-by-phone, /admin/family-by-phone/*
 *   - WhatsApp bot (Brian, Casey) — via /public/lookup-name and
 *     /notifications/orders-by-phone.
 */
@Injectable()
export class GaiaService {}
