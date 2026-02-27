'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../../lib/auth';
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

export default function AdminBillingPage() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const data = await apiFetch(`/admin/billing${qs}`) as BillingRow[];
      setRows(data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading billing');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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

        <label>
          Status Filter
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">ALL</option>
            <option value="UNPAID">UNPAID</option>
            <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh Billing'}</button>

        {rows.length === 0 ? <p className="auth-help">No billing records.</p> : (
          <div className="auth-form">
            {rows.map((row) => (
              <label key={row.id}>
                <strong>{row.parent_name}</strong>
                <small>Order: {row.order_id}</small>
                <small>{row.service_date} {row.session}</small>
                <small>Status: {row.status} | Delivery: {row.delivery_status}</small>
                <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                <small>Proof: {row.proof_image_url ? 'Uploaded' : 'Not uploaded'}</small>
                <small>Receipt: {row.receipt_number || '-'}</small>
                {row.pdf_url ? <a className="btn btn-outline" href={row.pdf_url} target="_blank">Open Receipt</a> : null}
                <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'VERIFIED')}>Verify</button>
                <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'REJECTED')}>Reject</button>
                <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Generate Receipt</button>
              </label>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
