'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../../lib/dish-tags';
import DraftExitGuard from '../../_components/draft-exit-guard';
import LogoutButton from '../../_components/logout-button';
import SessionBadge from '../../_components/session-badge';
import { getSessionCardStyle, getSessionLabel } from '../../../lib/session-theme';

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
  session?: SessionType | null;
  reason?: string | null;
};
type ActiveBlackout = {
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason: string | null;
  session?: SessionType | null;
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

function getCutoffTimestamp(serviceDate: string, cutoffTime = '08:00') {
  return new Date(`${serviceDate}T${cutoffTime}:00+08:00`).getTime();
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

function formatCutoffLabel(cutoffTime: string) {
  return `${cutoffTime} Asia/Makassar`;
}

function getMakassarOrderingWindow(cutoffTime = '08:00') {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Makassar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const yyyy = Number(parts.find((p) => p.type === 'year')?.value || '1970');
  const mm = Number(parts.find((p) => p.type === 'month')?.value || '01');
  const dd = Number(parts.find((p) => p.type === 'day')?.value || '01');
  const hh = Number(parts.find((p) => p.type === 'hour')?.value || '00');
  const min = Number(parts.find((p) => p.type === 'minute')?.value || '00');
  const today = new Date(Date.UTC(yyyy, mm - 1, dd)).toISOString().slice(0, 10);
  return {
    nowHour: hh,
    today,
    earliestServiceDate: nextWeekdayIsoDate(),
    canOrderNow: (hh * 60) + min >= Number(cutoffTime.slice(0, 2)) * 60 + Number(cutoffTime.slice(3, 5)),
  };
}

function mapOrderRuleError(raw: string, cutoffTime = '08:00') {
  if (raw.includes('ORDER_BLACKOUT_BLOCKED')) return 'Ordering is blocked for this date (ORDER_BLOCK/BOTH blackout).';
  if (raw.includes('ORDER_SERVICE_BLOCKED')) return 'Service is blocked for this date (SERVICE_BLOCK/BOTH blackout).';
  if (raw.includes('ORDER_TOMORROW_ONWARDS_ONLY')) return 'Orders can only be placed for tomorrow onward.';
  if (raw.includes('ORDERING_AVAILABLE_FROM_')) return `Ordering opens daily at ${formatCutoffLabel(cutoffTime)}.`;
  return raw;
}

function resolveBlackoutForSession(rows: BlackoutDay[], serviceDate: string, session: SessionType) {
  return rows.find((row) => row.blackout_date === serviceDate && row.session === session)
    || rows.find((row) => row.blackout_date === serviceDate && !row.session)
    || null;
}

function getSelectedMenuCardStyle(session: SessionType, isSelected: boolean) {
  return {
    ...getSessionCardStyle(session),
    ...(isSelected
      ? {
          borderColor: '#2f6f3e',
          background: 'linear-gradient(180deg, #eefbe8 0%, #dcf4d3 100%)',
          boxShadow: '0 0 0 2px rgba(47, 111, 62, 0.16)',
        }
      : {}),
  };
}

export default function StudentOrderPage({
  mode = 'order',
}: {
  mode?: 'order' | 'record';
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [youngster, setYoungster] = useState<Youngster | null>(null);
  const [serviceDate, setServiceDate] = useState(nextWeekdayIsoDate());
  const [session, setSession] = useState<SessionType>('LUNCH');
  const [sessionSettings, setSessionSettings] = useState<SessionSetting[]>([{ session: 'LUNCH', is_active: true }]);
  const [orderingCutoffTime, setOrderingCutoffTime] = useState('08:00');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [orders, setOrders] = useState<ConsolidatedOrder[]>([]);
  const [activeBlackout, setActiveBlackout] = useState<ActiveBlackout | null>(null);
  const [confirmedViewDate, setConfirmedViewDate] = useState(() => getMakassarDateWithOffset(0));
  const [confirmedDateInput, setConfirmedDateInput] = useState(() => getMakassarDateWithOffset(0));

  // Popups
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);
  const blackoutFirstRenderRef = useRef(true);

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
  const hasDraftChanges = draftItems.length > 0;
  const orderingWindow = useMemo(() => getMakassarOrderingWindow(orderingCutoffTime), [nowMs, orderingCutoffTime]);
  const cutoffRemainingMs = getCutoffTimestamp(serviceDate, orderingCutoffTime) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = cutoffRemainingMs <= 0;
  const placementBlockedByWindow = !orderingWindow.canOrderNow || serviceDate <= orderingWindow.today;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;
  const placementBlockedByBlackout = Boolean(activeBlackout);

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
    const data = await apiFetch('/youngster/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
    setOrders(data.orders || []);
  };

  useEffect(() => {
    apiFetch('/children/me')
      .then((data) => setYoungster(data as Youngster))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed loading student profile'))
      .finally(() => setLoading(false));
    apiFetch('/session-settings')
      .then((data) => {
        const settings = data as SessionSetting[];
        if (Array.isArray(settings) && settings.length > 0) setSessionSettings(settings);
      })
      .catch(() => undefined);
    fetch('/schoolcatering/api/v1/public/site-settings', { credentials: 'include', cache: 'no-cache' })
      .then((res) => res.ok ? res.json() : null)
      .then((data: { ordering_cutoff_time?: string } | null) => {
        if (data?.ordering_cutoff_time) setOrderingCutoffTime(data.ordering_cutoff_time);
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

  // Auto-show blackout modal when blackout is detected — skip initial page load.
  useEffect(() => {
    if (blackoutFirstRenderRef.current) { blackoutFirstRenderRef.current = false; return; }
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
      apiFetch(`/blackout-days?from_date=${serviceDate}&to_date=${serviceDate}&session=${session}`) as Promise<BlackoutDay[]>,
    ]);
    setMenuItems(menuData.items || []);
    const currentDay = resolveBlackoutForSession(blackoutRows || [], serviceDate, session);
    if (currentDay && ['ORDER_BLOCK', 'SERVICE_BLOCK', 'BOTH'].includes(currentDay.type)) {
      setActiveBlackout({
        type: currentDay.type,
        session: currentDay.session || null,
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
      setError('Student profile is missing.');
      return false;
    }

    // Duplicate order check
    if (selectedDayOrder) {
      setShowDuplicatePopup(true);
      return false;
    }

    const items = Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    if (items.length === 0) {
      setError('Select at least one menu item.');
      return false;
    }
    if (placementBlockedByBlackout) {
      setError('');
      setShowBlackoutModal(true);
      return false;
    }
    if (!orderingWindow.canOrderNow) {
      setError(`Ordering opens daily at ${formatCutoffLabel(orderingCutoffTime)}.`);
      return false;
    }
    if (serviceDate <= orderingWindow.today) {
      setError('Orders can only be placed for tomorrow onward.');
      return false;
    }
    if (placementExpired) {
      setError('ORDER_CUTOFF_EXCEEDED');
      return false;
    }
    if (items.length > 5) {
      setError('Maximum 5 items per cart/order.');
      return false;
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
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order placement failed';
      if (msg.includes('ORDER_SESSION_DISABLED')) {
        setError('This session is not currently available for ordering.');
      } else {
        setError(mapOrderRuleError(msg, orderingCutoffTime));
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const discardDraftAndContinue = async () => {
    if (draftCartId) {
      try {
        await apiFetch(`/carts/${draftCartId}`, { method: 'DELETE' }, { skipAutoReload: true });
      } catch {
        // Best-effort cleanup before leaving the page.
      }
    }
    setItemQty({});
    setDraftCartId('');
    setDraftExpiresAt('');
  };

  if (loading) {
    return (
      <main className="page-auth">
        <section className="auth-panel">
          <h1>Student Module</h1>
          <p>Loading data...</p>
        </section>
      </main>
    );
  }

  return (
    <>
    <main className="page-auth page-auth-mobile youngsters-page">
      <section className="auth-panel">
          <h1>Student Order</h1>
        <div className="module-guide-card">
          Select dishes, manage drafts, and confirm student meals.
        </div>
        {error ? <p className="auth-error">{error}</p> : null}

        {mode === 'record' ? (
          <div className="module-section" id="youngster-order">
            <h2>Confirmed Orders</h2>
            <div className="day-toggle-row" role="group" aria-label="Quick view date">
              <button
                type="button"
                className={confirmedViewDate === getMakassarDateWithOffset(-1) ? 'day-btn day-btn-active' : 'day-btn'}
                onClick={() => {
                  const date = getMakassarDateWithOffset(-1);
                  setConfirmedDateInput(date);
                  setConfirmedViewDate(date);
                }}
              >
                Yesterday
              </button>
              <button
                type="button"
                className={confirmedViewDate === getMakassarDateWithOffset(0) ? 'day-btn day-btn-active' : 'day-btn'}
                onClick={() => {
                  const date = getMakassarDateWithOffset(0);
                  setConfirmedDateInput(date);
                  setConfirmedViewDate(date);
                }}
              >
                Today
              </button>
              <button
                type="button"
                className={confirmedViewDate === getMakassarDateWithOffset(1) ? 'day-btn day-btn-active' : 'day-btn'}
                onClick={() => {
                  const date = getMakassarDateWithOffset(1);
                  setConfirmedDateInput(date);
                  setConfirmedViewDate(date);
                }}
              >
                Tomorrow
              </button>
            </div>
            <div className="record-filter-row">
              <label className="record-filter-field">
                Service Date
                <input type="date" value={confirmedDateInput} onChange={(e) => setConfirmedDateInput(e.target.value)} />
              </label>
              <button className="btn btn-outline" type="button" onClick={() => setConfirmedViewDate(confirmedDateInput)}>
                Show Order
              </button>
            </div>
            {confirmedOrders.length > 0 ? (
              <div className="auth-form">
                {confirmedOrders.map((order) => (
                  <label key={order.id} style={getSessionCardStyle(order.session)}>
                    <SessionBadge session={order.session} />
                    <strong>{order.service_date}</strong>
                    <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                    <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                    <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                  </label>
                ))}
              </div>
            ) : <p className="auth-help">No confirmed order for {confirmedViewDate}.</p>}
          </div>
        ) : null}

        {mode === 'order' ? (
          <>
        <div className="module-section">
          <h2>Menu and Cart</h2>
          <label>Service Date<input type="date" value={serviceDate} min={orderingWindow.earliestServiceDate} onChange={(e) => setServiceDate(e.target.value)} /></label>
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
              {activeSessions.map((s) => <option key={s} value={s}>{getSessionLabel(s)}</option>)}
            </select>
          </label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(cutoffRemainingMs)} ({formatCutoffLabel(orderingCutoffTime)})</p>
          {!orderingWindow.canOrderNow ? <p className="auth-help">Ordering opens at {formatCutoffLabel(orderingCutoffTime)}.</p> : null}
          {serviceDate <= orderingWindow.today ? <p className="auth-help">Select tomorrow or a later date to place an order.</p> : null}
          {draftCartId && hasOpenDraft ? <p className="auth-help">Open draft detected and loaded automatically.</p> : null}

          {menuItems.length > 0 ? (
            <div className="menu-flow-grid">
              <div className="menu-search-section">
                <h3>Menu Section</h3>
                {menuItems.length === 0 ? <p className="auth-help">No dishes found.</p> : (
                  <div className="auth-form">
                    {menuItems.map((item) => (
                      <label key={item.id} style={getSelectedMenuCardStyle(session, Boolean(itemQty[item.id]))}>
                        <SessionBadge session={session} />
                        <span><strong>{item.name}</strong> - Rp {Number(item.price).toLocaleString('id-ID')}</span>
                        <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                        <small>Dietary: {formatDishDietaryTags(item)}</small>
                        <small>{item.description}</small>
                        <small>{item.nutrition_facts_text}</small>
                        <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                        <button className="btn btn-outline" type="button" onClick={() => onAddDraftItem(item.id)} disabled={placementBlockedByBlackout}>{itemQty[item.id] ? 'Selected' : 'Add'}</button>
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
                      <label key={d.id} style={getSessionCardStyle(session)}>
                        <SessionBadge session={session} />
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
          </>
        ) : null}
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
                : 'Ordering is blocked'} on {serviceDate}
              {activeBlackout.session ? ` for ${getSessionLabel(activeBlackout.session)}` : ''}{activeBlackout.reason ? `: ${activeBlackout.reason}` : ''}.
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
        .record-filter-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.6rem;
          align-items: end;
          margin-bottom: 0.65rem;
        }
        .record-filter-field {
          margin: 0;
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
        @media (max-width: 520px) {
          .record-filter-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
    <DraftExitGuard active={hasDraftChanges} onDiscard={discardDraftAndContinue} onSave={onPlaceOrder} subjectLabel="student" />
    <LogoutButton returnHref="/student" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
