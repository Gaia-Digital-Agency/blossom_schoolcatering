import { Injectable } from '@nestjs/common';

/**
 * AuditService
 * ============
 *
 * Scope:
 *   - Owns the admin_audit_trail table: schema migration and writes.
 *   - Records every privileged admin action (create/update/delete of
 *     users, menus, schools, billing decisions, etc.) with actor,
 *     target, before/after payloads.
 *   - Serves the admin-visible audit log query used by the /admin/audit
 *     surface.
 *
 * Methods that will move here from CoreService:
 *   - ensureAdminAuditTrailTable (private migration)
 *   - recordAdminAudit          (private write, called by ~30 sites)
 *   - getAdminAuditLogs         (public read)
 *
 * Dependencies:
 *   - runSql (db.util)
 *
 * Consumers:
 *   - CoreService facade (for getAdminAuditLogs)
 *   - Every other sub-service that mutates admin-visible state calls
 *     recordAdminAudit.
 */
@Injectable()
export class AuditService {}
