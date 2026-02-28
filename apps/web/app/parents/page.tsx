'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import { fileToWebpDataUrl } from '../../lib/image';

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
  dietary_allergies?: string;
};
type SessionType = 'LUNCH' | 'SNACK' | 'BREAKFAST';
type SessionSetting = { session: SessionType; is_active: boolean };
const SESSION_ORDER: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];
type MenuItem = {
  id: string;
  session?: SessionType;
  name: string;
  description: string;
  nutrition_facts_text: string;
  price: number;
  ingredients: string[];
  has_allergen: boolean;
};
type OrderItem = {
  menu_item_id: string;
  item_name_snapshot: string;
  price_snapshot: number;
  quantity: number;
};
type ConsolidatedOrder = {
  id: string;
  child_id: string;
  child_name: string;
  session: SessionType;
  service_date: string;
  status: string;
  total_price: number;
  billing_status?: string | null;
  delivery_status?: string | null;
  can_edit: boolean;
  items: OrderItem[];
};
type DraftCart = { id: string; status: 'OPEN' | 'SUBMITTED' | 'EXPIRED'; expires_at: string };
type BillingRow = {
  id: string;
  order_id: string;
  child_id: string;
  status: 'UNPAID' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  delivery_status: string;
  service_date: string;
  session: string;
  total_price: number;
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

function nextWeekdayIsoDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function getCutoffTimestamp(serviceDate: string) {
  return new Date(`${serviceDate}T00:00:00.000Z`).getTime();
}
function formatRemaining(ms: number) {
  if (ms <= 0) return 'Cutoff passed';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function todayMakassarIsoDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const yyyy = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const mm = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const dd = Number(parts.find((p) => p.type === 'day')?.value || '01');
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  return d.toISOString().slice(0, 10);
}

export default function ParentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [children, setChildren] = useState<Child[]>([]);
  const [parentId, setParentId] = useState('');

  const [orders, setOrders] = useState<ConsolidatedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [selectedChildId, setSelectedChildId] = useState('');
  const [serviceDate, setServiceDate] = useState(nextWeekdayIsoDate());
  const [session, setSession] = useState<SessionType>('LUNCH');
  const [sessionSettings, setSessionSettings] = useState<SessionSetting[]>([{ session: 'LUNCH', is_active: true }]);

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');

  const [quickReorderDate, setQuickReorderDate] = useState(nextWeekdayIsoDate());
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [spending, setSpending] = useState<SpendingDashboard | null>(null);
  const [batchProofData, setBatchProofData] = useState('');
  const [selectedBillingIds, setSelectedBillingIds] = useState<string[]>([]);

  const draftSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedCount = useMemo(() => Object.values(itemQty).filter((qty) => qty > 0).length, [itemQty]);
  const placeCutoffMs = getCutoffTimestamp(serviceDate) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = placeCutoffMs <= 0;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;
  const visibleOrders = useMemo(
    () => (selectedChildId ? orders.filter((o) => o.child_id === selectedChildId) : orders),
    [orders, selectedChildId],
  );
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
      .filter((b) => !(b.status === 'VERIFIED' && Boolean((b.proof_image_url || '').trim())))
      .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date))),
    [visibleBillings],
  );

  const paidBillings = useMemo(
    () => visibleBillings
      .filter((b) => b.status === 'VERIFIED' && Boolean((b.proof_image_url || '').trim()) && String(b.service_date) >= thirtyDaysAgo)
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

  const draftItems = useMemo(() => {
    const index = new Map(menuItems.map((m) => [m.id, m]));
    return Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ menuItem: index.get(id), id, qty }))
      .filter((x) => Boolean(x.menuItem));
  }, [itemQty, menuItems]);

  const todayOrder = useMemo(() => {
    const today = todayMakassarIsoDate();
    return visibleOrders.find((o) => o.service_date === today && o.status === 'PLACED') || null;
  }, [visibleOrders]);

  const selectedDayOrder = useMemo(
    () => visibleOrders.find((o) => o.service_date === serviceDate && o.session === session && o.status === 'PLACED') || null,
    [visibleOrders, serviceDate, session],
  );
  const activeSessions = useMemo(
    () => SESSION_ORDER.filter((s) => sessionSettings.find((x) => x.session === s)?.is_active),
    [sessionSettings],
  );

  useEffect(() => {
    if (activeSessions.length === 0) return;
    if (!activeSessions.includes(session)) {
      setSession(activeSessions[0]);
    }
  }, [activeSessions, session]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const ordersData = await apiFetch('/parents/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
      setOrders(ordersData.orders || []);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadBilling = async () => {
    const data = await apiFetch('/billing/parent/consolidated') as BillingRow[];
    setBillings(data || []);
  };
  const loadSpending = async () => {
    const data = await apiFetch('/parents/me/spending-dashboard') as SpendingDashboard;
    setSpending(data);
  };
  const loadSessionSettings = async () => {
    const settings = await apiFetch('/session-settings') as SessionSetting[];
    if (!Array.isArray(settings) || settings.length === 0) return;
    setSessionSettings(settings);
  };

  const loadBaseData = async () => {
    const childrenData = await apiFetch('/parents/me/children/pages') as { parentId: string; children: Child[] };
    setParentId(childrenData.parentId);
    setChildren(childrenData.children);
    if (childrenData.children.length > 0 && !selectedChildId) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadOrders(), loadBilling(), loadSpending(), loadSessionSettings()]);
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading parent data')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const onAddDraftItem = (menuItemId: string) => {
    const alreadySelected = Object.values(itemQty).filter((qty) => qty > 0).length;
    if (!itemQty[menuItemId] && alreadySelected >= 5) {
      setError('Maximum 5 items per cart/order.');
      return;
    }
    setError('');
    setItemQty((prev) => ({ ...prev, [menuItemId]: Math.max(1, prev[menuItemId] || 0) }));
  };

  const onRemoveDraftItem = (menuItemId: string) => {
    setItemQty((prev) => ({ ...prev, [menuItemId]: 0 }));
  };

  const loadDraftItems = async (cartId: string) => {
    const detail = await apiFetch(`/carts/${cartId}`) as {
      id: string;
      expires_at: string;
      items: Array<{ menu_item_id: string; quantity: number }>;
    };
    const qtyByItem: Record<string, number> = {};
    for (const item of detail.items) qtyByItem[item.menu_item_id] = Number(item.quantity);
    setItemQty(qtyByItem);
    setDraftCartId(detail.id);
    setDraftExpiresAt(detail.expires_at);
  };

  const loadMenuAndDraft = async () => {
    if (!selectedChildId) return;
    const [menuData, cartsData] = await Promise.all([
      apiFetch(`/menus?service_date=${serviceDate}&session=${session}`) as Promise<{ items: MenuItem[] }>,
      apiFetch(`/carts?child_id=${selectedChildId}&service_date=${serviceDate}&session=${session}`) as Promise<DraftCart[]>,
    ]);
    setMenuItems(menuData.items || []);
    const openDraft = (cartsData || []).find((cart) => cart.status === 'OPEN');
    if (!openDraft) {
      setDraftCartId('');
      setDraftExpiresAt('');
      setItemQty({});
      return;
    }
    await loadDraftItems(openDraft.id);
  };

  useEffect(() => {
    loadMenuAndDraft().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading draft'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, serviceDate, session]);

  const onPlaceOrder = async () => {
    if (!selectedChildId) return setError('Please select a youngster first.');
    const items = Object.entries(itemQty).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (items.length === 0) return setError('Select at least one menu item.');
    if (placementExpired) return setError('ORDER_CUTOFF_EXCEEDED');
    if (items.length > 5) return setError('Maximum 5 items per cart/order.');

    setSubmitting(true); setError(''); setMessage('');
    try {
      const cartRes = await apiFetch('/carts', { method: 'POST', body: JSON.stringify({ childId: selectedChildId, serviceDate, session }) }) as { id?: string };
      if (!cartRes?.id) throw new Error('Cart creation failed — no cart ID returned.');
      const cartId = cartRes.id;
      await apiFetch(`/carts/${cartId}/items`, { method: 'PATCH', body: JSON.stringify({ items }) });
      const order = await apiFetch(`/carts/${cartId}/submit`, { method: 'POST' }) as { id: string; total_price: number };
      setMessage(`Order placed successfully. Order ID: ${order.id}, total: Rp ${order.total_price.toLocaleString('id-ID')}.`);
      setItemQty({}); setDraftCartId(''); setDraftExpiresAt('');
      await Promise.all([loadOrders(), loadBilling()]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order placement failed';
      if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH') {
        window.alert('Only Lunch Available');
        setError('Only Lunch Available');
      } else {
        setError(msg);
      }
    } finally { setSubmitting(false); }
  };

  const onOpenOrderAsDraft = async (order: ConsolidatedOrder, targetDate: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch('/carts/quick-reorder', {
        method: 'POST',
        body: JSON.stringify({ sourceOrderId: order.id, serviceDate: targetDate }),
      }) as { cartId: string; excludedItemIds: string[] };
      setSelectedChildId(order.child_id);
      setServiceDate(targetDate);
      const nextSession = activeSessions.includes(order.session) ? order.session : (activeSessions[0] || 'LUNCH');
      setSession(nextSession);
      const menuData = await apiFetch(`/menus?service_date=${targetDate}&session=${nextSession}`) as { items: MenuItem[] };
      setMenuItems(menuData.items || []);
      await loadDraftItems(out.cartId);
      setMessage(out.excludedItemIds.length
        ? `Order reopened as draft with ${out.excludedItemIds.length} excluded dish(es).`
        : 'Order reopened as draft in Draft Section.');
      window.setTimeout(() => draftSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to reopen order as draft'); }
  };

  const onProofImageUpload = async (file?: File | null) => {
    if (!file) return;
    setError('');
    setMessage('');
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
    if (!batchProofData.trim()) {
      setError('Upload/select a proof image first.');
      return;
    }
    if (selectedBillingIds.length === 0) {
      setError('Select at least one unpaid bill.');
      return;
    }
    setError('');
    setMessage('');
    try {
      const out = await apiFetch('/billing/proof-upload-batch', {
        method: 'POST',
        body: JSON.stringify({ billingIds: selectedBillingIds, proofImageData: batchProofData }),
      }) as { updatedCount: number };
      setMessage(`Proof uploaded for ${out.updatedCount} billing record(s).`);
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
      if (!receipt.pdf_url) {
        setError('Receipt is not generated yet.');
        return;
      }
      window.open(receipt.pdf_url, '_blank');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed opening receipt');
    }
  };

  const onDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Confirm delete this order before cutoff?')) return;
    setError(''); setMessage('');
    try { await apiFetch(`/orders/${orderId}`, { method: 'DELETE' }); setMessage('Order deleted successfully.'); await Promise.all([loadOrders(), loadBilling()]); }
    catch (err) { setError(err instanceof Error ? err.message : 'Order delete failed'); }
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Parent Page</h1><p>Loading parent data...</p></section></main>;
  }

  return (
    <main className="page-auth page-auth-mobile parents-page">
      <section className="auth-panel">
        <h1>Parent Page</h1>
        {parentId ? <p className="auth-help">Parent Profile ID: {parentId}</p> : null}
        <p className="auth-help">Ordering and billing dashboard for linked youngsters.</p>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section">
          <h2>Linked Youngsters</h2>
          <p className="auth-help">Youngster registration is done on `/register/youngsters`. Linked youngsters are auto-linked by matching parent and youngster last name.</p>
          <label>Select Youngster<select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}><option value="">Select...</option>{children.map((child) => <option key={child.id} value={child.id}>{child.first_name} {child.last_name} ({child.school_grade})</option>)}</select></label>
        </div>

        <div className="module-section">
          <h2>Confirmed Order Of The Day</h2>
          {todayOrder ? (
            <div className="auth-form">
              <label>
                <strong>{todayOrder.child_name} - {todayOrder.service_date} {todayOrder.session}</strong>
                <small>Status: {todayOrder.status} | Billing: {todayOrder.billing_status || '-'} | Delivery: {todayOrder.delivery_status || '-'}</small>
                <small>Total: Rp {Number(todayOrder.total_price).toLocaleString('id-ID')}</small>
                <small>Items: {todayOrder.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
              </label>
            </div>
          ) : <p className="auth-help">No confirmed order found for today.</p>}
        </div>

        <div className="module-section">
          <h2>Menu and Cart</h2>
          <label>Service Date<input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
              {activeSessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(placeCutoffMs)} (08:00 Asia/Makassar)</p>
          {draftCartId && hasOpenDraft ? <p className="auth-help">Open draft detected and loaded automatically.</p> : null}
          {selectedDayOrder ? (
            <p className="auth-help">Confirmed order already exists for selected day/session: {selectedDayOrder.id}</p>
          ) : null}
          <p className="auth-help">Menu is auto-populated from active dishes set by Admin.</p>

          {menuItems.length > 0 ? (
            <div className="menu-flow-grid">
              <div className="menu-search-section">
                <h3>Menu Section</h3>
                <div className="auth-form">
                  {menuItems.map((item) => (
                    <label key={item.id}>
                      <span><strong>{item.name}</strong> - Rp {Number(item.price).toLocaleString('id-ID')}</span>
                      <small>{item.description}</small>
                      <small>{item.nutrition_facts_text}</small>
                      <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                      <button className="btn btn-outline" type="button" onClick={() => onAddDraftItem(item.id)}>Add</button>
                    </label>
                  ))}
                </div>
              </div>
              <div className="menu-draft-section" ref={draftSectionRef}>
                <h3>Draft Section</h3>
                {draftItems.length === 0 ? <p className="auth-help">No dishes in draft. Use Add from Menu Section.</p> : (
                  <div className="auth-form">
                    {draftItems.map((d) => (
                      <label key={d.id}>
                        <span><strong>{d.menuItem?.name}</strong> - Rp {Number(d.menuItem?.price || 0).toLocaleString('id-ID')}</span>
                        <small>{d.menuItem?.description}</small>
                        <input type="number" min={0} max={5} value={d.qty} onChange={(e) => setItemQty((prev) => ({ ...prev, [d.id]: Number(e.target.value || 0) }))} />
                        <button className="btn btn-outline" type="button" onClick={() => onRemoveDraftItem(d.id)}>Remove</button>
                      </label>
                    ))}
                  </div>
                )}
                <div className="draft-actions">
                  <p className="auth-help">Selected items: {selectedCount} / 5</p>
                  <button className="btn btn-primary" type="button" disabled={submitting || placementExpired} onClick={onPlaceOrder}>
                    {submitting ? 'Placing Order...' : 'Place Order'}
                  </button>
                </div>
              </div>
            </div>
          ) : <p className="auth-help">No active dishes configured by Admin for this date/session.</p>}
        </div>

        <div className="module-section">
          <h2>Consolidated Orders</h2>
          <label>Quick Reorder Target Date<input type="date" value={quickReorderDate} onChange={(e) => setQuickReorderDate(e.target.value)} /></label>
          <button className="btn btn-outline" type="button" onClick={loadOrders} disabled={loadingOrders}>{loadingOrders ? 'Refreshing...' : 'Refresh Orders'}</button>

          {visibleOrders.length === 0 ? <p className="auth-help">No orders yet for selected youngster.</p> : (
            <div className="auth-form">
              {visibleOrders.map((order) => (
                <label key={order.id}>
                  <span><strong>{order.child_name}</strong> - {order.service_date} {order.session}</span>
                  <small>Order: {order.id}</small>
                  <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                  <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                  <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                  <button className="btn btn-outline" type="button" onClick={() => onOpenOrderAsDraft(order, order.service_date)} disabled={!order.can_edit || submitting}>Edit Before Cutoff</button>
                  <button className="btn btn-outline" type="button" onClick={() => onDeleteOrder(order.id)} disabled={!order.can_edit || submitting}>Delete Before Cutoff</button>
                  <button className="btn btn-outline" type="button" onClick={() => onOpenOrderAsDraft(order, quickReorderDate)} disabled={submitting}>Quick Reorder</button>
                  {!order.can_edit ? <small>Cutoff passed or order status is not editable.</small> : null}
                </label>
              ))}
            </div>
          )}
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

          <h3>Unpaid Bills (All)</h3>
          {unpaidBillings.length === 0 ? <p className="auth-help">No unpaid billing records.</p> : (
            <div className="auth-form">
              {unpaidBillings.map((b) => (
                <label key={b.id}>
                  <strong>{b.service_date} {b.session}</strong>
                  <small>Order: {b.order_id}</small>
                  <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                  <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                  <small>Proof: {b.proof_image_url ? 'Uploaded' : 'Not uploaded'}</small>
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

          <h3>Paid Bills (Past 30 Days)</h3>
          {paidBillings.length === 0 ? <p className="auth-help">No paid billing records in last 30 days.</p> : (
            <div className="auth-form">
              {paidBillings.map((b) => (
                <label key={b.id}>
                  <strong>{b.service_date} {b.session}</strong>
                  <small>Order: {b.order_id}</small>
                  <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                  <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                  <small>Receipt: {b.receipt_number || '-'}</small>
                  <div className="billing-action-row">
                    <button className="btn btn-outline" type="button" onClick={() => onOpenReceipt(b.id)}>Open Receipt</button>
                  </div>
                </label>
              ))}
            </div>
          )}
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
    </main>
  );
}
