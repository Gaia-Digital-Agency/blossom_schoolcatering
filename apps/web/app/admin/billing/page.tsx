'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type BillingRow = {
  id: string;
  order_id: string;
  status: 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  delivery_status: string;
  service_date: string;
  session: string;
  total_price: number;
  parent_name: string;
  school_name?: string | null;
  admin_note?: string | null;
  proof_image_url?: string | null;
  receipt_number?: string | null;
  pdf_url?: string | null;
};

function groupBySchoolThenParent(rows: BillingRow[]) {
  const schoolMap = new Map<string, BillingRow[]>();
  for (const row of rows) {
    const schoolKey = (row.school_name || 'Unknown School').trim() || 'Unknown School';
    if (!schoolMap.has(schoolKey)) schoolMap.set(schoolKey, []);
    schoolMap.get(schoolKey)?.push(row);
  }
  return Array.from(schoolMap.entries())
    .map(([schoolName, schoolRows]) => {
      const parentMap = new Map<string, BillingRow[]>();
      for (const row of schoolRows) {
        const parentKey = (row.parent_name || 'Unknown Parent').trim() || 'Unknown Parent';
        if (!parentMap.has(parentKey)) parentMap.set(parentKey, []);
        parentMap.get(parentKey)?.push(row);
      }
      return {
        schoolName,
        parents: Array.from(parentMap.entries())
          .map(([parentName, parentRows]) => ({
            parentName,
            rows: parentRows.sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
          }))
          .sort((a, b) => a.parentName.localeCompare(b.parentName)),
      };
    })
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

const STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Unpaid',
  PENDING_VERIFICATION: 'Pending',
  VERIFIED: 'Verified',
  REJECTED: 'Rejected',
};

