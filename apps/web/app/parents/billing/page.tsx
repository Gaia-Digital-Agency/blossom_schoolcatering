'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/auth';
import { fileToWebpDataUrl } from '../../../lib/image';
import LogoutButton from '../../_components/logout-button';

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
};
type BillingRow = {
  id: string;
  order_id: string;
  child_id: string;
  status: 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  delivery_status: string;
  service_date: string;
  session: string;
  total_price: number;
  admin_note?: string | null;
  proof_image_url?: string | null;
  receipt_number?: string | null;
  pdf_url?: string | null;
};
type SpendingDashboard = {
  month: string;
  totalMonthSpend: number;
  byChild: Array<{ child_name: string; orders_count: number; total_spend: number }>;
  birthdayHighlights: Array<{ child_name: string; days_until: number }>;
};

export default function ParentsBillingPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [spending, setSpending] = useState<SpendingDashboard | null>(null);
  const [batchProofData, setBatchProofData] = useState('');
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);

  const visibleBillings = useMemo(
    () => (selectedChildId ? billings.filter((b) => b.child_id === selectedChildId) : billings),
    [billings, selectedChildId],
  );
  const thirtyDaysAgo = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const unpaidBillings = useMemo(
    () => visibleBillings
      .filter((b) => {
        const hasProof = Boolean((b.proof_image_url || '').trim());
        if (b.status === 'REJECTED') return true;
        return !hasProof;
      })
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [visibleBillings],
  );
  const paidBillings = useMemo(
    () => visibleBillings
      .filter((b) => {
        const hasProof = Boolean((b.proof_image_url || '').trim());
        if (!hasProof) return false;
        if (!['PENDING_VERIFICATION', 'VERIFIED'].includes(b.status)) return false;
        return String(b.service_date) >= thirtyDaysAgo;
      })
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [visibleBillings, thirtyDaysAgo],
  );
  const visibleSpendingByChild = useMemo(() => {
    if (!spending) return [];
    if (!selectedChildId) return spending.byChild || [];
    const selected = children.find((c) => c.id === selectedChildId);
    if (!selected) return spending.byChild || [];
    const fullName = `${selected.first_name} ${selected.last_name}`.trim();
    return (spending.byChild || []).filter((row) => row.child_name === fullName);
  }, [spending, selectedChildId, children]);

  const loadBilling = async () => {
    const data = await apiFetch('/billing/parent/consolidated') as BillingRow[];
    setBillings(data || []);
  };
  const loadSpending = async () => {
    const data = await apiFetch('/parents/me/spending-dashboard') as SpendingDashboard;
    setSpending(data);
  };
  const loadBaseData = async () => {
    const childrenData = await apiFetch('/parents/me/children/pages') as { parentId: string; children: Child[] };
    setChildren(childrenData.children);
    if (childrenData.children.length > 0) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadBilling(), loadSpending()]);
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading billing data')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onProofImageUpload = async (file?: File | null) => {
    if (!file) return;
    setError(''); setMessage('');
    try {
      const webpDataUrl = await fileToWebpDataUrl(file);
      setBatchProofData(webpDataUrl);
      setMessage('Proof image converted to WebP.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed converting proof image to WebP');
    }
  };
  const onToggleBillingSelect = (billingId: string, checked: boolean) => {
    setSelectedBillingIds((prev) => {
      if (checked) return [...new Set([...prev, billingId])];
      return prev.filter((id) => id !== billingId);
    });
  };
  const onUploadBatchProof = async () => {
    if (!batchProofData.trim()) { setError('Upload/select a proof image first.'); return; }
    if (selectedBillingIds.length === 0) { setError('Select at least one unpaid bill.'); return; }
    setError(''); setMessage('');
    try {
      const out = await apiFetch('/billing/proof-upload-batch', {
        method: 'POST',
        body: JSON.stringify({ billingIds: selectedBillingIds, proofImageData: batchProofData }),
      }) as { updatedCount: number };
      setMessage(`Proof uploaded for ${out.updatedCount} billing record(s). Moved to Paid Bills with pending admin verification.`);
      setSelectedBillingIds([]);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proof upload failed');
    }
  };
  const onOpenReceipt = async (billingId: string) => {
    setError(''); setMessage('');
    try {
      const receipt = await apiFetch(`/billing/${billingId}/receipt`) as { pdf_url?: string };
      if (!receipt.pdf_url) { setError('Receipt is not generated yet.'); return; }
      window.open(receipt.pdf_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed opening receipt');
    }
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Parent Page</h1><p>Loading...</p></section></main>;
  }

  return (
    <>
    <main className="page-auth page-auth-mobile parents-page">
      <section className="auth-panel">
        <h1>Parent Page</h1>
        <nav className="module-nav" aria-label="Parent Module Navigation">
          <Link href="/">Home</Link>
          <Link href="/parents/orders">Order</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/rating">Rating</Link>
          <Link href="/parents/billing" className="active">Billing</Link>
        </nav>
        <div className="module-guide-card">
          💡 View and pay your invoices. Track monthly spending.
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section" id="parent-billing">
          <h2>Linked Youngsters</h2>
          <p className="auth-help">Youngster registration is done on `/register/youngsters`. Linked youngsters are auto-linked during registration and immediately available for Order and Billing.</p>
          {children.length > 1 ? (
            <label>Select Youngster
              <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                {children.map((child) => <option key={child.id} value={child.id}>{child.first_name} {child.last_name} ({child.school_grade})</option>)}
              </select>
            </label>
          ) : children.length === 1 ? (
            <p className="auth-help">Viewing billing for: <strong>{children[0].first_name} {children[0].last_name}</strong></p>
          ) : null}
        </div>

        <div className="module-section">
          <h2>Consolidated Billing</h2>
          <button className="btn btn-outline" type="button" onClick={loadBilling}>Refresh Billing</button>

          <div className="auth-form billing-proof-batch">
            <label>
              One Proof Image for Selected Bills
              <input type="file" accept="image/*" onChange={(e) => onProofImageUpload(e.target.files?.[0])} />
            </label>
            <button className="btn btn-primary" type="button" onClick={onUploadBatchProof}>Upload Proof For Selected Unpaid Bills</button>
            <small>{selectedBillingIds.length} bill(s) selected.</small>
          </div>

          <div className="parent-billing-card parent-billing-card-unpaid">
            <h3>Unpaid Bills</h3>
            {unpaidBillings.length === 0 ? <p className="auth-help">No unpaid billing records.</p> : (
              <div className="auth-form">
                {unpaidBillings.map((b) => (
                  <label key={b.id}>
                    <strong>{b.service_date} {b.session}</strong>
                    <small>Order: {b.order_id}</small>
                    <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                    <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                    <small>Proof: {b.proof_image_url ? 'Uploaded' : 'Not uploaded'}</small>
                    {b.admin_note ? <small>Admin Note: {b.admin_note}</small> : null}
                    <label className="checkbox-inline">
                      <input
                        type="checkbox"
                        checked={selectedBillingIds.includes(b.id)}
                        onChange={(e) => onToggleBillingSelect(b.id, e.target.checked)}
                      />
                      <span>Select for batch proof upload</span>
                    </label>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="parent-billing-card parent-billing-card-paid">
            <h3>Paid Bills (Past 30 Days)</h3>
            <p className="auth-help">Proof uploaded bills are listed here while waiting Admin approval/rejection.</p>
            {paidBillings.length === 0 ? <p className="auth-help">No paid billing records in last 30 days.</p> : (
              <div className="auth-form">
                {paidBillings.map((b) => (
                  <label key={b.id}>
                    <strong>{b.service_date} {b.session}</strong>
                    <small>Order: {b.order_id}</small>
                    <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                    <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                    <small>Receipt: {b.receipt_number || '-'}</small>
                    {b.admin_note ? <small>Admin Note: {b.admin_note}</small> : null}
                    <div className="billing-action-row">
                      <button className="btn btn-outline" type="button" onClick={() => onOpenReceipt(b.id)}>Open Receipt</button>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="module-section">
          <h2>Spending Dashboard</h2>
          <button className="btn btn-outline" type="button" onClick={loadSpending}>Refresh Spending</button>
          {spending ? (
            <div className="auth-form">
              <label>
                <strong>Month {spending.month}</strong>
                <small>Total Spend: Rp {Number(spending.totalMonthSpend).toLocaleString('id-ID')}</small>
                <small>Birthdays in 30 days: {(spending.birthdayHighlights || []).map((b) => `${b.child_name} (${b.days_until}d)`).join(', ') || '-'}</small>
              </label>
              {visibleSpendingByChild.map((row) => (
                <label key={row.child_name}>
                  <strong>{row.child_name}</strong>
                  <small>Orders: {row.orders_count}</small>
                  <small>Spend: Rp {Number(row.total_spend).toLocaleString('id-ID')}</small>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <style jsx>{`
        .module-guide-card {
          background: #fffbf4;
          border: 1px solid #e8d9c0;
          border-left: 3px solid #c8a96e;
          border-radius: 0.6rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          color: #6b5a43;
          margin-bottom: 0.5rem;
        }
      `}</style>
    </main>
    <LogoutButton />
    </>
  );
}
