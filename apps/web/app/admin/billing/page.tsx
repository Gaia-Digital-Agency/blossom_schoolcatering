'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, apiFetchResponse } from '../../../lib/auth';
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
  child_name?: string | null;
  school_name?: string | null;
  admin_note?: string | null;
  proof_image_url?: string | null;
  receipt_number?: string | null;
  pdf_url?: string | null;
};

function groupBySchool(rows: BillingRow[]) {
  const schoolMap = new Map<string, BillingRow[]>();
  for (const row of rows) {
    const schoolKey = String(row.school_name || 'Unknown School').trim() || 'Unknown School';
    if (!schoolMap.has(schoolKey)) schoolMap.set(schoolKey, []);
    schoolMap.get(schoolKey)?.push(row);
  }
  return Array.from(schoolMap.entries())
    .map(([schoolName, schoolRows]) => ({
      schoolName,
      rows: schoolRows.sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    }))
    .sort((a, b) => a.schoolName.localeCompare(b.schoolName));
}

function getLastName(fullName?: string | null) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '-');
}

function getProofFileName(proofImageUrl?: string | null) {
  const raw = String(proofImageUrl || '').trim();
  if (!raw) return '-';
  if (raw.startsWith('data:')) return 'uploaded-proof.webp';
  const clean = raw.split('?')[0];
  return clean.split('/').pop() || clean || '-';
}

