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
  proof_image_url?: string | null;
  receipt_number?: string | null;
  pdf_url?: string | null;
};

function groupByParent(rows: BillingRow[]) {
  const map = new Map<string, BillingRow[]>();
  for (const row of rows) {
    const key = row.parent_name || 'Unknown Parent';
    if (!map.has(key)) map.set(key, []);
    map.get(key)?.push(row);
  }
  return Array.from(map.entries())
    .map(([parentName, parentRows]) => ({
      parentName,
      rows: parentRows.sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    }))
    .sort((a, b) => a.parentName.localeCompare(b.parentName));
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

  const now = useMemo(() => new Date(), []);
  const paidFromDate = useMemo(() => {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  }, [now]);

  const unpaidRows = useMemo(
    () => rows.filter((r) => !(r.status === 'VERIFIED' && Boolean((r.proof_image_url || '').trim()))),
    [rows],
  );

  const paidRows = useMemo(
    () => rows
      .filter((r) => r.status === 'VERIFIED' && Boolean((r.proof_image_url || '').trim()) && String(r.service_date) >= paidFromDate)
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [rows, paidFromDate],
  );

  const unpaidByParent = useMemo(() => groupByParent(unpaidRows), [unpaidRows]);

  const paidByProof = useMemo(() => {
    const map = new Map<string, BillingRow[]>();
    for (const row of paidRows) {
      const key = String(row.proof_image_url || '').trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(row);
    }
    return Array.from(map.entries()).map(([proofUrl, groupedRows]) => ({
      proofUrl,
      rows: groupedRows,
      total: groupedRows.reduce((sum, r) => sum + Number(r.total_price || 0), 0),
    })).sort((a, b) => b.rows.length - a.rows.length);
  }, [paidRows]);

  const paidSummary = useMemo(() => ({
    totalBills: paidRows.length,
    totalAmount: paidRows.reduce((sum, r) => sum + Number(r.total_price || 0), 0),
    totalParents: new Set(paidRows.map((r) => r.parent_name)).size,
  }), [paidRows]);

  const onDecision = async (billingId: string, decision: 'VERIFIED' | 'REJECTED') => {
    setError(''); setMessage('');
    try {
      await apiFetch(`/admin/billing/${billingId}/verify`, { method: 'POST', body: JSON.stringify({ decision }) });
      setMessage(`Billing ${decision.toLowerCase()} successfully.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed verify/reject'); }
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.6rem' }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <small style={{ opacity: 0.6 }}>Paid Bills</small>
              <div><strong>{paidSummary.totalBills}</strong></div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <small style={{ opacity: 0.6 }}>Paid Amount</small>
              <div><strong>Rp {paidSummary.totalAmount.toLocaleString('id-ID')}</strong></div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
              <small style={{ opacity: 0.6 }}>Parents</small>
              <div><strong>{paidSummary.totalParents}</strong></div>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="auth-help">Loading…</p>
        ) : (
          <>
            <div className="module-section">
              <h2>Unpaid Bills (Grouped By Parent)</h2>
              {unpaidByParent.length === 0 ? <p className="auth-help">No unpaid bills.</p> : (
                <div className="auth-form">
                  {unpaidByParent.map((group) => (
                    <label key={group.parentName}>
                      <strong>{group.parentName}</strong>
                      <small>Total unpaid bills: {group.rows.length}</small>
                      <small>Total: Rp {group.rows.reduce((sum, row) => sum + Number(row.total_price || 0), 0).toLocaleString('id-ID')}</small>
                      <div className="auth-form">
                        {group.rows.map((row) => (
                          <label key={row.id}>
                            <strong>{row.service_date} {row.session}</strong>
                            <small>Order: {row.order_id}</small>
                            <small>Status: <strong>{row.status}</strong> · Delivery: <strong>{row.delivery_status}</strong></small>
                            <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                            <small>Proof: {row.proof_image_url ? '✓ Uploaded' : '✗ Not uploaded'}</small>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'VERIFIED')}>Verify</button>
                              <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'REJECTED')}>Reject</button>
                              <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Generate Receipt</button>
                            </div>
                          </label>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="module-section">
              <h2>Paid Bills (Grouped By Same Proof Image)</h2>
              {paidByProof.length === 0 ? <p className="auth-help">No paid bills in last 30 days.</p> : (
                <div className="auth-form">
                  {paidByProof.map((group) => (
                    <label key={group.proofUrl}>
                      <strong>Shared Proof Group</strong>
                      <small>Proof URL: {group.proofUrl}</small>
                      <small>Bills: {group.rows.length} | Total: Rp {group.total.toLocaleString('id-ID')}</small>
                      <div className="auth-form">
                        {group.rows.map((row) => (
                          <label key={row.id}>
                            <strong>{row.parent_name}</strong>
                            <small>{row.service_date} {row.session}</small>
                            <small>Order: {row.order_id}</small>
                            <small>Receipt: {row.receipt_number || '—'}</small>
                            <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                              {row.pdf_url ? <a className="btn btn-outline" href={row.pdf_url} target="_blank" rel="noreferrer">Open Receipt</a> : null}
                              <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Regenerate Receipt</button>
                            </div>
                          </label>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
