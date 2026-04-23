import { ForbiddenException, Injectable } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser } from '../core.types';

/**
 * AuditService
 * ============
 *
 * Scope:
 *   - Owns the admin_audit_logs table: schema migration and writes.
 *   - Records every privileged admin action (create/update/delete of
 *     users, menus, schools, billing decisions, etc.) with actor,
 *     target, before/after payloads.
 *   - Serves the admin-visible audit log query used by the /admin/audit
 *     surface.
 *
 * Owned methods (moved from CoreService in this extraction):
 *   - ensureAdminAuditTrailTable (idempotent migration)
 *   - recordAdminAudit          (write; no-op for non-ADMIN actors)
 *   - getAdminAuditLogs         (admin-gated read with filters)
 *
 * Dependencies:
 *   - runSql (db.util)
 *
 * Consumers:
 *   - CoreService facade (for getAdminAuditLogs)
 *   - Every sub-service that mutates admin-visible state calls
 *     recordAdminAudit through the facade or direct injection.
 */
@Injectable()
export class AuditService {
  private adminAuditTrailReady = false;

  async ensureAdminAuditTrailTable() {
    if (this.adminAuditTrailReady) return;
    await runSql(`
      CREATE TABLE IF NOT EXISTS admin_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_user_id uuid NOT NULL REFERENCES users(id),
        action text NOT NULL,
        target_type text NOT NULL,
        target_id text NULL,
        metadata_json text NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs(actor_user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_type, created_at DESC);
    `);
    this.adminAuditTrailReady = true;
  }

  async recordAdminAudit(
    actor: AccessUser,
    action: string,
    targetType: string,
    targetId?: string | null,
    metadata?: Record<string, unknown>,
  ) {
    if (actor.role !== 'ADMIN') return;
    await this.ensureAdminAuditTrailTable();
    await runSql(
      `INSERT INTO admin_audit_logs (actor_user_id, action, target_type, target_id, metadata_json)
       VALUES ($1::uuid, $2, $3, $4, $5);`,
      [actor.uid, action, targetType, targetId || null, metadata ? JSON.stringify(metadata) : null],
    );
  }

  async getAdminAuditLogs(
    actor: AccessUser,
    input: { limit?: string; action?: string; targetType?: string },
  ) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.ensureAdminAuditTrailTable();
    const limit = Math.min(Math.max(Number(input.limit || 100) || 100, 1), 500);
    const action = (input.action || '').trim();
    const targetType = (input.targetType || '').trim();
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (action) {
      params.push(action);
      conditions.push(`action = $${params.length}`);
    }
    if (targetType) {
      params.push(targetType);
      conditions.push(`target_type = $${params.length}`);
    }
    params.push(limit);

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const out = await runSql(
      `SELECT row_to_json(t)::text
       FROM (
         SELECT id,
                actor_user_id,
                action,
                target_type,
                target_id,
                metadata_json,
                created_at::text AS created_at
         FROM admin_audit_logs
         ${whereSql}
         ORDER BY created_at DESC
         LIMIT $${params.length}
       ) t;`,
      params,
    );

    return this.parseJsonLines<{
      id: string;
      actor_user_id: string;
      action: string;
      target_type: string;
      target_id?: string | null;
      metadata_json?: string | null;
      created_at: string;
    }>(out).map((row) => ({
      ...row,
      metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    }));
  }

  private parseJsonLines<T>(raw: string): T[] {
    if (!raw) return [];
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as T);
  }
}