function formatMoney(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

function shortRef(value?: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  return raw.slice(0, 10);
}

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

  const unpaidRows = useMemo(
    () => rows
      .filter((r) => r.status !== 'VERIFIED')
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [rows],
  );

  const paidRows = useMemo(
    () => rows
      .filter((r) => r.status === 'VERIFIED')
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [rows],
  );

  const paidSummary = useMemo(() => ({
    totalBills: paidRows.length,
    totalAmount: paidRows.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    totalParents: new Set(paidRows.map((row) => row.parent_name)).size,
  }), [paidRows]);
  const unpaidBySchool = useMemo(() => groupBySchool(unpaidRows), [unpaidRows]);
  const paidBySchool = useMemo(() => groupBySchool(paidRows), [paidRows]);

  const onDecision = async (billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) => {
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/billing/${billingId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ decision, note }),
      });
      setMessage(decision === 'VERIFIED'
        ? 'Billing approved successfully.'
        : 'Billing rejected and moved back to unpaid.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed verify/reject');
    }
  };

  const onReview = async (row: BillingRow) => {
    const proof = String(row.proof_image_url || '').trim();
    if (!proof) {
      setError('No uploaded proof image for this bill.');
      return;
    }
    try {
      const res = await apiFetchResponse(`/admin/billing/${row.id}/proof-image`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      window.open(proof, '_blank', 'noopener,noreferrer');
      const msg = err instanceof Error ? err.message : 'Failed opening proof image';
      setMessage(`Fallback opened raw proof URL (${msg}).`);
    }
  };

  const onReject = async (row: BillingRow) => {
    const note = window.prompt(
      'Reject note to parent (required):',
      'Payment rejected. Please upload a new payment proof to restart the payment process.',
    );
    if (note === null) return;
    if (!note.trim()) {
      setError('Reject note is required.');
      return;
    }
    await onDecision(row.id, 'REJECTED', note.trim());
  };

  const onApprove = async (row: BillingRow) => {
    if (!String(row.proof_image_url || '').trim()) {
      setError('Cannot approve: parent has not uploaded a payment proof yet.');
      return;
    }
    if (!window.confirm(`Approve payment for ${row.parent_name} - ${row.service_date} ${row.session}?`)) return;
    await onDecision(row.id, 'VERIFIED');
  };

  const onGenerateReceipt = async (billingId: string) => {
    setError('');
    setMessage('');
    try {
      const out = await apiFetch(`/admin/billing/${billingId}/receipt`, { method: 'POST' }) as { receiptNumber: string };
      setMessage(`Receipt generated: ${out.receiptNumber}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed generating receipt');
    }
  };

  const renderRef = (row: BillingRow) => (
    <div className="ref-cell">
      <code title={row.order_id}>{shortRef(row.order_id)}</code>
      <code title={row.id}>{shortRef(row.id)}</code>
    </div>
  );

  const renderUnpaidActions = (row: BillingRow) => {
    const hasProof = Boolean(String(row.proof_image_url || '').trim());
    return (
      <div className="action-row">
        {hasProof ? (
          <button className="btn btn-outline btn-sm" type="button" onClick={() => onReview(row)}>
            View Proof
          </button>
        ) : null}
        {row.status === 'PENDING_VERIFICATION' ? (
          <button className="btn btn-primary btn-sm" type="button" onClick={() => onApprove(row)}>
            Approve
          </button>
        ) : null}
        {hasProof ? (
          <button className="btn btn-outline btn-sm" type="button" onClick={() => onReject(row)}>
            Reject
          </button>
        ) : null}
        {row.status === 'PENDING_VERIFICATION' ? (
          <button className="btn btn-outline btn-sm" type="button" onClick={() => onGenerateReceipt(row.id)}>
            Receipt
          </button>
        ) : null}
      </div>
    );
  };

  const renderPaidActions = (row: BillingRow) => (
    <div className="action-row">
      {String(row.proof_image_url || '').trim() ? (
        <button className="btn btn-outline btn-sm" type="button" onClick={() => onReview(row)}>
          View Proof
        </button>
      ) : null}
      {row.pdf_url ? (
        <a className="btn btn-outline btn-sm" href={row.pdf_url} target="_blank" rel="noreferrer">
          Open Receipt
        </a>
      ) : (
        <button className="btn btn-outline btn-sm" type="button" onClick={() => onGenerateReceipt(row.id)}>
          Gen Receipt
        </button>
      )}
      <button className="btn btn-outline btn-sm" type="button" onClick={() => onReject(row)}>
        Reject
      </button>
    </div>
  );

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
        {error ? <p className="auth-error" style={{ marginBottom: '0.5rem' }}>{error}</p> : null}

        <div className="billing-summary-bar">
          <div className="bsb-card">
            <span className="bsb-label">Paid Bills</span>
            <strong>{paidSummary.totalBills}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Paid Amount</span>
            <strong>{formatMoney(paidSummary.totalAmount)}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Paying Parents</span>
            <strong>{paidSummary.totalParents}</strong>
          </div>
          <div className="bsb-card">
            <span className="bsb-label">Unpaid / Pending</span>
            <strong>{rows.filter((r) => r.status === 'UNPAID').length} / {rows.filter((r) => r.status === 'PENDING_VERIFICATION').length}</strong>
          </div>
        </div>

        <div className="billing-section billing-section--unpaid">
          <h2>Unpaid / Pending ({unpaidRows.length})</h2>
          {unpaidBySchool.length === 0 ? <p className="auth-help">All clear - no unpaid or pending bills.</p> : (
            <div className="school-group-list">
              {unpaidBySchool.map((group) => (
                <div key={group.schoolName} className="school-group-card">
                  <div className="school-group-head">
                    <strong>{group.schoolName}</strong>
                    <span>{group.rows.length} bill(s)</span>
                  </div>
                  <div className="kitchen-table-wrap">
                    <table className="kitchen-table admin-billing-table">
                      <thead>
                        <tr>
                          <th>Last Name</th>
                          <th>Youngster Name</th>
                          <th>Date Of Order</th>
                          <th>Order/Bill Reference</th>
                          <th>Bill Amount</th>
                          <th>Image Proof Name</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{getLastName(row.parent_name)}</strong>
                              <small>{row.status.replace(/_/g, ' ')}</small>
                            </td>
                            <td><strong>{row.child_name || '-'}</strong></td>
                            <td>
                              <strong>{row.service_date}</strong>
                              <small>{row.session}</small>
                            </td>
                            <td>{renderRef(row)}</td>
                            <td><strong>{formatMoney(row.total_price)}</strong></td>
                            <td>
                              <strong>{getProofFileName(row.proof_image_url)}</strong>
                              {row.admin_note ? <small className="admin-note">{row.admin_note}</small> : null}
                            </td>
                            <td>{renderUnpaidActions(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="billing-section billing-section--paid">
          <h2>Paid / Verified ({paidRows.length})</h2>
          {paidBySchool.length === 0 ? <p className="auth-help">No verified bills yet.</p> : (
            <div className="school-group-list">
              {paidBySchool.map((group) => (
                <div key={group.schoolName} className="school-group-card">
                  <div className="school-group-head">
                    <strong>{group.schoolName}</strong>
                    <span>{group.rows.length} bill(s)</span>
                  </div>
                  <div className="kitchen-table-wrap">
                    <table className="kitchen-table admin-billing-table">
                      <thead>
                        <tr>
                          <th>Last Name</th>
                          <th>Youngster Name</th>
                          <th>Date Of Order</th>
                          <th>Order/Bill Reference</th>
                          <th>Bill Amount</th>
                          <th>Image Proof Name</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <strong>{getLastName(row.parent_name)}</strong>
                              <small>Verified</small>
                            </td>
                            <td><strong>{row.child_name || '-'}</strong></td>
                            <td>
                              <strong>{row.service_date}</strong>
                              <small>{row.session}</small>
                            </td>
                            <td>
                              {renderRef(row)}
                              {row.receipt_number ? <small>Receipt: {row.receipt_number}</small> : null}
                            </td>
                            <td><strong>{formatMoney(row.total_price)}</strong></td>
                            <td>
                              <strong>{getProofFileName(row.proof_image_url)}</strong>
                              {row.admin_note ? <small className="admin-note">{row.admin_note}</small> : null}
                            </td>
                            <td>{renderPaidActions(row)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <style jsx>{`
          .billing-topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 0.1rem;
          }
          .billing-topbar h1 {
            margin: 0;
          }
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
            border: 1px solid #e2d6c2;
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
          .billing-section {
            margin-top: 1.25rem;
            border: 2px solid #e2d6c2;
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
          }
          .school-group-list {
            display: grid;
            gap: 0.8rem;
          }
          .school-group-card {
            border: 1px solid #d9cdb7;
            border-radius: 0.7rem;
            overflow: hidden;
            background: #fff;
          }
          .school-group-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            padding: 0.55rem 0.75rem;
            background: #f5ede0;
            border-bottom: 1px solid #e2d6c2;
          }
          .school-group-head span {
            font-size: 0.78rem;
            color: #6b5a43;
          }
          .kitchen-table-wrap {
            overflow-x: auto;
            max-width: 100%;
            -webkit-overflow-scrolling: touch;
          }
          .kitchen-table {
            width: 100%;
            border-collapse: collapse;
            background: #fff;
            border: 1px solid #e2d6c2;
            border-radius: 10px;
            overflow: hidden;
          }
          .kitchen-table th,
          .kitchen-table td {
            border-bottom: 1px solid #efe7da;
            padding: 0.65rem;
            text-align: left;
            vertical-align: top;
            font-size: 0.92rem;
            line-height: 1.35;
          }
          .kitchen-table tbody tr:last-child td {
            border-bottom: none;
          }
          .admin-billing-table th:last-child,
          .admin-billing-table td:last-child {
            min-width: 180px;
          }
          .admin-billing-table th:nth-child(4),
          .admin-billing-table td:nth-child(4) {
            min-width: 130px;
          }
          .admin-billing-table strong,
          .admin-billing-table small,
          .ref-cell code {
            display: block;
          }
          .admin-billing-table small {
            color: #6b5a43;
            margin-top: 0.15rem;
          }
          .ref-cell {
            display: grid;
            gap: 0.2rem;
          }
          .ref-cell code {
            font-size: 0.76rem;
            word-break: break-all;
          }
          .admin-note {
            color: #8a5a00;
          }
          .action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
          }
          .btn-sm {
            padding: 0.28rem 0.7rem;
            font-size: 0.82rem;
          }
          @media (max-width: 760px) {
            .kitchen-table th,
            .kitchen-table td {
              font-size: 0.82rem;
              padding: 0.45rem 0.5rem;
            }
            .admin-billing-table :global(.btn) {
              width: 100%;
            }
          }
        `}</style>
      </section>
    </main>
  );
}