export default function AdminBillingPage() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch('/admin/billing') as BillingRow[];
      setRows(data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading billing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /* ── filters ─────────────────────────────────────────────────── */
  const unpaidRows = useMemo(
    () => rows.filter((r) => r.status !== 'VERIFIED'),
    [rows],
  );

  const paidRows = useMemo(
    () => rows
      .filter((r) => r.status === 'VERIFIED')
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [rows],
  );

  const unpaidBySchool = useMemo(() => groupBySchoolThenParent(unpaidRows), [unpaidRows]);
  const paidBySchool   = useMemo(() => groupBySchoolThenParent(paidRows),   [paidRows]);

  const paidSummary = useMemo(() => ({
    totalBills:   paidRows.length,
    totalAmount:  paidRows.reduce((s, r) => s + Number(r.total_price || 0), 0),
    totalParents: new Set(paidRows.map((r) => r.parent_name)).size,
  }), [paidRows]);

  /* ── actions ─────────────────────────────────────────────────── */
  const onDecision = async (billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) => {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/billing/${billingId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ decision, note }),
      });
      setMessage(`Billing ${decision === 'VERIFIED' ? 'approved' : 'rejected'} successfully.`);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed verify/reject';
      setError(msg);
      window.alert(`Error: ${msg}`);
    }
  };

  const onReview = (row: BillingRow) => {
    const proof = String(row.proof_image_url || '').trim();
    if (!proof) { setError('No uploaded proof image for this bill.'); return; }
    window.open(proof, '_blank', 'noopener,noreferrer');
  };

  const onReject = async (row: BillingRow) => {
    const note = window.prompt('Reject note to parent (required):', 'Please re-upload payment proof attached to this order.');
    if (note === null) return;
    if (!note.trim()) { setError('Reject note is required.'); return; }
    await onDecision(row.id, 'REJECTED', note.trim());
  };

  const onApprove = async (row: BillingRow) => {
    if (!String(row.proof_image_url || '').trim()) {
      window.alert('Cannot approve: parent has not uploaded a payment proof yet.');
      return;
    }
    if (!window.confirm(`Approve payment for ${row.parent_name} — ${row.service_date} ${row.session}?`)) return;
    await onDecision(row.id, 'VERIFIED');
  };

  const onGenerateReceipt = async (billingId: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch(`/admin/billing/${billingId}/receipt`, { method: 'POST' }) as { receiptNumber: string };
      setMessage(`Receipt generated: ${out.receiptNumber}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed generating receipt'); }
  };

  /* ── bill row renderer ───────────────────────────────────────── */
  const renderUnpaidBill = (row: BillingRow) => {
    const hasProof = Boolean(String(row.proof_image_url || '').trim());
    return (
      <div key={row.id} className="br-row">
        <div className="br-meta">
          <span className="br-date">{row.service_date}<em>{row.session}</em></span>
          <span className={`br-badge br-badge--${row.status.toLowerCase()}`}>{STATUS_LABEL[row.status] ?? row.status}</span>
          <span className={`br-proof ${hasProof ? 'br-proof--ok' : 'br-proof--miss'}`}>{hasProof ? '✓ Proof' : '✗ No proof'}</span>
          <span className="br-delivery">{row.delivery_status.replace(/_/g, ' ')}</span>
          <span className="br-amount">Rp {Number(row.total_price).toLocaleString('id-ID')}</span>
        </div>
        {row.admin_note ? <p className="br-note">⚠ {row.admin_note}</p> : null}
        <div className="br-actions">
          {hasProof && (
            <button className="btn btn-xs btn-outline" type="button" onClick={() => onReview(row)}>View Proof</button>
          )}
          <button className="btn btn-xs btn-outline" type="button" onClick={() => onReject(row)}>Reject</button>
          <button
            className="btn btn-xs btn-approve"
            type="button"
            disabled={!hasProof}
            title={hasProof ? 'Approve payment' : 'Proof not uploaded yet'}
            onClick={() => onApprove(row)}
          >
            Approve
          </button>
          {row.status === 'PENDING_VERIFICATION' && (
            <button className="btn btn-xs btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Receipt</button>
          )}
        </div>
      </div>
    );
  };

  const renderPaidBill = (row: BillingRow) => (
    <div key={row.id} className="br-row br-row--paid">
      <div className="br-meta">
        <span className="br-date">{row.service_date}<em>{row.session}</em></span>
        <span className="br-badge br-badge--verified">Verified</span>
        <span className="br-delivery">{row.delivery_status.replace(/_/g, ' ')}</span>
        <span className="br-amount">Rp {Number(row.total_price).toLocaleString('id-ID')}</span>
        {row.receipt_number && <span className="br-receipt">{row.receipt_number}</span>}
      </div>
      {row.admin_note ? <p className="br-note">{row.admin_note}</p> : null}
      <div className="br-actions">
        {String(row.proof_image_url || '').trim() && (
          <button className="btn btn-xs btn-outline" type="button" onClick={() => onReview(row)}>View Proof</button>
        )}
        {row.pdf_url
          ? <a className="btn btn-xs btn-outline" href={row.pdf_url} target="_blank" rel="noreferrer">Open Receipt</a>
          : <button className="btn btn-xs btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Gen Receipt</button>
        }
      </div>
    </div>
  );

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="billing-topbar">
          <h1>Admin Billing</h1>
          <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
        <AdminNav />

        {message ? <p className="auth-help" style={{ marginBottom: '0.5rem' }}>{message}</p> : null}
        {error   ? <p className="auth-error" style={{ marginBottom: '0.5rem' }}>{error}</p>   : null}

        {/* ── Summary ── */}
        <div className="billing-summary-bar">
          <div className="bsb-card">
            <span className="bsb-label">Paid Bills</span>
            <strong>{paidSummary.totalBills}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Paid Amount</span>
            <strong>Rp {paidSummary.totalAmount.toLocaleString('id-ID')}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Paying Parents</span>
            <strong>{paidSummary.totalParents}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Unpaid / Pending</span>
            <strong>{unpaidRows.filter((r) => r.status === 'UNPAID').length} / {unpaidRows.filter((r) => r.status === 'PENDING_VERIFICATION').length}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Rejected</span>
            <strong>{unpaidRows.filter((r) => r.status === 'REJECTED').length}</strong>
          </div>
        </div>

        {loading ? <p className="auth-help">Loading…</p> : (<>

          {/* ── Unpaid ── */}
          <div className="billing-section billing-section--unpaid">
            <h2>Unpaid / Pending ({unpaidRows.length})</h2>
            {unpaidBySchool.length === 0 ? <p className="auth-help">All clear — no unpaid bills.</p> : (
              <div className="bl-school-list">
                {unpaidBySchool.map((sg) => {
                  const sgTotal = sg.parents.reduce((a, pg) => a + pg.rows.reduce((s, r) => s + Number(r.total_price || 0), 0), 0);
                  const sgCount = sg.parents.reduce((a, pg) => a + pg.rows.length, 0);
                  return (
                    <div key={sg.schoolName} className="bl-school">
                      <div className="bl-school-hd">
                        <strong>{sg.schoolName}</strong>
                        <span>{sgCount} bills · Rp {sgTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="bl-parent-grid">
                        {sg.parents.map((pg) => {
                          const pgTotal = pg.rows.reduce((s, r) => s + Number(r.total_price || 0), 0);
                          return (
                            <div key={`${sg.schoolName}-${pg.parentName}`} className="bl-parent">
                              <div className="bl-parent-hd">
                                <strong>{pg.parentName}</strong>
                                <span>{pg.rows.length} bills · Rp {pgTotal.toLocaleString('id-ID')}</span>
                              </div>
                              <div className="bl-bill-list">
                                {pg.rows.map(renderUnpaidBill)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Paid ── */}
          <div className="billing-section billing-section--paid">
            <h2>Paid / Verified ({paidRows.length})</h2>
            {paidBySchool.length === 0 ? <p className="auth-help">No verified bills yet.</p> : (
              <div className="bl-school-list">
                {paidBySchool.map((sg) => {
                  const sgTotal = sg.parents.reduce((a, pg) => a + pg.rows.reduce((s, r) => s + Number(r.total_price || 0), 0), 0);
                  const sgCount = sg.parents.reduce((a, pg) => a + pg.rows.length, 0);
                  return (
                    <div key={sg.schoolName} className="bl-school">
                      <div className="bl-school-hd">
                        <strong>{sg.schoolName}</strong>
                        <span>{sgCount} bills · Rp {sgTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div className="bl-parent-grid">
                        {sg.parents.map((pg) => {
                          const pgTotal = pg.rows.reduce((s, r) => s + Number(r.total_price || 0), 0);
                          return (
                            <div key={`${sg.schoolName}-${pg.parentName}`} className="bl-parent">
                              <div className="bl-parent-hd">
                                <strong>{pg.parentName}</strong>
                                <span>{pg.rows.length} bills · Rp {pgTotal.toLocaleString('id-ID')}</span>
                              </div>
                              <div className="bl-bill-list">
                                {pg.rows.map(renderPaidBill)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </>)}

        <style jsx>{`
          /* ── topbar ── */
          .billing-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.1rem;
          }
          .billing-topbar h1 { margin: 0; }

          /* ── summary bar ── */
          .billing-summary-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin: 0.75rem 0 1rem;
          }
          .bsb-card {
            flex: 1 1 120px;
            display: flex;
            flex-direction: column;
            gap: 0.15rem;
            border: 1px solid var(--border);
            border-radius: 0.55rem;
            padding: 0.55rem 0.75rem;
            background: #fffdf9;
            min-width: 0;
          }
          .bsb-label {
            font-size: 0.72rem;
            opacity: 0.6;
            text-transform: uppercase;
            letter-spacing: 0.02em;
          }
          .bsb-card strong { font-size: 1.05rem; }

          /* ── section heading ── */
          .billing-section {
            margin-top: 1.25rem;
            border: 2px solid var(--border);
            border-radius: 0.8rem;
            padding: 0.8rem;
            background: #fff;
          }
          .billing-section--unpaid {
            border-color: #d08a63;
            background: #fff7f2;
          }
          .billing-section--paid {
            border-color: #6a9b72;
            background: #f3fbf4;
          }
          .billing-section h2 {
            font-size: 0.95rem;
            font-weight: 700;
            margin: 0 0 0.65rem;
            padding-bottom: 0.3rem;
            border-bottom: 1px solid var(--border);
          }
          .billing-section--unpaid h2 {
            border-bottom-color: #d9a381;
          }
          .billing-section--paid h2 {
            border-bottom-color: #8bb693;
          }

          /* ── school block ── */
          .bl-school-list { display: grid; gap: 0.7rem; }
          .bl-school {
            border: 1px solid #d9cdb7;
            border-radius: 0.65rem;
            overflow: hidden;
          }
          .bl-school-hd {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0.45rem 0.75rem;
            background: #f5ede0;
            font-size: 0.83rem;
            gap: 1rem;
          }
          .bl-school-hd span { opacity: 0.7; font-size: 0.78rem; }

          /* ── parent grid ── */
          .bl-parent-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
            gap: 0;
          }
          .bl-parent {
            border-top: 1px solid #e8ddd0;
            padding: 0.5rem 0.65rem;
          }
          .bl-parent:not(:last-child) {
            border-right: 1px solid #e8ddd0;
          }
          .bl-parent-hd {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 0.5rem;
            margin-bottom: 0.35rem;
            font-size: 0.82rem;
          }
          .bl-parent-hd span { opacity: 0.6; font-size: 0.75rem; }

          /* ── bill rows ── */
          .bl-bill-list { display: grid; gap: 0.3rem; }
          .br-row {
            border: 1px solid #e0d5c3;
            border-radius: 0.45rem;
            padding: 0.35rem 0.5rem;
            background: #fffefb;
            font-size: 0.78rem;
          }
          .br-row--paid { background: #f6fff6; border-color: #c2dfc2; }

          /* single-line meta */
          .br-meta {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.45rem;
            margin-bottom: 0.2rem;
          }
          .br-date {
            font-weight: 600;
            white-space: nowrap;
          }
          .br-date em {
            font-style: normal;
            font-size: 0.72rem;
            opacity: 0.65;
            margin-left: 0.2rem;
          }
          .br-amount {
            margin-left: auto;
            font-weight: 700;
            white-space: nowrap;
          }
          .br-delivery {
            font-size: 0.7rem;
            opacity: 0.6;
            text-transform: capitalize;
          }
          .br-receipt {
            font-size: 0.7rem;
            color: #5a7a5a;
            font-family: monospace;
          }

          /* status badges */
          .br-badge {
            display: inline-block;
            padding: 0.08rem 0.4rem;
            border-radius: 999px;
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.03em;
          }
          .br-badge--unpaid            { background: #fde8e8; color: #b72828; }
          .br-badge--pending_verification { background: #fff3cd; color: #8a6400; }
          .br-badge--verified          { background: #d4edda; color: #1a6e2e; }
          .br-badge--rejected          { background: #e9ecef; color: #6c757d; }

          /* proof indicator */
          .br-proof {
            font-size: 0.7rem;
            font-weight: 600;
          }
          .br-proof--ok   { color: #1a7a3a; }
          .br-proof--miss { color: #cc4400; }

          /* admin note */
          .br-note {
            margin: 0.15rem 0 0.2rem;
            font-size: 0.72rem;
            color: #8a5a00;
            background: #fff8e1;
            border-radius: 0.3rem;
            padding: 0.15rem 0.4rem;
          }

          /* action row */
          .br-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.3rem;
            margin-top: 0.25rem;
          }
          :global(.btn-xs) {
            padding: 0.2rem 0.55rem !important;
            font-size: 0.72rem !important;
            min-height: 1.6rem !important;
          }
          :global(.btn-approve) {
            background: #1a7a3a !important;
            color: #fff !important;
            border-color: #1a7a3a !important;
          }
          :global(.btn-approve:hover:not(:disabled)) {
            background: #135e2c !important;
            border-color: #135e2c !important;
          }
          :global(.btn-approve:disabled) {
            background: #ccc !important;
            border-color: #ccc !important;
            color: #888 !important;
            cursor: not-allowed !important;
            opacity: 0.6 !important;
          }

          @media (max-width: 700px) {
            .bl-parent-grid { grid-template-columns: 1fr; }
            .billing-summary-bar { gap: 0.4rem; }
          }
        `}</style>
      </section>
    </main>
  );
}
