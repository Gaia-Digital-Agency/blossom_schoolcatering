import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { runSql } from '../../auth/db.util';
import { AccessUser, SessionType } from '../core.types';
import { AuditService } from './audit.service';
import { HelpersService } from './helpers.service';
import { MediaService } from './media.service';
import { SchemaService } from './schema.service';

/**
 * BillingService
 * ==============
 *
 * Single-order billing lifecycle: proof uploads (single + batch),
 * admin verification/rejection, receipt generation, proof revert,
 * consolidated per-session views (current + legacy shape), and all
 * admin-facing billing reads.
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - HelpersService, MediaService, SchemaService, AuditService
 */
@Injectable()
export class BillingService {
  constructor(
    private readonly schema: SchemaService,
    private readonly helpers: HelpersService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
  ) {}

  async getParentConsolidatedBillingLegacy(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBillingReviewColumns();
    const parentId = await this.helpers.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.helpers.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const session = sessionFilter ? this.helpers.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [familyId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE c.family_id = $1::uuid
        ${sessionClause}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getYoungsterConsolidatedBillingLegacy(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBillingReviewColumns();
    const childId = await this.helpers.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const session = sessionFilter ? this.helpers.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [childId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE o.child_id = $1
        ${sessionClause}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async uploadBillingProof(actor: AccessUser, billingId: string, proofImageData?: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const proof = (proofImageData || '').trim();
    let ownerFolderId = actor.uid;
    let exists = '';
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      ownerFolderId = parentId;
      exists = await runSql(
        `SELECT EXISTS (
           SELECT 1 FROM billing_records
           WHERE id = $1
             AND parent_id = $2
         );`,
        [billingId, parentId],
      );
    } else {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      ownerFolderId = childId;
      exists = await runSql(
        `SELECT EXISTS (
           SELECT 1
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id = $1
             AND o.child_id = $2
         );`,
        [billingId, childId],
      );
    }
    if (exists !== 't') throw new NotFoundException('Billing record not found');
    let proofUrl = proof;
    if (proof.startsWith('data:')) {
      const parsed = this.media.parseDataUrl(proof);
      this.media.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 5 * 1024 * 1024,
        label: 'Proof image',
      });
      const ext = this.media.getFileExtFromContentType(parsed.contentType);
      const objectName = `${this.media.getGcsCategoryFolder('payment-proofs')}/${ownerFolderId}/${billingId}-${Date.now()}.${ext}`;
      try {
        const uploaded = await this.media.uploadToGcs({
          objectName,
          contentType: parsed.contentType,
          data: parsed.data,
          cacheControl: 'private, max-age=0, no-cache',
        });
        proofUrl = uploaded.publicUrl;
      } catch (err) {
        // Keep parent proof upload working even if GCS credentials/bucket config is unavailable.
        proofUrl = proof;
      }
    } else if (!this.media.isAllowedProofImageUrl(proof)) {
      throw new BadRequestException('proofImageData must be a PNG/JPEG/WEBP image data URL or trusted image URL');
    }

    await runSql(
      `UPDATE billing_records
       SET proof_image_url = $1,
           proof_uploaded_at = now(),
           status = 'PENDING_VERIFICATION',
           admin_note = NULL,
           updated_at = now()
       WHERE id = $2;`,
      [proofUrl, billingId],
    );
    return { ok: true };
  }

  async uploadBillingProofBatch(actor: AccessUser, billingIdsRaw: string[], proofImageData?: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    const billingIds = (billingIdsRaw || []).map((x) => String(x || '').trim()).filter(Boolean);
    if (billingIds.length === 0) throw new BadRequestException('billingIds is required');
    if (billingIds.length > 50) throw new BadRequestException('Maximum 50 billing records per batch');

    const ph = billingIds.map((_, i) => `$${i + 1}`).join(', ');
    let allowedOut = '';
    let ownerParams: unknown[] = [];
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      ownerParams = [parentId];
      allowedOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT id
           FROM billing_records
           WHERE id IN (${ph})
             AND parent_id = $${billingIds.length + 1}
         ) t;`,
        [...billingIds, parentId],
      );
    } else {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      ownerParams = [childId];
      allowedOut = await runSql(
        `SELECT row_to_json(t)::text
         FROM (
           SELECT br.id
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id IN (${ph})
             AND o.child_id = $${billingIds.length + 1}
         ) t;`,
        [...billingIds, childId],
      );
    }
    const allowedIds = new Set(this.helpers.parseJsonLines<{ id: string }>(allowedOut).map((x) => x.id));
    if (allowedIds.size !== billingIds.length) {
      throw new NotFoundException('One or more billing records not found');
    }

    const firstId = billingIds[0];
    await this.uploadBillingProof(actor, firstId, proofImageData);
    const firstOut = await runSql(
      `SELECT proof_image_url
       FROM billing_records
       WHERE id = $1
       LIMIT 1;`,
      [firstId],
    );
    const proofUrl = (firstOut || '').trim();
    if (!proofUrl) throw new BadRequestException('Failed uploading proof image');
    if (billingIds.length === 1) return { ok: true, updatedCount: 1 };

    const restIds = billingIds.slice(1);
    const restPh = restIds.map((_, i) => `$${i + 2}`).join(', ');
    if (actor.role === 'PARENT') {
      await runSql(
        `UPDATE billing_records
         SET proof_image_url = $1,
             proof_uploaded_at = now(),
             status = 'PENDING_VERIFICATION',
             admin_note = NULL,
             updated_at = now()
         WHERE id IN (${restPh})
           AND parent_id = $${restIds.length + 2};`,
        [proofUrl, ...restIds, ...ownerParams],
      );
    } else {
      await runSql(
        `UPDATE billing_records br
         SET proof_image_url = $1,
             proof_uploaded_at = now(),
             status = 'PENDING_VERIFICATION',
             admin_note = NULL,
             updated_at = now()
         FROM orders o
         WHERE br.order_id = o.id
           AND br.id IN (${restPh})
           AND o.child_id = $${restIds.length + 2};`,
        [proofUrl, ...restIds, ...ownerParams],
      );
    }
    return { ok: true, updatedCount: billingIds.length };
  }

  async getBillingProofImage(actor: AccessUser, billingId: string) {
    const targetBillingId = String(billingId || '').trim();
    this.helpers.assertValidUuid(targetBillingId, 'billingId');

    let sql = `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               COALESCE(NULLIF(TRIM(br.proof_image_url), ''), '') AS proof_image_url
        FROM billing_records br
        WHERE br.id = $1
    `;
    const params: unknown[] = [targetBillingId];

    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      params.push(parentId);
      sql += ` AND br.parent_id = $2`;
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      params.push(childId);
      sql += ` AND EXISTS (
        SELECT 1
        FROM orders o
        WHERE o.id = br.order_id
          AND o.child_id = $2
      )`;
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }

    sql += `
        LIMIT 1
      ) t;
    `;

    const out = await runSql(sql, params);
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.helpers.parseJsonLine<{ id: string; proof_image_url: string }>(out);
    const proofImageUrl = String(row.proof_image_url || '').trim();
    if (!proofImageUrl) throw new BadRequestException('No uploaded proof image for this bill');

    if (proofImageUrl.startsWith('data:')) {
      const parsed = this.media.parseDataUrl(proofImageUrl);
      this.media.assertSafeImagePayload({
        contentType: parsed.contentType,
        data: parsed.data,
        maxBytes: 10 * 1024 * 1024,
        label: 'Proof image',
      });
      return { contentType: parsed.contentType, data: parsed.data };
    }

    return this.media.fetchProofImageBinary(proofImageUrl);
  }

  async getAdminBillingLegacy(status?: string, sessionRaw?: string) {
    await this.schema.ensureBillingReviewColumns();
    const statusFilter = (status || '').toUpperCase();
    const session = sessionRaw && sessionRaw !== 'ALL' ? this.helpers.normalizeSession(sessionRaw) : null;
    const params: unknown[] = [];
    const clauses: string[] = [];
    if (['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(statusFilter)) {
      params.push(statusFilter);
      clauses.push(`AND br.status = $${params.length}::payment_status`);
    }
    if (session) {
      params.push(session);
      clauses.push(`AND o.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.created_at::text AS created_at,
               br.verified_at::text AS verified_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               dr.receipt_number,
               dr.pdf_url
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE 1=1
          ${clauses.join('\n          ')}
        ORDER BY br.created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async verifyBilling(actor: AccessUser, billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBillingReviewColumns();
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id,
               COALESCE(NULLIF(TRIM(proof_image_url), ''), '') AS proof_image_url
        FROM billing_records
        WHERE id = $1
        LIMIT 1
      ) t;
      `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.helpers.parseJsonLine<{ id: string; proof_image_url: string }>(billingOut);
    if (decision === 'VERIFIED' && !String(billing.proof_image_url || '').trim()) {
      throw new BadRequestException('BILLING_PROOF_IMAGE_REQUIRED');
    }
    const adminNote = decision === 'REJECTED'
      ? (note || '').trim().slice(0, 500)
      : '';
    if (decision === 'REJECTED' && !adminNote) {
      throw new BadRequestException('REJECTION_NOTE_REQUIRED');
    }
    const isReject = decision === 'REJECTED';
    const nextStatus = isReject ? 'UNPAID' : 'VERIFIED';
    const updatedOut = await runSql(
      `WITH updated AS (
         UPDATE billing_records
         SET status = $1::payment_status,
             verified_by = CASE WHEN $2::boolean THEN NULL ELSE $3 END,
             admin_note = $4,
             verified_at = CASE WHEN $2::boolean THEN NULL ELSE now() END,
             proof_image_url = CASE WHEN $2::boolean THEN NULL ELSE proof_image_url END,
             proof_uploaded_at = CASE WHEN $2::boolean THEN NULL ELSE proof_uploaded_at END,
             updated_at = now()
         WHERE id = $5
         RETURNING id
       )
       SELECT id FROM updated;`,
      [
        nextStatus,
        isReject,
        actor.uid,
        adminNote || null,
        billingId,
      ],
    );
    if (!updatedOut) throw new NotFoundException('Billing record not found');
    if (isReject) {
      await runSql('DELETE FROM digital_receipts WHERE billing_record_id = $1;', [billingId]);
    }
    await this.audit.recordAdminAudit(actor, 'BILLING_VERIFIED', 'billing-record', billingId, {
      decision: isReject ? 'REJECTED_TO_UNPAID' : decision,
      note: adminNote || null,
    });
    return { ok: true, status: nextStatus };
  }

  async deleteBilling(actor: AccessUser, billingId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    this.helpers.assertValidUuid(billingId, 'billingId');
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT id
        FROM billing_records
        WHERE id = $1
        LIMIT 1
      ) t;
      `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    await runSql('DELETE FROM digital_receipts WHERE billing_record_id = $1;', [billingId]);
    await runSql('DELETE FROM billing_records WHERE id = $1;', [billingId]);
    await this.audit.recordAdminAudit(actor, 'BILLING_DELETED', 'billing-record', billingId);
    return { ok: true };
  }

  async generateReceipt(actor: AccessUser, billingId: string) {
    if (actor.role !== 'ADMIN') throw new ForbiddenException('Role not allowed');
    const billingOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.status::text AS status,
               br.parent_id,
               br.order_id,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               (uc.first_name || ' ' || uc.last_name) AS child_name
        FROM billing_records
        br
        JOIN orders o ON o.id = br.order_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!billingOut) throw new NotFoundException('Billing record not found');
    const billing = this.helpers.parseJsonLine<{
      id: string;
      status: string;
      parent_id: string;
      order_id: string;
      service_date: string;
      session: string;
      total_price: string | number;
      parent_name: string;
      child_name: string;
    }>(billingOut);
    if (billing.status !== 'VERIFIED') throw new BadRequestException('RECEIPT_PAYMENT_NOT_VERIFIED');

    const seq = Number(await runSql(`SELECT nextval('receipt_number_seq');`) || 0);
    const nowYear = new Date().getUTCFullYear();
    const receiptNumber = `BLC-${nowYear}-${String(seq).padStart(5, '0')}`;
    const itemsOut = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT oi.item_name_snapshot, oi.quantity, oi.price_snapshot
        FROM order_items oi
        WHERE oi.order_id = $1
        ORDER BY oi.created_at ASC
      ) t;
    `,
      [billing.order_id],
    );
    const items = this.helpers.parseJsonLines<{
      item_name_snapshot: string;
      quantity: number | string;
      price_snapshot: number | string;
    }>(itemsOut);
    const total = Number(billing.total_price || 0);
    const lineItems = items.map((it) => {
      const qty = Number(it.quantity || 0);
      const price = Number(it.price_snapshot || 0);
      return `${it.item_name_snapshot} x${qty} @ Rp ${price.toLocaleString('id-ID')} = Rp ${(qty * price).toLocaleString('id-ID')}`;
    });
    const pdf = this.media.buildSimplePdf([
      'Blossom School Catering - Payment Receipt',
      `Receipt Number: ${receiptNumber}`,
      `Generated At (UTC): ${new Date().toISOString()}`,
      `Billing ID: ${billing.id}`,
      `Order ID: ${billing.order_id}`,
      `Parent: ${billing.parent_name}`,
      `Youngster: ${billing.child_name}`,
      `Service Date: ${billing.service_date} (${billing.session})`,
      ...lineItems,
      `Total: Rp ${total.toLocaleString('id-ID')}`,
      `Verified By: ${actor.uid}`,
    ]);
    const receiptObjectName = `${this.media.getGcsCategoryFolder('receipts')}/${receiptNumber}.pdf`;
    const uploadedReceipt = await this.media.uploadToGcs({
      objectName: receiptObjectName,
      contentType: 'application/pdf',
      data: pdf,
      cacheControl: 'private, max-age=0, no-cache',
    });
    const pdfUrl = uploadedReceipt.publicUrl;

    await runSql(
      `INSERT INTO digital_receipts (billing_record_id, receipt_number, pdf_url, generated_at, generated_by_user_id)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (billing_record_id)
       DO UPDATE SET receipt_number = EXCLUDED.receipt_number, pdf_url = EXCLUDED.pdf_url, generated_at = now(), generated_by_user_id = EXCLUDED.generated_by_user_id;`,
      [billing.id, receiptNumber, pdfUrl, actor.uid],
    );
    await this.audit.recordAdminAudit(actor, 'BILLING_RECEIPT_GENERATED', 'billing-record', billingId, {
      receiptNumber,
    });
    return { ok: true, receiptNumber, pdfUrl };
  }

  async getBillingReceipt(actor: AccessUser, billingId: string) {
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id, br.parent_id, o.child_id, dr.receipt_number, dr.pdf_url, dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE br.id = $1
        LIMIT 1
      ) t;
    `,
      [billingId],
    );
    if (!out) throw new NotFoundException('Billing record not found');
    const row = this.helpers.parseJsonLine<{ id: string; parent_id: string; child_id: string; receipt_number?: string; pdf_url?: string }>(out);
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId || parentId !== row.parent_id) throw new ForbiddenException('Role not allowed');
    } else if (actor.role === 'YOUNGSTER') {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId || childId !== row.child_id) throw new ForbiddenException('Role not allowed');
    } else if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('Role not allowed');
    }
    return row;
  }

  async getBillingReceiptFile(actor: AccessUser, billingId: string) {
    const row = await this.getBillingReceipt(actor, billingId);
    const pdfUrl = String(row.pdf_url || '').trim();
    if (!pdfUrl) throw new NotFoundException('Receipt PDF not found');
    const file = await this.media.fetchReceiptPdfBinary(pdfUrl);
    return {
      ...file,
      fileName: `${String(row.receipt_number || '').trim() || 'receipt'}.pdf`,
    };
  }

  async revertBillingProof(actor: AccessUser, billingId: string) {
    if (!['PARENT', 'YOUNGSTER'].includes(actor.role)) throw new ForbiddenException('Role not allowed');
    let out = '';
    if (actor.role === 'PARENT') {
      const parentId = await this.helpers.getParentIdByUserId(actor.uid);
      if (!parentId) throw new BadRequestException('Parent profile not found');
      out = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT id, status::text AS status
           FROM billing_records
           WHERE id = $1 AND parent_id = $2
           LIMIT 1
         ) t;`,
        [billingId, parentId],
      );
    } else {
      const childId = await this.helpers.getChildIdByUserId(actor.uid);
      if (!childId) throw new NotFoundException('Youngster profile not found');
      out = await runSql(
        `SELECT row_to_json(t)::text FROM (
           SELECT br.id, br.status::text AS status
           FROM billing_records br
           JOIN orders o ON o.id = br.order_id
           WHERE br.id = $1
             AND o.child_id = $2
           LIMIT 1
         ) t;`,
        [billingId, childId],
      );
    }
    const parsed = this.helpers.parseJsonLine<{ id: string; status: string }>(out);
    if (!parsed) throw new NotFoundException('Billing record not found');
    if (parsed.status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only PENDING_VERIFICATION bills can be reverted');
    }
    await runSql(
      `UPDATE billing_records
       SET proof_image_url = NULL,
           proof_uploaded_at = NULL,
           status = 'UNPAID',
           admin_note = NULL,
           updated_at = now()
       WHERE id = $1;`,
      [billingId],
    );
    return { ok: true };
  }

  async getParentConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'PARENT') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const parentId = await this.helpers.getParentIdByUserId(actor.uid);
    if (!parentId) throw new BadRequestException('Parent profile not found');
    const familyId = await this.helpers.getParentFamilyId(parentId);
    if (!familyId) throw new BadRequestException('Family Group not found');
    const session = sessionFilter ? this.helpers.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [familyId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE c.family_id = $1::uuid
          AND COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
        ${sessionClause}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mog.child_id,
               mob.status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               NULL AS delivered_at,
               mob.created_at::text AS created_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url,
               mor.created_at::text AS generated_at
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE c.family_id = $1::uuid
          ${session ? `AND mog.session = $${params.length}::session_type` : ''}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getYoungsterConsolidatedBilling(actor: AccessUser, sessionFilter?: string) {
    if (actor.role !== 'YOUNGSTER') throw new ForbiddenException('Role not allowed');
    await this.schema.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const childId = await this.helpers.getChildIdByUserId(actor.uid);
    if (!childId) throw new NotFoundException('Youngster profile not found');
    const session = sessionFilter ? this.helpers.normalizeSession(sessionFilter) : null;
    const params: unknown[] = [childId];
    const sessionClause = session ? `AND o.session = $${params.push(session)}::session_type` : '';
    const out = await runSql(`
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               o.child_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.delivered_at::text AS delivered_at,
               br.created_at::text AS created_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               dr.receipt_number,
               dr.pdf_url,
               dr.generated_at::text AS generated_at
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE o.child_id = $1
          AND COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
        ${sessionClause}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mog.child_id,
               mob.status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               NULL AS delivered_at,
               mob.created_at::text AS created_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (u.first_name || ' ' || u.last_name) AS child_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url,
               mor.created_at::text AS generated_at
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users u ON u.id = c.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE mog.child_id = $1
          ${session ? `AND mog.session = $${params.length}::session_type` : ''}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

  async getAdminBilling(status?: string, sessionRaw?: string) {
    await this.schema.ensureBillingReviewColumns();
    await this.schema!.ensureMultiOrderSchema();
    const statusFilter = (status || '').toUpperCase();
    const session = sessionRaw && sessionRaw !== 'ALL' ? this.helpers.normalizeSession(sessionRaw) : null;
    const params: unknown[] = [];
    const clausesSingle: string[] = [];
    const clausesMulti: string[] = [];
    if (['UNPAID', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED'].includes(statusFilter)) {
      params.push(statusFilter);
      clausesSingle.push(`AND br.status = $${params.length}::payment_status`);
      clausesMulti.push(`AND upper(mob.status) = $${params.length}`);
    }
    if (session) {
      params.push(session);
      clausesSingle.push(`AND o.session = $${params.length}::session_type`);
      clausesMulti.push(`AND mog.session = $${params.length}::session_type`);
    }
    const out = await runSql(
      `
      SELECT row_to_json(t)::text
      FROM (
        SELECT br.id,
               br.order_id,
               NULL::uuid AS group_id,
               br.status::text AS status,
               br.delivery_status::text AS delivery_status,
               br.proof_image_url,
               br.proof_uploaded_at::text AS proof_uploaded_at,
               br.created_at::text AS created_at,
               br.verified_at::text AS verified_at,
               br.admin_note,
               o.service_date::text AS service_date,
               o.session::text AS session,
               o.total_price,
               'SINGLE' AS source_type,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               dr.receipt_number,
               dr.pdf_url
        FROM billing_records br
        JOIN orders o ON o.id = br.order_id
        JOIN children c ON c.id = o.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        JOIN parents p ON p.id = br.parent_id
        JOIN users up ON up.id = p.user_id
        LEFT JOIN digital_receipts dr ON dr.billing_record_id = br.id
        WHERE COALESCE(o.source_type, 'SINGLE') = 'SINGLE'
          ${clausesSingle.join('\n          ')}
        UNION ALL
        SELECT mob.id,
               NULL AS order_id,
               mog.id AS group_id,
               mob.status AS status,
               'PENDING' AS delivery_status,
               mob.proof_image_url,
               mob.proof_uploaded_at::text AS proof_uploaded_at,
               mob.created_at::text AS created_at,
               mob.verified_at::text AS verified_at,
               mob.admin_note,
               mog.start_date::text AS service_date,
               mog.session::text AS session,
               mob.total_amount AS total_price,
               'MULTI' AS source_type,
               (uc.first_name || ' ' || uc.last_name) AS child_name,
               p.id AS parent_id,
               (up.first_name || ' ' || up.last_name) AS parent_name,
               s.name AS school_name,
               mor.receipt_number,
               mor.pdf_path AS pdf_url
        FROM multi_order_billings mob
        JOIN multi_order_groups mog ON mog.id = mob.multi_order_group_id
        JOIN children c ON c.id = mog.child_id
        JOIN users uc ON uc.id = c.user_id
        JOIN schools s ON s.id = c.school_id
        LEFT JOIN parents p ON p.id = mog.parent_id
        LEFT JOIN users up ON up.id = p.user_id
        LEFT JOIN multi_order_receipts mor ON mor.id = mob.receipt_id AND mor.status = 'ACTIVE'
        WHERE 1=1
          ${clausesMulti.join('\n          ')}
        ORDER BY created_at DESC
      ) t;
    `,
      params,
    );
    return this.helpers.parseJsonLines<Record<string, unknown> & { total_price?: string | number }>(out).map((row) => ({
      ...row,
      total_price: Number(row.total_price || 0),
    }));
  }

}
