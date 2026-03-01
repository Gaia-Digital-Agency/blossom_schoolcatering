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
    () => rows.filter((r) => !(r.status === 'VERIFIED' && Boolean((r.proof_image_url || '').trim()))),
    [rows],
  );

  const paidRows = useMemo(
    () => rows
      .filter((r) => r.status === 'VERIFIED' && Boolean((r.proof_image_url || '').trim()))
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [rows],
  );

  const unpaidBySchoolThenParent = useMemo(() => groupBySchoolThenParent(unpaidRows), [unpaidRows]);
  const paidBySchoolThenParent = useMemo(() => groupBySchoolThenParent(paidRows), [paidRows]);

  const paidSummary = useMemo(() => ({
    totalBills: paidRows.length,
    totalAmount: paidRows.reduce((sum, r) => sum + Number(r.total_price || 0), 0),
    totalParents: new Set(paidRows.map((r) => r.parent_name)).size,
  }), [paidRows]);

  const onDecision = async (billingId: string, decision: 'VERIFIED' | 'REJECTED', note?: string) => {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/billing/${billingId}/verify`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      setMessage(`Billing ${decision.toLowerCase()} successfully.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed verify/reject'); }
  };

  const onReview = (row: BillingRow) => {
    const proof = String(row.proof_image_url || '').trim();
    if (!proof) {
      setError('No uploaded proof image for this bill.');
      return;
    }
    window.open(proof, '_blank', 'noopener,noreferrer');
  };

  const onReject = async (row: BillingRow) => {
    const note = window.prompt('Reject note to parent (required):', 'Please re-upload payment proof attached to this order.');
    if (note === null) return;
    if (!note.trim()) {
      setError('Reject note is required.');
      return;
    }
    await onDecision(row.id, 'REJECTED', note.trim());
  };

  const onGenerateReceipt = async (billingId: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch(`/admin/billing/${billingId}/receipt`, { method: 'POST' }) as { receiptNumber: string };
      setMessage(`Receipt generated: ${out.receiptNumber}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed generating receipt'); }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Billing</h1>
        <AdminNav />

        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section">
          <h2>Paid Summary (Past 30 Days)</h2>
          <div className="billing-summary-grid">
            <div className="billing-summary-card">
              <small>Paid Bills</small>
              <div><strong>{paidSummary.totalBills}</strong></div>
            </div>
            <div className="billing-summary-card">
              <small>Paid Amount</small>
              <div><strong>Rp {paidSummary.totalAmount.toLocaleString('id-ID')}</strong></div>
            </div>
            <div className="billing-summary-card">
              <small>Parents</small>
              <div><strong>{paidSummary.totalParents}</strong></div>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="auth-help">Loading…</p>
        ) : (
          <>
            <div className="module-section">
              <h2>Unpaid Bills (Grouped By Parent, Sorted By School)</h2>
              {unpaidBySchoolThenParent.length === 0 ? <p className="auth-help">No unpaid bills.</p> : (
                <div className="billing-school-stack">
                  {unpaidBySchoolThenParent.map((schoolGroup) => (
                    <div key={schoolGroup.schoolName} className="billing-school-card">
                      <div className="billing-school-header">
                        <strong>School: {schoolGroup.schoolName}</strong>
                        <small>Total unpaid bills: {schoolGroup.parents.reduce((acc, parentGroup) => acc + parentGroup.rows.length, 0)}</small>
                        <small>Total: Rp {schoolGroup.parents.reduce((acc, parentGroup) => (
                        acc + parentGroup.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0)
                      ), 0).toLocaleString('id-ID')}</small>
                      </div>
                      <div className="billing-parent-grid">
                        {schoolGroup.parents.map((parentGroup) => (
                          <div key={`${schoolGroup.schoolName}-${parentGroup.parentName}`} className="billing-parent-card">
                            <strong>Parent: {parentGroup.parentName}</strong>
                            <small>Total bills: {parentGroup.rows.length}</small>
                            <small>Total: Rp {parentGroup.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0).toLocaleString('id-ID')}</small>
                            <div className="billing-row-stack">
                              {parentGroup.rows.map((row) => (
                                <div key={row.id} className="billing-row-card">
                                  <strong>{row.service_date} {row.session}</strong>
                                  <small>Order: {row.order_id}</small>
                                  <small>Status: <strong>{row.status}</strong> · Delivery: <strong>{row.delivery_status}</strong></small>
                                  <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                                  <small>Proof: {row.proof_image_url ? '✓ Uploaded' : '✗ Not uploaded'}</small>
                                  {row.admin_note ? <small>Admin Note: {row.admin_note}</small> : null}
                                  <div className="billing-action-row">
                                    <button className="btn btn-outline" type="button" onClick={() => onReview(row)}>Review</button>
                                    <button className="btn btn-outline" type="button" onClick={() => onReject(row)}>Reject</button>
                                    <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'VERIFIED')}>Approve</button>
                                    <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Generate Receipt</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="module-section">
              <h2>Paid Bills (Grouped By School, Grouped By Parent)</h2>
              {paidBySchoolThenParent.length === 0 ? <p className="auth-help">No paid bills.</p> : (
                <div className="billing-school-stack">
                  {paidBySchoolThenParent.map((schoolGroup) => (
                    <div key={schoolGroup.schoolName} className="billing-school-card">
                      <div className="billing-school-header">
                        <strong>School: {schoolGroup.schoolName}</strong>
                        <small>Total paid bills: {schoolGroup.parents.reduce((acc, parentGroup) => acc + parentGroup.rows.length, 0)}</small>
                        <small>Total: Rp {schoolGroup.parents.reduce((acc, parentGroup) => (
                        acc + parentGroup.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0)
                      ), 0).toLocaleString('id-ID')}</small>
                      </div>
                      <div className="billing-parent-grid">
                        {schoolGroup.parents.map((parentGroup) => (
                          <div key={`${schoolGroup.schoolName}-${parentGroup.parentName}`} className="billing-parent-card">
                            <strong>Parent: {parentGroup.parentName}</strong>
                            <small>Total bills: {parentGroup.rows.length}</small>
                            <small>Total: Rp {parentGroup.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0).toLocaleString('id-ID')}</small>
                            <div className="billing-row-stack">
                              {parentGroup.rows.map((row) => (
                                <div key={row.id} className="billing-row-card">
                                  <strong>{row.service_date} {row.session}</strong>
                                  <small>Order: {row.order_id}</small>
                                  <small>Status: <strong>{row.status}</strong> · Delivery: <strong>{row.delivery_status}</strong></small>
                                  <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                                  <small>Receipt: {row.receipt_number || '—'}</small>
                                  {row.admin_note ? <small>Admin Note: {row.admin_note}</small> : null}
                                  <div className="billing-action-row">
                                    <button className="btn btn-outline" type="button" onClick={() => onReview(row)}>Review</button>
                                    {row.pdf_url ? <a className="btn btn-outline" href={row.pdf_url} target="_blank" rel="noreferrer">Open Receipt</a> : null}
                                    <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Generate Receipt</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
        <style jsx>{`
          .billing-summary-grid {
            display: grid;
            gap: 0.75rem;
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .billing-summary-card {
            border: 1px solid var(--border);
            border-radius: 0.6rem;
            padding: 0.8rem;
            background: #fffdf9;
          }
          .billing-summary-card > small {
            opacity: 0.65;
          }
          .billing-school-stack {
            display: grid;
            gap: 0.9rem;
          }
          .billing-school-card {
            border: 1px solid #d9cdb7;
            border-radius: 0.7rem;
            padding: 0.8rem;
            background: #fffaf2;
          }
          .billing-school-header {
            display: grid;
            gap: 0.3rem;
            margin-bottom: 0.75rem;
          }
          .billing-parent-grid {
            display: grid;
            gap: 0.75rem;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          }
          .billing-parent-card {
            border: 1px solid #c9baa0;
            border-radius: 0.65rem;
            padding: 0.7rem;
            background: #fff;
            display: grid;
            gap: 0.25rem;
          }
          .billing-row-stack {
            display: grid;
            gap: 0.55rem;
            margin-top: 0.35rem;
          }
          .billing-row-card {
            border: 1px dashed #d7cab2;
            border-radius: 0.55rem;
            padding: 0.55rem;
            background: #fffefc;
            display: grid;
            gap: 0.2rem;
          }
          .billing-action-row {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            margin-top: 0.35rem;
          }
          .billing-action-row :global(.btn) {
            min-width: 110px;
          }
          @media (max-width: 900px) {
            .billing-summary-grid {
              grid-template-columns: 1fr;
            }
            .billing-parent-grid {
              grid-template-columns: 1fr;
            }
          }
        `}</style>
      </section>
    </main>
  );
}
