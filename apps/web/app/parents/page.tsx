'use client';

import { useEffect, useMemo, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../lib/auth';

type Child = {
  id: string;
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
  dietary_allergies?: string;
};
type MenuItem = {
  id: string;
  session?: 'LUNCH' | 'SNACK' | 'BREAKFAST';
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
  child_name: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  service_date: string;
  status: string;
  total_price: number;
  billing_status?: string | null;
  delivery_status?: string | null;
  can_edit: boolean;
  items: OrderItem[];
};
type DraftCart = { id: string; status: 'OPEN' | 'SUBMITTED' | 'EXPIRED'; expires_at: string };
type Favourite = {
  id: string;
  label: string;
  session: 'LUNCH' | 'SNACK' | 'BREAKFAST';
  items: Array<{ menu_item_id: string; quantity: number; name?: string }>;
};
type BillingRow = {
  id: string;
  order_id: string;
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
  const [session, setSession] = useState<'LUNCH' | 'SNACK' | 'BREAKFAST'>('LUNCH');

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [searchText, setSearchText] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [favouritesOnly, setFavouritesOnly] = useState(false);

  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);

  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [favLabel, setFavLabel] = useState('');

  const [quickReorderDate, setQuickReorderDate] = useState(nextWeekdayIsoDate());
  const [wizardSourceOrderId, setWizardSourceOrderId] = useState('');
  const [wizardDates, setWizardDates] = useState('');
  const [billings, setBillings] = useState<BillingRow[]>([]);
  const [spending, setSpending] = useState<SpendingDashboard | null>(null);
  const [billingProof, setBillingProof] = useState<Record<string, string>>({});

  const [editingOrderId, setEditingOrderId] = useState('');
  const [editServiceDate, setEditServiceDate] = useState('');
  const [editSession, setEditSession] = useState<'LUNCH' | 'SNACK' | 'BREAKFAST'>('LUNCH');
  const [editMenuItems, setEditMenuItems] = useState<MenuItem[]>([]);
  const [editQty, setEditQty] = useState<Record<string, number>>({});


  const selectedCount = useMemo(() => Object.values(itemQty).filter((qty) => qty > 0).length, [itemQty]);
  const editSelectedCount = useMemo(() => Object.values(editQty).filter((qty) => qty > 0).length, [editQty]);
  const placeCutoffMs = getCutoffTimestamp(serviceDate) - nowMs;
  const editCutoffMs = editServiceDate ? getCutoffTimestamp(editServiceDate) - nowMs : 0;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = placeCutoffMs <= 0;
  const editExpired = Boolean(editServiceDate) && editCutoffMs <= 0;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;

  const apiFetch = async (path: string, init?: RequestInit) => {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) throw new Error('Please login first.');
    let res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) throw new Error('Session expired. Please log in again.');
      token = refreshed;
      res = await fetch(`${getApiBase()}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const resMessage = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      throw new Error(resMessage || 'Request failed');
    }
    return res.json();
  };

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const ordersData = await apiFetch('/parents/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
      setOrders(ordersData.orders || []);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadFavourites = async () => {
    const qs = new URLSearchParams();
    if (selectedChildId) qs.set('child_id', selectedChildId);
    qs.set('session', session);
    const data = await apiFetch(`/favourites?${qs.toString()}`) as Favourite[];
    setFavourites(data || []);
  };

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
    setParentId(childrenData.parentId);
    setChildren(childrenData.children);
    if (childrenData.children.length > 0 && !selectedChildId) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadOrders(), loadFavourites(), loadBilling(), loadSpending()]);
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading parent data')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const onLoadMenu = async () => {
    setError('');
    setMessage('');
    const qs = new URLSearchParams();
    qs.set('service_date', serviceDate);
    qs.set('session', session);
    if (searchText) qs.set('search', searchText);
    if (priceMin) qs.set('price_min', priceMin);
    if (priceMax) qs.set('price_max', priceMax);
    if (favouritesOnly) qs.set('favourites_only', 'true');
    const data = await apiFetch(`/menus?${qs.toString()}`) as { items: MenuItem[] };
    setMenuItems(data.items || []);
    setItemQty({});
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
    setLoadingDraft(true);
    try {
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
      setMessage('Draft detected and loaded for selected youngster/date/session.');
    } finally {
      setLoadingDraft(false);
    }
  };

  useEffect(() => {
    loadMenuAndDraft().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading draft'));
    loadFavourites().catch(() => undefined);
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
      await Promise.all([loadOrders(), loadFavourites()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order placement failed');
    } finally { setSubmitting(false); }
  };

  const onSaveFavourite = async () => {
    const items = Object.entries(itemQty).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (!favLabel.trim()) return setError('Favourite label is required.');
    if (items.length === 0) return setError('Select items before saving favourite.');
    setError(''); setMessage('');
    try {
      await apiFetch('/favourites', { method: 'POST', body: JSON.stringify({ childId: selectedChildId, label: favLabel, session, items }) });
      setFavLabel('');
      setMessage('Favourite meal combo saved.');
      await loadFavourites();
    } catch (err) { setError(err instanceof Error ? err.message : 'Save favourite failed'); }
  };

  const onApplyFavourite = async (favouriteId: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch(`/favourites/${favouriteId}/apply`, { method: 'POST', body: JSON.stringify({ serviceDate }) }) as { excludedItemIds: string[] };
      setMessage(out.excludedItemIds.length ? `Favourite applied with ${out.excludedItemIds.length} unavailable item exclusions.` : 'Favourite applied to cart.');
      await loadMenuAndDraft();
    } catch (err) { setError(err instanceof Error ? err.message : 'Apply favourite failed'); }
  };

  const onDeleteFavourite = async (favouriteId: string) => {
    if (!window.confirm('Delete this saved favourite combo?')) return;
    setError(''); setMessage('');
    try {
      await apiFetch(`/favourites/${favouriteId}`, { method: 'DELETE' });
      setMessage('Favourite combo deleted.');
      await loadFavourites();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete favourite failed');
    }
  };

  const onQuickReorder = async (sourceOrderId: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch('/carts/quick-reorder', { method: 'POST', body: JSON.stringify({ sourceOrderId, serviceDate: quickReorderDate }) }) as { cartId: string; excludedItemIds: string[] };
      setMessage(out.excludedItemIds.length ? `Quick reorder cart ${out.cartId} created with exclusions.` : `Quick reorder cart ${out.cartId} created.`);
      await loadMenuAndDraft();
    } catch (err) { setError(err instanceof Error ? err.message : 'Quick reorder failed'); }
  };

  const onRunMealPlanWizard = async () => {
    const dates = wizardDates.split(',').map((x) => x.trim()).filter(Boolean);
    if (!selectedChildId || !wizardSourceOrderId || dates.length === 0) return setError('Meal plan needs youngster, source order id, and dates.');
    setError(''); setMessage('');
    try {
      const out = await apiFetch('/meal-plans/wizard', { method: 'POST', body: JSON.stringify({ childId: selectedChildId, sourceOrderId: wizardSourceOrderId, dates }) }) as { successCount: number; failureCount: number };
      setMessage(`Meal plan finished. Success: ${out.successCount}, Failures: ${out.failureCount}.`);
      await loadOrders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Meal plan wizard failed'); }
  };

  const onUploadProof = async (billingId: string) => {
    const proof = (billingProof[billingId] || '').trim();
    if (!proof) return setError('Enter proof image URL or data URL first.');
    setError(''); setMessage('');
    try {
      await apiFetch(`/billing/${billingId}/proof-upload`, {
        method: 'POST',
        body: JSON.stringify({ proofImageData: proof }),
      });
      setMessage('Proof uploaded successfully.');
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

  const onStartEditOrder = async (order: ConsolidatedOrder) => {
    setError(''); setMessage(''); setEditingOrderId(order.id);
    const detail = await apiFetch(`/orders/${order.id}`) as { service_date: string; session: 'LUNCH' | 'SNACK' | 'BREAKFAST'; items: Array<{ menu_item_id: string; quantity: number }> };
    setEditServiceDate(detail.service_date); setEditSession(detail.session);
    const existingQty: Record<string, number> = {}; for (const item of detail.items) existingQty[item.menu_item_id] = Number(item.quantity);
    setEditQty(existingQty);
    const data = await apiFetch(`/menus?service_date=${detail.service_date}&session=${detail.session}`) as { items: MenuItem[] };
    setEditMenuItems(data.items);
  };

  const onSaveOrderEdit = async () => {
    if (!editingOrderId) return;
    if (!window.confirm('Confirm update this order before cutoff?')) return;
    const items = Object.entries(editQty).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (items.length === 0) return setError('Select at least one item for updated order.');
    if (editExpired) return setError('ORDER_CUTOFF_EXCEEDED');
    if (items.length > 5) return setError('Maximum 5 items per order.');
    setSubmitting(true); setError(''); setMessage('');
    try {
      await apiFetch(`/orders/${editingOrderId}`, { method: 'PATCH', body: JSON.stringify({ serviceDate: editServiceDate, session: editSession, items }) });
      setMessage('Order updated successfully.'); setEditingOrderId(''); setEditMenuItems([]); setEditQty({});
      await loadOrders();
    } catch (err) { setError(err instanceof Error ? err.message : 'Order update failed'); }
    finally { setSubmitting(false); }
  };

  const onDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Confirm delete this order before cutoff?')) return;
    setError(''); setMessage('');
    try { await apiFetch(`/orders/${orderId}`, { method: 'DELETE' }); setMessage('Order deleted successfully.'); await loadOrders(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Order delete failed'); }
  };

  const onResumeDraft = async () => {
    if (!draftCartId) return;
    setError(''); setMessage(''); setLoadingDraft(true);
    try { await loadDraftItems(draftCartId); setMessage('Draft resumed.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to resume draft'); }
    finally { setLoadingDraft(false); }
  };

  const onDiscardDraft = async () => {
    if (!draftCartId) return;
    if (!window.confirm('Discard this draft cart?')) return;
    setError(''); setMessage('');
    try { await apiFetch(`/carts/${draftCartId}`, { method: 'DELETE' }); setDraftCartId(''); setDraftExpiresAt(''); setItemQty({}); setMessage('Draft discarded.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to discard draft'); }
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Parents Module</h1><p>Loading Step 6/7 data...</p></section></main>;
  }

  return (
    <main className="page-auth page-auth-mobile parents-page">
      <section className="auth-panel">
        <h1>Parents Module (Step 6 + Step 7)</h1>
        <p className="auth-help">Advanced ordering: search/filter, favourites, quick reorder, meal plan wizard.</p>
        {parentId ? <p className="auth-help">Parent Profile ID: {parentId}</p> : null}
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section">
          <h2>Linked Youngsters</h2>
          <p className="auth-help">Youngster registration is done on `/register/youngsters`. Linked youngsters are auto-linked by matching parent and youngster last name.</p>
          <label>Select Youngster<select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}><option value="">Select...</option>{children.map((child) => <option key={child.id} value={child.id}>{child.first_name} {child.last_name} ({child.school_grade})</option>)}</select></label>
        </div>

        <div className="module-section">
          <h2>Session Menu and Cart</h2>
          <label>Service Date<input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(placeCutoffMs)} (08:00 Asia/Makassar)</p>
          {draftCartId ? <p className="auth-help">Draft status: {hasOpenDraft ? 'OPEN' : 'EXPIRED'} | Draft countdown: {formatRemaining(draftRemainingMs)}</p> : <p className="auth-help">Draft status: none</p>}
          <label>Session<select value={session} onChange={(e) => setSession(e.target.value as 'LUNCH' | 'SNACK' | 'BREAKFAST')}><option value="LUNCH">LUNCH</option><option value="SNACK">SNACK</option><option value="BREAKFAST">BREAKFAST</option></select></label>
          <label>Search<input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="keyword" /></label>
          <label>Price Min<input type="number" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} /></label>
          <label>Price Max<input type="number" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} /></label>
          <label>Favourites Only (Optional)<input type="checkbox" checked={favouritesOnly} onChange={(e) => setFavouritesOnly(e.target.checked)} /></label>
          <p className="auth-help">Tick box meaning: show only menu items that exist in your saved favourite combos.</p>
          <button className="btn btn-outline" type="button" onClick={onLoadMenu}>Load Menu</button>
          <button className="btn btn-outline" type="button" onClick={onResumeDraft} disabled={!draftCartId || loadingDraft}>{loadingDraft ? 'Loading Draft...' : 'Resume Draft'}</button>
          <button className="btn btn-outline" type="button" onClick={onDiscardDraft} disabled={!draftCartId || loadingDraft}>Discard Draft</button>

          {menuItems.length > 0 ? (
            <div className="auth-form">
              {menuItems.map((item) => (
                <label key={item.id}>
                  <span><strong>{item.name}</strong> - Rp {Number(item.price).toLocaleString('id-ID')}{item.has_allergen ? ' (Contains allergen)' : ''}</span>
                  <small>{item.description}</small>
                  <small>{item.nutrition_facts_text}</small>
                  <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                  <input type="number" min={0} max={5} value={itemQty[item.id] || 0} onChange={(e) => setItemQty((prev) => ({ ...prev, [item.id]: Number(e.target.value || 0) }))} />
                </label>
              ))}
              <p className="auth-help">Selected items: {selectedCount} / 5</p>
              <label>Favourite Label<input value={favLabel} onChange={(e) => setFavLabel(e.target.value)} placeholder="My combo" /></label>
              <button className="btn btn-primary" type="button" disabled={submitting || placementExpired} onClick={onPlaceOrder}>{submitting ? 'Placing Order...' : 'Place Order'}</button>
              <button className="btn btn-outline" type="button" onClick={onSaveFavourite}>Save Favourite Combo (OPTIONAL)</button>
            </div>
          ) : <p className="auth-help">Load menu to start cart drafting.</p>}
        </div>

        <div className="module-section">
          <h2>Favourite Meal Combos</h2>
          <p className="auth-help">Note: Saves a reusable item set (template).</p>
          <button className="btn btn-outline" type="button" onClick={loadFavourites}>Refresh Favourites</button>
          {favourites.length === 0 ? <p className="auth-help">No favourite combos saved.</p> : (
            <div className="auth-form">
              {favourites.map((fav) => (
                <label key={fav.id}>
                  <strong>{fav.label}</strong>
                  <small>Session: {fav.session}</small>
                  <small>Items: {fav.items.map((i) => `${i.name || i.menu_item_id} x${i.quantity}`).join(', ')}</small>
                  <button className="btn btn-outline" type="button" onClick={() => onApplyFavourite(fav.id)}>Apply Favourite</button>
                  <button className="btn btn-outline" type="button" onClick={() => onDeleteFavourite(fav.id)}>Delete Favourite</button>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="module-section">
          <h2>Consolidated Orders</h2>
          <label>Quick Reorder Target Date<input type="date" value={quickReorderDate} onChange={(e) => setQuickReorderDate(e.target.value)} /></label>
          <button className="btn btn-outline" type="button" onClick={loadOrders} disabled={loadingOrders}>{loadingOrders ? 'Refreshing...' : 'Refresh Orders'}</button>

          {orders.length === 0 ? <p className="auth-help">No orders yet.</p> : (
            <div className="auth-form">
              {orders.map((order) => (
                <label key={order.id}>
                  <span><strong>{order.child_name}</strong> - {order.service_date} {order.session}</span>
                  <small>Order: {order.id}</small>
                  <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                  <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                  <small>Dietary snapshot source: persisted at order creation/update.</small>
                  <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                  {editingOrderId === order.id ? (
                    <>
                      <input type="date" value={editServiceDate} onChange={(e) => setEditServiceDate(e.target.value)} />
                      <small>Edit cutoff countdown: {formatRemaining(editCutoffMs)} (08:00 Asia/Makassar)</small>
                      <select value={editSession} onChange={(e) => setEditSession(e.target.value as 'LUNCH' | 'SNACK' | 'BREAKFAST')}><option value="LUNCH">LUNCH</option><option value="SNACK">SNACK</option><option value="BREAKFAST">BREAKFAST</option></select>
                      {editMenuItems.map((item) => <span key={item.id}>{item.name} (Rp {Number(item.price).toLocaleString('id-ID')})<input type="number" min={0} max={5} value={editQty[item.id] || 0} onChange={(e) => setEditQty((prev) => ({ ...prev, [item.id]: Number(e.target.value || 0) }))} /></span>)}
                      <small>Selected items: {editSelectedCount} / 5</small>
                      <button className="btn btn-primary" type="button" onClick={onSaveOrderEdit} disabled={submitting || editExpired}>{submitting ? 'Saving...' : 'Save Edit'}</button>
                      <button className="btn btn-outline" type="button" onClick={() => { setEditingOrderId(''); setEditMenuItems([]); setEditQty({}); }} disabled={submitting}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-outline" type="button" onClick={() => onStartEditOrder(order)} disabled={!order.can_edit || submitting}>Edit Before Cutoff</button>
                      <button className="btn btn-outline" type="button" onClick={() => onDeleteOrder(order.id)} disabled={!order.can_edit || submitting}>Delete Before Cutoff</button>
                      <button className="btn btn-outline" type="button" onClick={() => onQuickReorder(order.id)}>Quick Reorder</button>
                      {!order.can_edit ? <small>Cutoff passed or order status is not editable.</small> : null}
                    </>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="module-section">
          <h2>Meal Plan Wizard</h2>
          <p className="auth-help">Note: Copies one existing order to multiple target dates in one run.</p>
          <label>Source Order ID<input value={wizardSourceOrderId} onChange={(e) => setWizardSourceOrderId(e.target.value)} placeholder="order uuid" /></label>
          <label>Target Dates (comma separated YYYY-MM-DD)<input value={wizardDates} onChange={(e) => setWizardDates(e.target.value)} placeholder="2026-03-02,2026-03-03" /></label>
          <button className="btn btn-outline" type="button" onClick={onRunMealPlanWizard}>Run Meal Plan Wizard</button>
        </div>

        <div className="module-section">
          <h2>Consolidated Billing</h2>
          <button className="btn btn-outline" type="button" onClick={loadBilling}>Refresh Billing</button>
          {billings.length === 0 ? <p className="auth-help">No billing records.</p> : (
            <div className="auth-form">
              {billings.map((b) => (
                <label key={b.id}>
                  <strong>{b.service_date} {b.session}</strong>
                  <small>Order: {b.order_id}</small>
                  <small>Status: {b.status} | Delivery: {b.delivery_status}</small>
                  <small>Total: Rp {Number(b.total_price).toLocaleString('id-ID')}</small>
                  <small>Receipt: {b.receipt_number || '-'}</small>
                  <input
                    value={billingProof[b.id] || ''}
                    onChange={(e) => setBillingProof((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    placeholder="proof image URL or data URL"
                  />
                  <button className="btn btn-outline" type="button" onClick={() => onUploadProof(b.id)}>
                    Upload Proof
                  </button>
                  <button className="btn btn-outline" type="button" onClick={() => onOpenReceipt(b.id)}>
                    Open Receipt
                  </button>
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
              {(spending.byChild || []).map((row) => (
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
