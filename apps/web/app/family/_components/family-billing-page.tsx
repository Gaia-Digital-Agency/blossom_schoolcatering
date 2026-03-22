'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch, apiFetchResponse } from '../../../lib/auth';
import { fileToWebpDataUrl } from '../../../lib/image';
import LogoutButton from '../../_components/logout-button';
import SessionBadge from '../../_components/session-badge';
import { getSessionCardStyle, getSessionLabel } from '../../../lib/session-theme';

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
};
type BillingRow = {
  id: string;
  order_id?: string | null;
  group_id?: string | null;
  child_id: string;
  status: 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  delivery_status: string;
  service_date: string;
  session: string;
  total_price: number;
  source_type?: 'SINGLE' | 'MULTI';
  admin_note?: string | null;
  proof_image_url?: string | null;
  receipt_number?: string | null;
  pdf_url?: string | null;
};
type SpendingDashboard = {
  month: string;
  totalMonthSpend: number;
  byChild: Array<{ child_id: string; child_name: string; session: string; orders_count: number; total_spend: number }>;
  birthdayHighlights: Array<{ child_name: string; days_until: number }>;
};

export default function FamilyBillingPage() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [spending, setSpending] = useState<SpendingDashboard | null>(null);
  const [batchProofData, setBatchProofData] = useState('');
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH'>('ALL');
  const isStudentView = pathname.startsWith('/student');
  const moduleTitle = isStudentView ? 'Student Billing' : 'Family Billing';
  const returnHref = isStudentView ? '/student' : '/family';

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
    return (spending.byChild || []).filter((row) => row.child_id === selectedChildId);
  }, [spending, selectedChildId]);
  const totalMonthOrders = useMemo(
    () => (spending?.byChild || []).reduce((sum, row) => sum + Number(row.orders_count || 0), 0),
    [spending],
  );
  const billingListPath = isStudentView ? '/billing/youngster/consolidated' : '/billing/parent/consolidated';
  const spendingPath = isStudentView ? '/youngster/me/spending-dashboard' : '/parent/me/spending-dashboard';
  const childrenPath = isStudentView ? '/youngster/me/children/pages' : '/parent/me/children/pages';

  const loadBilling = async (session?: 'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH') => {
    const active = session ?? sessionFilter;
    const path = active !== 'ALL' ? `${billingListPath}?session=${active}` : billingListPath;
    const data = await apiFetch(path) as BillingRow[];
    setBillings(data || []);
  };
  const loadSpending = async () => {
    const data = await apiFetch(spendingPath) as SpendingDashboard;
    setSpending(data);
  };
  const loadBaseData = async () => {
    const childrenData = await apiFetch(childrenPath) as { parentId: string | null; children: Child[] };
    setChildren(childrenData.children);
    if (childrenData.children.length > 0) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadBilling(), loadSpending()]);
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading billing data')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSessionFilterChange = (next: 'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH') => {
    setSessionFilter(next);
    setSelectedBillingIds([]);
    loadBilling(next).catch((err) => setError(err instanceof Error ? err.message : 'Failed refreshing billing'));
  };

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
    const singleBillingIds = selectedBillingIds.filter((billingId) => {
      const row = billings.find((item) => item.id === billingId);
      return (row?.source_type || 'SINGLE') === 'SINGLE';
    });
    if (singleBillingIds.length === 0) { setError('Select at least one unpaid single bill.'); return; }
    setError(''); setMessage('');
    try {
      const out = await apiFetch('/billing/proof-upload-batch', {
        method: 'POST',
        body: JSON.stringify({ billingIds: singleBillingIds, proofImageData: batchProofData }),
      }) as { updatedCount: number };
      setMessage(`Proof uploaded for ${out.updatedCount} billing record(s). Moved to Paid Bills with pending admin verification.`);
      setSelectedBillingIds([]);
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Proof upload failed');
    }
  };
  const onOpenReceipt = async (billingId: string, sourceType: 'SINGLE' | 'MULTI' = 'SINGLE', groupId?: string | null) => {
    setError(''); setMessage('');
    try {
      if (sourceType === 'MULTI') {
        const res = await apiFetchResponse(`/multi-orders/${groupId}/receipt-file`, {
          headers: { Accept: 'application/pdf' },
        });
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
        return;
      }
      const receipt = await apiFetch(`/billing/${billingId}/receipt`) as { pdf_url?: string };
      if (!receipt.pdf_url) { setError('Receipt is not generated yet.'); return; }
      window.open(receipt.pdf_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed opening receipt');
    }
  };
  const onViewProof = async (billingId: string, fallbackProofUrl?: string | null, sourceType: 'SINGLE' | 'MULTI' = 'SINGLE', groupId?: string | null) => {
    setError('');
    setMessage('');
    try {
      if (sourceType === 'MULTI') {
        const res = await apiFetchResponse(`/multi-orders/${groupId}/billing/proof-image`);
        const blob = await res.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
        return;
      }
      const res = await apiFetchResponse(`/billing/${billingId}/proof-image`);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      const fallback = String(fallbackProofUrl || '').trim();
      if (fallback) {
        window.open(fallback, '_blank', 'noopener,noreferrer');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed opening proof image');
    }
  };
  const onRevertProof = async (billingId: string, sourceType: 'SINGLE' | 'MULTI' = 'SINGLE', groupId?: string | null) => {
    if (!window.confirm('Move this bill back to Unpaid and delete the uploaded proof image?')) return;
    setError(''); setMessage('');
    try {
      if (sourceType === 'MULTI') {
        await apiFetch(`/multi-orders/${groupId}/billing/revert-proof`, { method: 'POST' });
      } else {
        await apiFetch(`/billing/${billingId}/revert-proof`, { method: 'POST' });
      }
      setMessage('Bill moved back to Unpaid Bills. Proof image removed.');
      await loadBilling();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed reverting proof');
    }
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>{moduleTitle}</h1><p>Loading...</p></section></main>;
  }

  return (
    <>
    <main className="page-auth page-auth-mobile parents-page">
      <section className="auth-panel">
        <h1>{moduleTitle}</h1>
        <div className="module-guide-card">
          {isStudentView
            ? 'Review your own live billing records across sessions and upload proof only for your own bills.'
            : 'Review Family Group billing, payment proof, and monthly spending.'}
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section" id="parent-billing">
          <h2>{isStudentView ? 'Student Profile' : 'Linked Students'}</h2>
          <p className="auth-help">
            {isStudentView
              ? 'This view is limited to your own billing records.'
              : 'Registration is done on `/register`. Linked students are available immediately for Order and Billing.'}
          </p>
          {children.length > 1 ? (
            <label>Select Student
              <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                {children.map((child) => <option key={child.id} value={child.id}>{child.first_name} {child.last_name} ({child.school_grade})</option>)}
              </select>
            </label>
          ) : children.length === 1 ? (
            <p className="auth-help">Viewing billing for: <strong>{children[0].first_name} {children[0].last_name}</strong> ({children[0].school_grade})</p>
          ) : null}
        </div>

        <div className="module-section">
          <h2>Consolidated Billing</h2>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
              Session
              <select
                value={sessionFilter}
                onChange={(e) => onSessionFilterChange(e.target.value as 'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH')}
              >
                <option value="ALL">All Sessions</option>
                <option value="BREAKFAST">{getSessionLabel('BREAKFAST')}</option>
                <option value="SNACK">{getSessionLabel('SNACK')}</option>
                <option value="LUNCH">{getSessionLabel('LUNCH')}</option>
              </select>
            </label>
            <button className="btn btn-outline" type="button" onClick={() => loadBilling()}>Refresh Billing</button>
          </div>

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
                  <label key={b.id} style={getSessionCardStyle(b.session)}>
                    <SessionBadge session={b.session} />
                    <strong>{b.service_date}</strong>
                    <small>{b.source_type === 'MULTI' ? `Multi Order Group: ${b.group_id || '-'}` : `Order: ${b.order_id}`}</small>
                    <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                    <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                    <small>Proof: {b.proof_image_url ? 'Uploaded' : 'Not uploaded'}</small>
                    {b.admin_note ? <small>Admin Note: {b.admin_note}</small> : null}
                    {b.source_type !== 'MULTI' ? (
                      <label className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={selectedBillingIds.includes(b.id)}
                          onChange={(e) => onToggleBillingSelect(b.id, e.target.checked)}
                        />
                        <span>Select for batch proof upload</span>
                      </label>
                    ) : (
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={async () => {
                          if (!batchProofData.trim()) { setError('Upload/select a proof image first.'); return; }
                          try {
                            await apiFetch(`/multi-orders/${b.group_id}/billing/proof-upload`, {
                              method: 'POST',
                              body: JSON.stringify({ proofImageData: batchProofData }),
                            }, { skipAutoReload: true });
                            setMessage('Grouped proof uploaded.');
                            await loadBilling();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Grouped proof upload failed');
                          }
                        }}
                      >
                        Upload Grouped Proof
                      </button>
                    )}
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
                  <label key={b.id} style={getSessionCardStyle(b.session)}>
                    <SessionBadge session={b.session} />
                    <strong>{b.service_date}</strong>
                    <small>{b.source_type === 'MULTI' ? `Multi Order Group: ${b.group_id || '-'}` : `Order: ${b.order_id}`}</small>
                    <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                    <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                    <small>Receipt: {b.receipt_number || '-'}</small>
                    <small>Proof File: {b.proof_image_url ? b.proof_image_url.split('/').pop() || '-' : '-'}</small>
                    {b.admin_note ? <small>Admin Note: {b.admin_note}</small> : null}
                    <div className="billing-action-row">
                      {b.proof_image_url ? (
                        <button className="btn btn-outline" type="button" onClick={() => onViewProof(b.id, b.proof_image_url, b.source_type || 'SINGLE', b.group_id)}>
                          View Proof Image
                        </button>
                      ) : null}
                      {b.receipt_number ? (
                        <button className="btn btn-outline" type="button" onClick={() => onOpenReceipt(b.id, b.source_type || 'SINGLE', b.group_id)}>Open Receipt</button>
                      ) : null}
                      {b.status === 'PENDING_VERIFICATION' ? (
                        <button className="btn btn-outline" type="button" onClick={() => onRevertProof(b.id, b.source_type || 'SINGLE', b.group_id)}>Redo (Move to Unpaid)</button>
                      ) : null}
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
                <small>Total Month Orders: {totalMonthOrders}</small>
                <small>Total Monthly Spend: Rp {Number(spending.totalMonthSpend).toLocaleString('id-ID')}</small>
              </label>
              {visibleSpendingByChild.map((row) => (
                <label key={`${row.child_id}-${row.session}`} style={getSessionCardStyle(row.session)}>
                  <SessionBadge session={row.session} />
                  <strong>{isStudentView ? `Student (${row.child_name})` : `Family Group (${row.child_name})`}</strong>
                  <small>Session: {getSessionLabel(row.session)}</small>
                  <small>Student Month Orders: {row.orders_count}</small>
                  <small>Student Monthly Spend: Rp {Number(row.total_spend).toLocaleString('id-ID')}</small>
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
    <LogoutButton returnHref={returnHref} showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
