'use client';

import { useEffect, useState } from 'react';
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

export default function AdminBillingPage() {
  const [rows, setRows] = useState<BillingRow[]>([]);
  const [filterUnpaidNoProof, setFilterUnpaidNoProof] = useState(false);
  const [filterDeliveryPending, setFilterDeliveryPending] = useState(false);
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

  const filteredRows = rows.filter((row) => {
    if (filterUnpaidNoProof && !(row.status === 'UNPAID' && !row.proof_image_url)) return false;
    if (filterDeliveryPending && row.delivery_status === 'DELIVERED') return false;
    return true;
  });

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

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
          <button
            className={`btn ${filterUnpaidNoProof ? 'btn-primary' : 'btn-outline'}`}
            type="button"
            onClick={() => setFilterUnpaidNoProof((v) => !v)}
          >
            Unpaid / No Proof
          </button>
          <button
            className={`btn ${filterDeliveryPending ? 'btn-primary' : 'btn-outline'}`}
            type="button"
            onClick={() => setFilterDeliveryPending((v) => !v)}
          >
            Delivery Not Confirmed
          </button>
          <button className="btn btn-outline" type="button" onClick={load} disabled={loading} style={{ marginLeft: 'auto' }}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <p className="auth-help">Loading…</p>
        ) : filteredRows.length === 0 ? (
          <p className="auth-help">No billing records.</p>
        ) : (
          <div className="auth-form">
            {filteredRows.map((row) => (
              <div key={row.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <strong>{row.parent_name}</strong>
                <small>Order: {row.order_id}</small>
                <small>{row.service_date} · {row.session}</small>
                <small>Status: <strong>{row.status}</strong> · Delivery: <strong>{row.delivery_status}</strong></small>
                <small>Total: Rp {Number(row.total_price).toLocaleString('id-ID')}</small>
                <small>Proof: {row.proof_image_url ? '✓ Uploaded' : '✗ Not uploaded'}</small>
                <small>Receipt: {row.receipt_number || '—'}</small>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  {row.pdf_url ? (
                    <a className="btn btn-outline" href={row.pdf_url} target="_blank" rel="noreferrer">Open Receipt</a>
                  ) : null}
                  <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'VERIFIED')}>Verify</button>
                  <button className="btn btn-outline" type="button" onClick={() => onDecision(row.id, 'REJECTED')}>Reject</button>
                  <button className="btn btn-outline" type="button" onClick={() => onGenerateReceipt(row.id)}>Generate Receipt</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
