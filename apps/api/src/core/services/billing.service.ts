import { Injectable } from '@nestjs/common';

/**
 * BillingService
 * ==============
 *
 * Scope:
 *   - Single-order billing rows: one row per order, status lifecycle
 *     (UNPAID → PENDING_REVIEW → VERIFIED / REJECTED).
 *   - Proof-of-payment upload: single + batch variants, image stored
 *     via MediaService; served back as a proxied binary read.
 *   - Admin verification: mark VERIFIED / REJECTED with note; on
 *     VERIFIED, trigger receipt generation.
 *   - Receipts: PDF generation via MediaService.buildSimplePdf, stored
 *     in GCS, downloadable.
 *   - Consolidated views: parent and youngster per-session rollups,
 *     legacy variants kept for older frontends until retired.
 *   - Spending dashboards: parent and youngster monthly totals.
 *   - Proof revert: admin action to reopen a VERIFIED billing if an
 *     issue is found after approval.
 *
 * Methods that will move here from CoreService:
 *   Proofs:
 *     - uploadBillingProof
 *     - uploadBillingProofBatch
 *     - getBillingProofImage
 *     - revertBillingProof
 *   Admin review:
 *     - getAdminBilling
 *     - getAdminBillingLegacy
 *     - verifyBilling
 *     - deleteBilling
 *   Receipts:
 *     - generateReceipt
 *     - getBillingReceipt
 *     - getBillingReceiptFile
 *   Consolidated / spending:
 *     - getParentConsolidatedBilling
 *     - getYoungsterConsolidatedBilling
 *     - getParentConsolidatedBillingLegacy
 *     - getYoungsterConsolidatedBillingLegacy
 *     - getParentSpendingDashboard
 *     - getYoungsterSpendingDashboard
 *
 * Dependencies:
 *   - runSql (db.util)
 *   - SchemaService (ensureBillingReviewColumns)
 *   - MediaService (uploadToGcs, buildSimplePdf, fetchProofImageBinary,
 *                   fetchReceiptPdfBinary, isAllowedProofImageUrl)
 *   - HelpersService (family scope, month math, calc helpers)
 *   - AuditService (recordAdminAudit on verify/reject/revert/delete)
 *
 * Consumers:
 *   - CoreService facade (~15 endpoints)
 *   - OrderService (billing row created on order submit)
 *   - AdminReportsService (revenue dashboard aggregates)
 */
@Injectable()
export class BillingService {}
