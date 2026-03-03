'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../../lib/dish-tags';
import LogoutButton from '../../_components/logout-button';

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
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  is_dairy_free?: boolean;
  contains_peanut?: boolean;
  dish_category?: string;
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
type BlackoutDay = {
  blackout_date: string;
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason?: string | null;
};
type ActiveBlackout = {
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason: string | null;
};
type DraftSourceContext = {
  mode: 'edit' | 'quick-reorder';
  orderId: string;
  childId: string;
  childName: string;
  sourceServiceDate: string;
  targetServiceDate: string;
  session: SessionType;
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
function getMakassarDateWithOffset(offset: number): string {
  const today = todayMakassarIsoDate();
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function getMakassarOrderingWindow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const yyyy = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const mm = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const dd = Number(parts.find((p) => p.type === 'day')?.value || '01');
  const hh = Number(parts.find((p) => p.type === 'hour')?.value || '00');
  const today = new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
  return {
    nowHour: hh,
    today,
    earliestServiceDate: nextWeekdayIsoDate(),
    canOrderNow: hh >= 8,
  };
}
function mapOrderRuleError(raw: string) {
  if (raw.includes('ORDER_BLACKOUT_BLOCKED')) return 'Ordering is blocked for this date (ORDER_BLOCK/BOTH blackout).';
  if (raw.includes('ORDER_SERVICE_BLOCKED')) return 'Service is blocked for this date (SERVICE_BLOCK/BOTH blackout).';
  if (raw.includes('ORDER_TOMORROW_ONWARDS_ONLY')) return 'Orders can only be placed for tomorrow onward.';
  if (raw.includes('ORDERING_AVAILABLE_FROM_0800_WITA')) return 'Ordering opens daily at 08:00 Asia/Makassar.';
  return raw;
}
function activeBlackoutMessage(blackout: ActiveBlackout | null) {
  if (!blackout) return '';
  if (blackout.type === 'SERVICE_BLOCK') return mapOrderRuleError('ORDER_SERVICE_BLOCKED');
  return mapOrderRuleError('ORDER_BLACKOUT_BLOCKED');
}

export default function ParentsOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [children, setChildren] = useState<Child[]>([]);
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
  const [activeBlackout, setActiveBlackout] = useState<ActiveBlackout | null>(null);
  const [draftSourceContext, setDraftSourceContext] = useState<DraftSourceContext | null>(null);
  const [confirmedViewOffset, setConfirmedViewOffset] = useState(0);

  const draftSectionRef = useRef<HTMLDivElement | null>(null);

  const selectedCount = useMemo(() => Object.values(itemQty).filter((qty) => qty > 0).length, [itemQty]);
  const orderingWindow = useMemo(() => getMakassarOrderingWindow(), [nowMs]);
  const placeCutoffMs = getCutoffTimestamp(serviceDate) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = placeCutoffMs <= 0;
  const placementBlockedByWindow = !orderingWindow.canOrderNow || serviceDate <= orderingWindow.today;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;
  const placementBlockedByBlackout = Boolean(activeBlackout);

  const visibleOrders = useMemo(
    () => (selectedChildId ? orders.filter((o) => o.child_id === selectedChildId) : orders),
    [orders, selectedChildId],
  );
  const confirmedViewDate = useMemo(
    () => getMakassarDateWithOffset(confirmedViewOffset),
    [confirmedViewOffset],
  );
  const confirmedOrders = useMemo(
    () => visibleOrders.filter((o) => o.service_date === confirmedViewDate && o.status === 'PLACED'),
    [visibleOrders, confirmedViewDate],
  );
  const sortedVisibleOrders = useMemo(
    () => [...visibleOrders].sort((a, b) => String(a.service_date).localeCompare(String(b.service_date))),
    [visibleOrders],
  );
  const selectedDayOrder = useMemo(
    () => visibleOrders.find((o) => o.service_date === serviceDate && o.session === session && o.status === 'PLACED') || null,
    [visibleOrders, serviceDate, session],
  );
  const activeSessions = useMemo(
    () => SESSION_ORDER.filter((s) => sessionSettings.find((x) => x.session === s)?.is_active),
    [sessionSettings],
  );
  const draftItems = useMemo(() => {
    const index = new Map(menuItems.map((m) => [m.id, m]));
    return Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ menuItem: index.get(id), id, qty }))
      .filter((x) => Boolean(x.menuItem));
  }, [itemQty, menuItems]);

  useEffect(() => {
    if (activeSessions.length === 0) return;
    if (!activeSessions.includes(session)) setSession(activeSessions[0]);
  }, [activeSessions, session]);

  const loadOrders = async () => {
    setLoadingOrders(true);
    try {
      const data = await apiFetch('/parents/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
      setOrders(data.orders || []);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadSessionSettings = async () => {
    const settings = await apiFetch('/session-settings') as SessionSetting[];
    if (!Array.isArray(settings) || settings.length === 0) return;
    setSessionSettings(settings);
  };

  const loadBaseData = async () => {
    const childrenData = await apiFetch('/parents/me/children/pages') as { parentId: string; children: Child[] };
    setChildren(childrenData.children);
    if (childrenData.children.length > 0) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadOrders(), loadSessionSettings()]);
  };

  useEffect(() => {
    loadBaseData().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading data')).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

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

  const resetDraftState = () => {
    setDraftCartId('');
    setDraftExpiresAt('');
    setItemQty({});
  };

  const clearOpenDraftsForContext = async (childId: string, draftDate: string, draftSession: SessionType) => {
    const carts = await apiFetch(
      `/carts?child_id=${childId}&service_date=${draftDate}&session=${draftSession}`,
    ) as DraftCart[];
    const openCarts = (carts || []).filter((cart) => cart.status === 'OPEN');
    if (openCarts.length === 0) return;
    await Promise.all(openCarts.map((cart) => apiFetch(`/carts/${cart.id}`, { method: 'DELETE' })));
  };

  const loadMenuAndDraft = async () => {
    if (!selectedChildId) return;
    const [menuData, cartsData, blackoutRows] = await Promise.all([
      apiFetch(`/menus?session=${session}`) as Promise<{ items: MenuItem[] }>,
      apiFetch(`/carts?child_id=${selectedChildId}&service_date=${serviceDate}&session=${session}`) as Promise<DraftCart[]>,
      apiFetch(`/blackout-days?from_date=${serviceDate}&to_date=${serviceDate}`) as Promise<BlackoutDay[]>,
    ]);
    setMenuItems(menuData.items || []);
    const currentDay = (blackoutRows || []).find((row) => row.blackout_date === serviceDate);
    if (currentDay && ['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(currentDay.type)) {
      setActiveBlackout({ type: currentDay.type, reason: (currentDay.reason || '').trim() || null });
    } else {
      setActiveBlackout(null);
    }
    const openDraft = (cartsData || []).find((cart) => cart.status === 'OPEN');
    if (!openDraft) { setDraftCartId(''); setDraftExpiresAt(''); setItemQty({}); return; }
    await loadDraftItems(openDraft.id);
  };

  useEffect(() => {
    loadMenuAndDraft().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading menu'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, serviceDate, session]);

  const onAddDraftItem = (menuItemId: string) => {
    const alreadySelected = Object.values(itemQty).filter((qty) => qty > 0).length;
    if (!itemQty[menuItemId] && alreadySelected >= 5) { setError('Maximum 5 items per cart/order.'); return; }
    setError('');
    setItemQty((prev) => ({ ...prev, [menuItemId]: Math.max(1, prev[menuItemId] || 0) }));
  };
  const onRemoveDraftItem = (menuItemId: string) => {
    setItemQty((prev) => ({ ...prev, [menuItemId]: 0 }));
  };

  const onPlaceOrder = async () => {
    if (!selectedChildId) return setError('Please select a youngster first.');
    const items = Object.entries(itemQty).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (items.length === 0) return setError('Select at least one menu item.');
    if (placementBlockedByBlackout) return setError(activeBlackoutMessage(activeBlackout));
    if (!orderingWindow.canOrderNow) return setError('Ordering opens daily at 08:00 Asia/Makassar.');
    if (serviceDate <= orderingWindow.today) return setError('Orders can only be placed for tomorrow onward.');
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
      setItemQty({}); setDraftCartId(''); setDraftExpiresAt(''); setDraftSourceContext(null);
      await loadOrders();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order placement failed';
      if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH') {
        window.alert('Only Lunch Available');
        setError('Only Lunch Available');
      } else {
        setError(mapOrderRuleError(msg));
      }
    } finally { setSubmitting(false); }
  };

  const onOpenOrderAsDraft = async (order: ConsolidatedOrder, targetDate: string, mode: 'edit' | 'quick-reorder') => {
    setError(''); setMessage('');
    try {
      setSelectedChildId(order.child_id);
      setServiceDate(targetDate);
      const nextSession = activeSessions.includes(order.session) ? order.session : (activeSessions[0] || 'LUNCH');
      setSession(nextSession);
      setDraftSourceContext({
        mode, orderId: order.id, childId: order.child_id, childName: order.child_name,
        sourceServiceDate: order.service_date, targetServiceDate: targetDate, session: nextSession,
      });
      const menuData = await apiFetch(`/menus?session=${nextSession}`) as { items: MenuItem[] };
      setMenuItems(menuData.items || []);
      if (mode === 'edit') {
        await clearOpenDraftsForContext(order.child_id, targetDate, nextSession);
        resetDraftState();
        setMessage(`Edit mode ready for ${targetDate} ${nextSession}. Draft cart is empty by design.`);
      } else {
        const out = await apiFetch('/carts/quick-reorder', {
          method: 'POST',
          body: JSON.stringify({ sourceOrderId: order.id, serviceDate: targetDate }),
        }) as { cartId: string; excludedItemIds: string[] };
        await loadDraftItems(out.cartId);
        setMessage(out.excludedItemIds.length
          ? `Quick reorder loaded with ${out.excludedItemIds.length} excluded dish(es).`
          : 'Quick reorder loaded with existing dishes in Draft Section.');
      }
      window.setTimeout(() => draftSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (err) {
      setError(err instanceof Error ? mapOrderRuleError(err.message) : 'Failed to reopen order as draft');
    }
  };

  const onDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Confirm delete this order before cutoff?')) return;
    setError(''); setMessage('');
    try {
      await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
      setMessage('Order deleted successfully.');
      await loadOrders();
    } catch (err) { setError(err instanceof Error ? mapOrderRuleError(err.message) : 'Order delete failed'); }
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
          <Link href="/parents/orders" className="active">Order</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/rating">Rating</Link>
          <Link href="/parents/billing">Billing</Link>
        </nav>
        <div className="module-guide-card">
          💡 View confirmed orders, manage your cart, and place orders.
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {children.length > 1 && (
          <div className="module-section">
            <label>Youngster
              <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                {children.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.school_grade})</option>)}
              </select>
            </label>
          </div>
        )}

        <div className="module-section" id="parent-order">
          <h2>Confirmed Orders</h2>
          <div className="day-toggle-row" role="group" aria-label="View date">
            <button type="button" className={confirmedViewOffset === -1 ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewOffset(-1)}>Yesterday</button>
            <button type="button" className={confirmedViewOffset === 0 ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewOffset(0)}>Today</button>
            <button type="button" className={confirmedViewOffset === 1 ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewOffset(1)}>Tomorrow</button>
          </div>
          {confirmedOrders.length > 0 ? (
            <div className="auth-form">
              {confirmedOrders.map((order) => (
                <label key={order.id}>
                  <strong>{order.child_name} - {order.service_date} {order.session}</strong>
                  <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                  <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                  <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                </label>
              ))}
            </div>
          ) : <p className="auth-help">No confirmed order for {confirmedViewOffset === -1 ? 'yesterday' : confirmedViewOffset === 1 ? 'tomorrow' : 'today'}.</p>}
        </div>

        <div className="module-section">
          <h2>Consolidated Orders</h2>
          <label>Quick Reorder Target Date<input type="date" value={quickReorderDate} min={orderingWindow.earliestServiceDate} onChange={(e) => setQuickReorderDate(e.target.value)} /></label>
          <button className="btn btn-outline" type="button" onClick={loadOrders} disabled={loadingOrders}>{loadingOrders ? 'Refreshing...' : 'Refresh Orders'}</button>
          {sortedVisibleOrders.length === 0 ? <p className="auth-help">No orders yet for selected youngster.</p> : (
            <div className="auth-form">
              {sortedVisibleOrders.map((order) => (
                <div key={order.id} className="order-row-card">
                  <span><strong>{order.child_name}</strong> - {order.service_date} {order.session}</span>
                  <small>Order: {order.id}</small>
                  <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                  <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                  <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                  <div className="order-row-actions">
                    <button className="btn btn-outline" type="button" onClick={() => onOpenOrderAsDraft(order, order.service_date, 'edit')} disabled={!order.can_edit || submitting}>Edit Before Cutoff</button>
                    <button className="btn btn-outline" type="button" onClick={() => onDeleteOrder(order.id)} disabled={!order.can_edit || submitting}>Delete Before Cutoff</button>
                    <button className="btn btn-outline" type="button" onClick={() => onOpenOrderAsDraft(order, quickReorderDate, 'quick-reorder')} disabled={submitting}>Quick Reorder</button>
                  </div>
                  {!order.can_edit ? <small>Cutoff passed or order status is not editable.</small> : null}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="module-section">
          <h2>Menu and Cart</h2>
          {draftSourceContext
            && selectedChildId === draftSourceContext.childId
            && serviceDate === draftSourceContext.targetServiceDate
            && session === draftSourceContext.session ? (
              <p className="auth-help">
                {draftSourceContext.mode === 'edit' ? 'Editing order from' : 'Quick reorder from'}: #{draftSourceContext.orderId}
                {' | '}Youngster: {draftSourceContext.childName}
                {' | '}Source date: {draftSourceContext.sourceServiceDate}
                {' | '}Draft date: {draftSourceContext.targetServiceDate}
                {' | '}Session: {draftSourceContext.session}
              </p>
            ) : null}
          <label>Service Date<input type="date" value={serviceDate} min={orderingWindow.earliestServiceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
              {activeSessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(placeCutoffMs)} (08:00 Asia/Makassar)</p>
          {!orderingWindow.canOrderNow ? <p className="auth-help">Ordering opens at 08:00 Asia/Makassar.</p> : null}
          {serviceDate <= orderingWindow.today ? <p className="auth-help">Select tomorrow or a later date to place an order.</p> : null}
          {activeBlackout ? (
            <p className="auth-error">
              Blackout active on {serviceDate}: {activeBlackout.type}{activeBlackout.reason ? ` - ${activeBlackout.reason}` : ''}.
            </p>
          ) : null}
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
                      <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                      <small>Dietary: {formatDishDietaryTags(item)}</small>
                      <small>{item.description}</small>
                      <small>{item.nutrition_facts_text}</small>
                      <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                      <button className="btn btn-outline" type="button" onClick={() => onAddDraftItem(item.id)} disabled={placementBlockedByBlackout}>Add</button>
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
                        <small>Category: {d.menuItem ? formatDishCategoryLabel(d.menuItem.dish_category) : '-'}</small>
                        <small>Dietary: {d.menuItem ? formatDishDietaryTags(d.menuItem) : '-'}</small>
                        <small>{d.menuItem?.description}</small>
                        <input type="number" min={0} max={5} value={d.qty} onChange={(e) => setItemQty((prev) => ({ ...prev, [d.id]: Number(e.target.value || 0) }))} />
                        <button className="btn btn-outline" type="button" onClick={() => onRemoveDraftItem(d.id)}>Remove</button>
                      </label>
                    ))}
                  </div>
                )}
                <div className="draft-actions">
                  <p className="auth-help">Selected items: {selectedCount} / 5</p>
                  <button className="btn btn-primary" type="button" disabled={submitting || placementExpired || placementBlockedByBlackout || placementBlockedByWindow} onClick={onPlaceOrder}>
                    {submitting ? 'Placing Order...' : 'Place Order'}
                  </button>
                </div>
              </div>
            </div>
          ) : <p className="auth-help">No active dishes configured by Admin for this date/session.</p>}
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
        .day-toggle-row {
          display: flex;
          gap: 0.4rem;
          margin-bottom: 0.65rem;
        }
        .day-btn {
          flex: 1;
          padding: 0.38rem 0.5rem;
          border: 1px solid #ccbda2;
          border-radius: 0.45rem;
          background: #fff;
          color: #5d4e3a;
          font: inherit;
          font-size: 0.82rem;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s;
        }
        .day-btn:hover {
          background: #fff8ec;
          border-color: #b8860b;
        }
        .day-btn-active {
          background: #fff3d6;
          border-color: #9a6c1f;
          color: #6b4a10;
          font-weight: 600;
        }
      `}</style>
    </main>
    <LogoutButton />
    </>
  );
}
