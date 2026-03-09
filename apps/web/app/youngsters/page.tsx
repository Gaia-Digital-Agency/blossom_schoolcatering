'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../lib/dish-tags';
import LogoutButton from '../_components/logout-button';

type Youngster = {
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
type DraftCart = {
  id: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  expires_at: string;
};
type YoungsterInsights = {
  week: {
    start: string;
    end: string;
    totalCalories: number;
    totalOrders?: number;
    totalDishes?: number;
    days: Array<{ service_date: string; calories_display: string; tba_items: number }>;
  };
  badge: {
    level: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
    maxConsecutiveOrderDays: number;
    maxConsecutiveOrderWeeks?: number;
    currentMonthOrders: number;
  };
  birthdayHighlight: { date_of_birth: string; days_until: number };
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
  items: Array<{
    menu_item_id: string;
    item_name_snapshot: string;
    price_snapshot: number;
    quantity: number;
  }>;
};
type BlackoutDay = {
  blackout_date: string;
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason?: string | null;
};
type ActiveBlackout = {
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason: string | null;
};

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

function nextWeekdayIsoDate() {
  const today = todayMakassarIsoDate();
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
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

export default function YoungstersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [youngster, setYoungster] = useState<Youngster | null>(null);
  const [serviceDate, setServiceDate] = useState(nextWeekdayIsoDate());
  const [session, setSession] = useState<SessionType>('LUNCH');
  const [sessionSettings, setSessionSettings] = useState<SessionSetting[]>([{ session: 'LUNCH', is_active: true }]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [insights, setInsights] = useState<YoungsterInsights | null>(null);
  const [orders, setOrders] = useState<ConsolidatedOrder[]>([]);
  const [activeBlackout, setActiveBlackout] = useState<ActiveBlackout | null>(null);
  const [confirmedViewDate, setConfirmedViewDate] = useState(() => getMakassarDateWithOffset(0));

  // Popups
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);

  const selectedCount = useMemo(
    () => Object.values(itemQty).filter((qty) => qty > 0).length,
    [itemQty],
  );
  const draftItems = useMemo(() => {
    const index = new Map(menuItems.map((m) => [m.id, m]));
    return Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ menuItem: index.get(id), id, qty }))
      .filter((x) => Boolean(x.menuItem));
  }, [itemQty, menuItems]);
  const orderingWindow = useMemo(() => getMakassarOrderingWindow(), [nowMs]);
  const cutoffRemainingMs = getCutoffTimestamp(serviceDate) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = cutoffRemainingMs <= 0;
  const placementBlockedByWindow = !orderingWindow.canOrderNow || serviceDate <= orderingWindow.today;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;
  const placementBlockedByBlackout = Boolean(activeBlackout);

  // Dates for confirmed order buttons
  const yesterdayDate = getMakassarDateWithOffset(-1);
  const todayDate = getMakassarDateWithOffset(0);
  const nextServiceDate = nextWeekdayIsoDate();

  const confirmedOrders = useMemo(
    () => orders.filter((o) => o.service_date === confirmedViewDate && (o.status === 'PLACED' || o.status === 'LOCKED')),
    [orders, confirmedViewDate],
  );

  const selectedDayOrder = useMemo(
    () => orders.find((o) => o.service_date === serviceDate && o.session === session && o.status === 'PLACED') || null,
    [orders, serviceDate, session],
  );
  const activeSessions = useMemo(
    () => SESSION_ORDER.filter((s) => sessionSettings.find((x) => x.session === s)?.is_active),
    [sessionSettings],
  );

  const loadOrders = async () => {
    const data = await apiFetch('/youngsters/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
    setOrders(data.orders || []);
  };

  useEffect(() => {
    apiFetch('/children/me')
      .then((data) => setYoungster(data as Youngster))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed loading youngster profile'))
      .finally(() => setLoading(false));
    apiFetch('/youngsters/me/insights')
      .then((data) => setInsights(data as YoungsterInsights))
      .catch(() => undefined);
    apiFetch('/session-settings')
      .then((data) => {
        const settings = data as SessionSetting[];
        if (Array.isArray(settings) && settings.length > 0) setSessionSettings(settings);
      })
      .catch(() => undefined);
    loadOrders().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeSessions.length === 0) return;
    if (!activeSessions.includes(session)) {
      setSession(activeSessions[0]);
    }
  }, [activeSessions, session]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Auto-show blackout modal when blackout is detected
  useEffect(() => {
    if (activeBlackout) setShowBlackoutModal(true);
  }, [activeBlackout]);

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
      status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
      items: Array<{ menu_item_id: string; quantity: number }>;
    };
    const qtyByItem: Record<string, number> = {};
    for (const item of detail.items) {
      qtyByItem[item.menu_item_id] = Number(item.quantity);
    }
    setItemQty(qtyByItem);
    setDraftCartId(detail.id);
    setDraftExpiresAt(detail.expires_at);
  };

  const loadMenuAndDraft = async (childId: string) => {
    const [menuData, cartsData, blackoutRows] = await Promise.all([
      apiFetch(`/menus?session=${session}`) as Promise<{ items: MenuItem[] }>,
      apiFetch(`/carts?child_id=${childId}&service_date=${serviceDate}&session=${session}`) as Promise<DraftCart[]>,
      apiFetch(`/blackout-days?from_date=${serviceDate}&to_date=${serviceDate}`) as Promise<BlackoutDay[]>,
    ]);
    setMenuItems(menuData.items || []);
    const currentDay = (blackoutRows || []).find((row) => row.blackout_date === serviceDate);
    if (currentDay && ['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(currentDay.type)) {
      setActiveBlackout({
        type: currentDay.type,
        reason: (currentDay.reason || '').trim() || null,
      });
    } else {
      setActiveBlackout(null);
    }
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
    if (!youngster?.id) return;
    loadMenuAndDraft(youngster.id).catch((err) => setError(err instanceof Error ? err.message : 'Failed loading draft'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youngster?.id, serviceDate, session]);

  const onPlaceOrder = async () => {
    if (!youngster) {
      setError('Youngster profile is missing.');
      return;
    }

    // Duplicate order check
    if (selectedDayOrder) {
      setShowDuplicatePopup(true);
      return;
    }

    const items = Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    if (items.length === 0) {
      setError('Select at least one menu item.');
      return;
    }
    if (placementBlockedByBlackout) {
      setError('');
      setShowBlackoutModal(true);
      return;
    }
    if (!orderingWindow.canOrderNow) {
      setError('Ordering opens daily at 08:00 Asia/Makassar.');
      return;
    }
    if (serviceDate <= orderingWindow.today) {
      setError('Orders can only be placed for tomorrow onward.');
      return;
    }
    if (placementExpired) {
      setError('ORDER_CUTOFF_EXCEEDED');
      return;
    }
    if (items.length > 5) {
      setError('Maximum 5 items per cart/order.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      // Reuse existing open draft cart if available, else create new
      let cartId: string;
      if (draftCartId && draftRemainingMs > 0) {
        cartId = draftCartId;
      } else {
        const cartRes = await apiFetch('/carts', {
          method: 'POST',
          body: JSON.stringify({ childId: youngster.id, serviceDate, session }),
        }) as { id?: string };
        if (!cartRes?.id) throw new Error('Cart creation failed — no cart ID returned.');
        cartId = cartRes.id;
      }

      await apiFetch(`/carts/${cartId}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      });

      await apiFetch(`/carts/${cartId}/submit`, {
        method: 'POST',
      }) as { id: string; total_price: number };

      await loadOrders();
      setItemQty({});
      setDraftCartId('');
      setDraftExpiresAt('');
      setConfirmedViewDate(serviceDate);
      setShowSuccessPopup(true);
      apiFetch('/youngsters/me/insights').then((x) => setInsights(x as YoungsterInsights)).catch(() => undefined);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order placement failed';
      if (msg.includes('ORDER_SESSION_DISABLED') && session !== 'LUNCH') {
        window.alert('Only Lunch Available');
        setError('Only Lunch Available');
      } else {
        setError(mapOrderRuleError(msg));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="page-auth">
        <section className="auth-panel">
          <h1>Youngsters Module</h1>
          <p>Loading Step 6 data...</p>
        </section>
      </main>
    );
  }

  return (
    <>
    <main className="page-auth page-auth-mobile youngsters-page">
      <section className="auth-panel">
        <h1>Youngsters Module</h1>
        <nav className="module-nav" aria-label="Youngster Module Navigation">
          <Link href="/">Home</Link>
          <a href="#youngster-order">Order</a>
          <Link href="/menu">Menu</Link>
          <Link href="/rating">Rating</Link>
        </nav>
        <div className="module-guide-card">
          💡 Select Dish and Confirm Meal.
        </div>
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section" id="youngster-order">
          <h2>Confirmed Orders</h2>
          <div className="day-toggle-row" role="group" aria-label="View date">
            <button type="button" className={confirmedViewDate === yesterdayDate ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewDate(yesterdayDate)}>Yesterday</button>
            <button type="button" className={confirmedViewDate === todayDate ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewDate(todayDate)}>Today</button>
            <button type="button" className={confirmedViewDate === nextServiceDate ? 'day-btn day-btn-active' : 'day-btn'} onClick={() => setConfirmedViewDate(nextServiceDate)}>Tomorrow</button>
          </div>
          {confirmedOrders.length > 0 ? (
            <div className="auth-form">
              {confirmedOrders.map((order) => (
                <label key={order.id}>
                  <strong>{order.service_date} {order.session}</strong>
                  <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                  <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                  <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                </label>
              ))}
            </div>
          ) : <p className="auth-help">No confirmed order for {confirmedViewDate}.</p>}
        </div>

        <div className="module-section">
          <h2>Weekly Nutrition + Badge</h2>
          {insights ? (
            <div className="auth-form">
              <label>
                <strong>Clean Plate Club Badge: {insights.badge.level}</strong>
                <small>Max consecutive order days: {insights.badge.maxConsecutiveOrderDays}</small>
                <small>Max consecutive order weeks: {insights.badge.maxConsecutiveOrderWeeks ?? '-'}</small>
                <small>Current month orders: {insights.badge.currentMonthOrders}</small>
                <small>Birthday in {insights.birthdayHighlight.days_until} day(s)</small>
              </label>
              <label>
                <strong>Current Week ({insights.week.start} to {insights.week.end})</strong>
                <small>Total Calories: {insights.week.totalCalories}</small>
                <small>Total Orders: {insights.week.totalOrders ?? '-'}</small>
                <small>Total Dishes: {insights.week.totalDishes ?? '-'}</small>
                <small>
                  Daily: {insights.week.days.map((d) => `${d.service_date}: ${d.calories_display}`).join(' | ') || '-'}
                </small>
              </label>
            </div>
          ) : <p className="auth-help">Insights loading...</p>}
        </div>

        <div className="module-section">
          <h2>Menu and Cart</h2>
          <label>Service Date<input type="date" value={serviceDate} min={orderingWindow.earliestServiceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
              {activeSessions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(cutoffRemainingMs)} (08:00 Asia/Makassar)</p>
          {!orderingWindow.canOrderNow ? <p className="auth-help">Ordering opens at 08:00 Asia/Makassar.</p> : null}
          {serviceDate <= orderingWindow.today ? <p className="auth-help">Select tomorrow or a later date to place an order.</p> : null}
          {draftCartId && hasOpenDraft ? <p className="auth-help">Open draft detected and loaded automatically.</p> : null}

          {menuItems.length > 0 ? (
            <div className="menu-flow-grid">
              <div className="menu-search-section">
                <h3>Menu Section</h3>
                {menuItems.length === 0 ? <p className="auth-help">No dishes found.</p> : (
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
                )}
              </div>
              <div className="menu-draft-section">
                <h3>Draft Section</h3>
                {draftItems.length === 0 ? <p className="auth-help">No dishes in draft. Use Add from Menu Section.</p> : (
                  <div className="auth-form">
                    {draftItems.map((d) => (
                      <label key={d.id}>
                        <span><strong>{d.menuItem?.name}</strong> - Rp {Number(d.menuItem?.price || 0).toLocaleString('id-ID')}</span>
                        <small>Category: {d.menuItem ? formatDishCategoryLabel(d.menuItem.dish_category) : '-'}</small>
                        <small>Dietary: {d.menuItem ? formatDishDietaryTags(d.menuItem) : '-'}</small>
                        <small>{d.menuItem?.description}</small>
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
          ) : (
            <p className="auth-help">No active dishes configured by Admin for this date/session.</p>
          )}
        </div>
      </section>

      {/* ── Blackout Popup ── */}
      {showBlackoutModal && activeBlackout ? (
        <div className="popup-overlay" onClick={() => setShowBlackoutModal(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">🚫</div>
            <h3 className="popup-title">Date Blocked</h3>
            <p className="popup-body">
              {activeBlackout.type === 'SERVICE_BLOCK'
                ? 'Service is blocked'
                : 'Ordering is blocked'} on {serviceDate}{activeBlackout.reason ? `: ${activeBlackout.reason}` : ''}.
            </p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowBlackoutModal(false)}>OK</button>
          </div>
        </div>
      ) : null}

      {/* ── Success Popup ── */}
      {showSuccessPopup ? (
        <div className="popup-overlay" onClick={() => setShowSuccessPopup(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">✅</div>
            <h3 className="popup-title">Changes, Saved and Successful</h3>
            <p className="popup-body">Your order has been placed successfully.</p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowSuccessPopup(false)}>OK</button>
          </div>
        </div>
      ) : null}

      {/* ── Duplicate Order Popup ── */}
      {showDuplicatePopup ? (
        <div className="popup-overlay" onClick={() => setShowDuplicatePopup(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">⚠️</div>
            <h3 className="popup-title">Order Exist For Selected Date</h3>
            <p className="popup-body">An order already exists for this date and session. Please choose a different date or session.</p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowDuplicatePopup(false)}>OK</button>
          </div>
        </div>
      ) : null}

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
          white-space: nowrap;
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
        /* ── Popups ── */
        .popup-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.48);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .popup-card {
          background: #fff;
          border-radius: 1rem;
          padding: 1.75rem 1.6rem;
          max-width: 360px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          text-align: center;
        }
        .popup-icon {
          font-size: 2.4rem;
          line-height: 1;
        }
        .popup-title {
          margin: 0;
          font-size: 1.05rem;
          font-weight: 700;
          color: #2d2d2d;
        }
        .popup-body {
          margin: 0;
          font-size: 0.9rem;
          color: #555;
        }
        .popup-close {
          width: 100%;
          margin-top: 0.25rem;
        }
      `}</style>
    </main>
    <LogoutButton />
    </>
  );
}
