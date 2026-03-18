'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../../lib/dish-tags';
import DraftExitGuard from '../../_components/draft-exit-guard';
import LogoutButton from '../../_components/logout-button';
import SessionBadge from '../../_components/session-badge';
import { getSessionCardStyle, getSessionLabel } from '../../../lib/session-theme';

const ORDER_SUCCESS_POPUP_KEY = 'blossom_parent_order_success_popup';

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
  placed_by_role?: 'YOUNGSTER' | 'PARENT';
  items: OrderItem[];
};
type DraftCart = { id: string; status: 'OPEN' | 'SUBMITTED' | 'EXPIRED'; expires_at: string };
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
type DraftSourceContext = {
  mode: 'edit' | 'quick-reorder';
  orderId: string;
  childId: string;
  childName: string;
  sourceServiceDate: string;
  targetServiceDate: string;
  session: SessionType;
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
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function getMakassarDateWithOffset(offset: number): string {
  const today = todayMakassarIsoDate();
  const d = new Date(today + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
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
  const [cutoffHour, cutoffMinute] = cutoffTime.split(':').map((part) => Number(part));
  return {
    nowHour: hh,
    today,
    earliestServiceDate: nextWeekdayIsoDate(),
    canOrderNow: (hh * 60) + min >= (cutoffHour * 60) + cutoffMinute,
  };
}
function mapOrderRuleError(raw: string, cutoffTime = '08:00') {
  if (raw.includes('ORDER_BLACKOUT_BLOCKED')) return 'Ordering is blocked for this date (blackout).';
  if (raw.includes('ORDER_SERVICE_BLOCKED')) return 'Service is blocked for this date (blackout).';
  if (raw.includes('ORDER_TOMORROW_ONWARDS_ONLY')) return 'Orders can only be placed for tomorrow onward.';
  if (raw.includes('ORDERING_AVAILABLE_FROM_')) return `Ordering opens daily at ${formatCutoffLabel(cutoffTime)}.`;
  return raw;
}
function activeBlackoutMessage(blackout: ActiveBlackout | null) {
  if (!blackout) return '';
  const scope = blackout.session ? ` for ${getSessionLabel(blackout.session)}` : '';
  if (blackout.type === 'SERVICE_BLOCK') return `${mapOrderRuleError('ORDER_SERVICE_BLOCKED')}${scope}`;
  return `${mapOrderRuleError('ORDER_BLACKOUT_BLOCKED')}${scope}`;
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

export default function FamilyOrderPage({
  mode = 'order',
}: {
  mode?: 'order' | 'record';
}) {
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
  const [orderingCutoffTime, setOrderingCutoffTime] = useState('08:00');

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [activeBlackout, setActiveBlackout] = useState<ActiveBlackout | null>(null);
  const [draftSourceContext, setDraftSourceContext] = useState<DraftSourceContext | null>(null);
  const [refreshDedupMessage, setRefreshDedupMessage] = useState('');

  // Popups
  const [showSuccessPopup, setShowSuccessPopup] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);
  const [showQuickReorderPopup, setShowQuickReorderPopup] = useState(false);
  const [showBlackoutModal, setShowBlackoutModal] = useState(false);

  const menuSectionRef = useRef<HTMLDivElement | null>(null);
  const draftSectionRef = useRef<HTMLDivElement | null>(null);
  const autoOpenHandledRef = useRef(false);

  const orderingWindow = useMemo(() => getMakassarOrderingWindow(orderingCutoffTime), [nowMs, orderingCutoffTime]);
  const placeCutoffMs = getCutoffTimestamp(serviceDate, orderingCutoffTime) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = placeCutoffMs <= 0;
  const placementBlockedByWindow = !orderingWindow.canOrderNow || serviceDate <= orderingWindow.today;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;
  const placementBlockedByBlackout = Boolean(activeBlackout);

  const selectedCount = useMemo(() => Object.values(itemQty).filter((qty) => qty > 0).length, [itemQty]);

  const visibleOrders = useMemo(
    () => (selectedChildId ? orders.filter((o) => o.child_id === selectedChildId) : orders),
    [orders, selectedChildId],
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
  const hasDraftChanges = draftItems.length > 0;

  useEffect(() => {
    if (activeSessions.length === 0) return;
    if (!activeSessions.includes(session)) setSession(activeSessions[0]);
  }, [activeSessions, session]);

  useEffect(() => {
    if (activeBlackout) setShowBlackoutModal(true);
  }, [activeBlackout]);

  const loadOrders = async (): Promise<ConsolidatedOrder[]> => {
    setLoadingOrders(true);
    try {
      const data = await apiFetch('/parent/me/orders/consolidated') as { orders: ConsolidatedOrder[] };
      const allOrders = data.orders || [];
      setOrders(allOrders);
      return allOrders;
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadSessionSettings = async () => {
    const settings = await apiFetch('/session-settings') as SessionSetting[];
    if (!Array.isArray(settings) || settings.length === 0) return;
    setSessionSettings(settings);
  };

  const loadPublicSiteSettings = async () => {
    const res = await fetch('/schoolcatering/api/v1/public/site-settings', { credentials: 'include', cache: 'no-cache' });
    if (!res.ok) return;
    const data = await res.json() as { ordering_cutoff_time?: string };
    setOrderingCutoffTime(data.ordering_cutoff_time || '08:00');
  };

  const loadBaseData = async () => {
    const childrenData = await apiFetch('/parent/me/children/pages') as { parentId: string; children: Child[] };
    setChildren(childrenData.children);
    if (childrenData.children.length > 0) setSelectedChildId(childrenData.children[0].id);
    await Promise.all([loadOrders(), loadSessionSettings(), loadPublicSiteSettings()]);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const shouldShowPopup = window.sessionStorage.getItem(ORDER_SUCCESS_POPUP_KEY) === '1';
    if (!shouldShowPopup) return;
    window.sessionStorage.removeItem(ORDER_SUCCESS_POPUP_KEY);
    setShowSuccessPopup(true);
    // Scroll to top so the popup is visible after the page reload restores scroll position.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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
    if (!openDraft) { setDraftCartId(''); setDraftExpiresAt(''); setItemQty({}); return; }
    await loadDraftItems(openDraft.id);
  };

  useEffect(() => {
    loadMenuAndDraft().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading menu'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildId, serviceDate, session]);

  const onAddDraftItem = (menuItemId: string) => {
    const alreadySelected = Object.values(itemQty).filter((qty) => qty > 0).length;
    if (!itemQty[menuItemId] && alreadySelected >= 5) { setError('Maximum 5 items per order.'); return; }
    setError('');
    setItemQty((prev) => ({ ...prev, [menuItemId]: Math.max(1, prev[menuItemId] || 0) }));
  };
  const onRemoveDraftItem = (menuItemId: string) => {
    setItemQty((prev) => ({ ...prev, [menuItemId]: 0 }));
  };

  const onPlaceOrder = async () => {
    if (!selectedChildId) {
      setError('Please select a student first.');
      return false;
    }
    const items = Object.entries(itemQty).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    if (items.length === 0) {
      setError('Select at least one menu item.');
      return false;
    }

    // Duplicate check: show popup if an order exists for this day/session and we are NOT editing that exact order
    const isEditingThisOrder = draftSourceContext?.mode === 'edit' && selectedDayOrder?.id === draftSourceContext?.orderId;
    if (selectedDayOrder && !isEditingThisOrder) {
      setShowDuplicatePopup(true);
      return false;
    }

    if (placementBlockedByBlackout) { setShowBlackoutModal(true); return false; }
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
      setError('Maximum 5 items per order.');
      return false;
    }

    setSubmitting(true); setError(''); setMessage('');
    try {
      if (draftSourceContext?.mode === 'edit') {
        // Edit existing order via PATCH (no cart required)
        await apiFetch(`/orders/${draftSourceContext.orderId}`, {
          method: 'PATCH',
          body: JSON.stringify({ items }),
        }, { skipAutoReload: true });
      } else {
        // New order: reuse existing open cart if available, else create one
        let cartId: string;
        if (draftCartId && draftRemainingMs > 0) {
          cartId = draftCartId;
        } else {
          const cartRes = await apiFetch('/carts', {
            method: 'POST',
            body: JSON.stringify({ childId: selectedChildId, serviceDate, session }),
          }, { skipAutoReload: true }) as { id?: string };
          if (!cartRes?.id) throw new Error('Cart creation failed — no cart ID returned.');
          cartId = cartRes.id;
        }
        await apiFetch(`/carts/${cartId}/items`, { method: 'PATCH', body: JSON.stringify({ items }) }, { skipAutoReload: true });
        await apiFetch(`/carts/${cartId}/submit`, { method: 'POST' }, { skipAutoReload: true });
      }
      setItemQty({});
      setDraftCartId('');
      setDraftExpiresAt('');
      setDraftSourceContext(null);
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ORDER_SUCCESS_POPUP_KEY, '1');
        window.location.reload();
        return true;
      }
      setShowSuccessPopup(true);
      await loadOrders();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Order placement failed';
      if (msg.includes('ORDER_SESSION_DISABLED')) {
        setError('This session is not currently available for ordering.');
      } else {
        setError(mapOrderRuleError(msg, orderingCutoffTime));
      }
      return false;
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
        // Clear open draft carts, then populate from existing order items
        await clearOpenDraftsForContext(order.child_id, targetDate, nextSession);
        const editQty: Record<string, number> = {};
        for (const item of order.items) {
          editQty[item.menu_item_id] = item.quantity;
        }
        setItemQty(editQty);
        setDraftCartId('');
        setDraftExpiresAt('');
      } else {
        // Quick reorder: use API to create draft cart with same items
        const out = await apiFetch('/carts/quick-reorder', {
          method: 'POST',
          body: JSON.stringify({ sourceOrderId: order.id, serviceDate: targetDate }),
        }) as { cartId: string; excludedItemIds: string[] };
        await loadDraftItems(out.cartId);
        setShowQuickReorderPopup(true);
      }
      // Scroll to Menu & Cart section
      window.setTimeout(() => {
        menuSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err) {
        setError(err instanceof Error ? mapOrderRuleError(err.message, orderingCutoffTime) : 'Failed to open order as draft');
    }
  };

  useEffect(() => {
    if (mode !== 'order' || loading || autoOpenHandledRef.current) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    const orderId = params.get('orderId');
    const targetDate = params.get('serviceDate');
    if (action !== 'edit' || !orderId || !targetDate) return;
    const order = orders.find((entry) => entry.id === orderId);
    if (!order) return;
    autoOpenHandledRef.current = true;
    onOpenOrderAsDraft(order, targetDate, 'edit').catch((err) => {
      autoOpenHandledRef.current = false;
      setError(err instanceof Error ? mapOrderRuleError(err.message, orderingCutoffTime) : 'Failed to open order as draft');
    });
    if (typeof window !== 'undefined') {
      const next = new URL(window.location.href);
      next.searchParams.delete('action');
      next.searchParams.delete('orderId');
      next.searchParams.delete('serviceDate');
      window.history.replaceState({}, '', `${next.pathname}${next.search}`);
    }
  }, [loading, mode, orders]);

  const onDeleteOrder = async (orderId: string) => {
    if (!window.confirm('Confirm delete this order before cutoff?')) return;
    setError(''); setMessage('');
    try {
      await apiFetch(`/orders/${orderId}`, { method: 'DELETE' });
      setMessage('Order deleted successfully.');
      await loadOrders();
    } catch (err) { setError(err instanceof Error ? mapOrderRuleError(err.message, orderingCutoffTime) : 'Order delete failed'); }
  };

  const onRefreshOrders = async () => {
    setError(''); setMessage(''); setRefreshDedupMessage('');
    try {
      const allOrders = await loadOrders();
      // Detect duplicates: same child + date + session with both YOUNGSTER and PARENT PLACED orders
      const groupMap = new Map<string, ConsolidatedOrder[]>();
      for (const o of allOrders) {
        if (o.status !== 'PLACED') continue;
        const key = `${o.child_id}|${o.service_date}|${o.session}`;
        const group = groupMap.get(key) || [];
        group.push(o);
        groupMap.set(key, group);
      }
      const toDelete: string[] = [];
      for (const group of groupMap.values()) {
        if (group.length < 2) continue;
        const youngsterOrder = group.find((o) => o.placed_by_role === 'YOUNGSTER');
        const parentOrder = group.find((o) => o.placed_by_role === 'PARENT');
        if (youngsterOrder && parentOrder && parentOrder.can_edit) toDelete.push(parentOrder.id);
      }
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map((id) => apiFetch(`/orders/${id}`, { method: 'DELETE' })));
        await loadOrders();
        setRefreshDedupMessage(`${toDelete.length} duplicate family order(s) removed and student order(s) kept.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  };

  const discardDraftAndContinue = async () => {
    if (draftCartId) {
      try {
        await apiFetch(`/carts/${draftCartId}`, { method: 'DELETE' }, { skipAutoReload: true });
      } catch {
        // Best-effort cleanup before navigation continues.
      }
    }
    setItemQty({});
    setDraftCartId('');
    setDraftExpiresAt('');
    setDraftSourceContext(null);
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Family Module</h1><p>Loading...</p></section></main>;
  }

  return (
    <>
    <main className="page-auth page-auth-mobile parents-page">
      <section className="auth-panel">
        <h1>Family Order</h1>
        <div className="module-guide-card">
          Manage Family Group orders, drafts, and confirmed meals.
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        {message ? <p className="auth-help">{message}</p> : null}
        {refreshDedupMessage ? <p className="auth-help" style={{ color: '#166534', fontWeight: 600 }}>{refreshDedupMessage}</p> : null}

        {children.length > 1 && (
          <div className="module-section">
            <label>Student
              <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                {children.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.school_grade})</option>)}
              </select>
            </label>
          </div>
        )}

        {mode === 'order' ? (
          <div className="module-section" ref={menuSectionRef}>
            <h2>Menu and Cart</h2>
            {draftSourceContext
              && selectedChildId === draftSourceContext.childId
              && serviceDate === draftSourceContext.targetServiceDate
              && session === draftSourceContext.session ? (
                <p className="auth-help">
                  {draftSourceContext.mode === 'edit' ? '✏️ Editing order' : '🛒 Quick reorder from'}: #{draftSourceContext.orderId}
                  {' | '}Student: {draftSourceContext.childName}
                  {' | '}Date: {draftSourceContext.targetServiceDate}
                </p>
              ) : null}
            <label>Service Date
              <input type="date" value={serviceDate} min={orderingWindow.earliestServiceDate} onChange={(e) => setServiceDate(e.target.value)} />
            </label>
            <label>Session
              <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
                {activeSessions.map((s) => <option key={s} value={s}>{getSessionLabel(s)}</option>)}
              </select>
            </label>
            <p className="auth-help">Cutoff countdown: {formatRemaining(placeCutoffMs)} ({formatCutoffLabel(orderingCutoffTime)})</p>
            {!orderingWindow.canOrderNow ? <p className="auth-help">Ordering opens at {formatCutoffLabel(orderingCutoffTime)}.</p> : null}
            {serviceDate <= orderingWindow.today ? <p className="auth-help">Select tomorrow or a later date to place an order.</p> : null}
            {draftCartId && hasOpenDraft ? <p className="auth-help">Draft cart loaded.</p> : null}

            {menuItems.length > 0 ? (
              <div className="menu-flow-grid">
                <div className="menu-search-section">
                  <h3>Menu Section</h3>
                  <div className="auth-form">
                    {menuItems.map((item) => (
                      <label key={item.id} style={getSelectedMenuCardStyle(session, Boolean(itemQty[item.id]))}>
                        <SessionBadge session={session} />
                        <span><strong>{item.name}</strong> — Rp {Number(item.price).toLocaleString('id-ID')}</span>
                        <small>Category: {formatDishCategoryLabel(item.dish_category)}</small>
                        <small>Dietary: {formatDishDietaryTags(item)}</small>
                        <small>{item.description}</small>
                        <small>{item.nutrition_facts_text}</small>
                        <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                        <button className="btn btn-outline" type="button"
                          onClick={() => onAddDraftItem(item.id)}
                          disabled={placementBlockedByBlackout}>{itemQty[item.id] ? 'Selected' : 'Add'}</button>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="menu-draft-section" ref={draftSectionRef}>
                  <h3>Draft Section</h3>
                  {draftItems.length === 0 ? (
                    <p className="auth-help">No dishes in draft. Add from Menu Section.</p>
                  ) : (
                    <div className="auth-form">
                      {draftItems.map((d) => (
                        <label key={d.id} style={getSessionCardStyle(session)}>
                          <SessionBadge session={session} />
                          <span><strong>{d.menuItem?.name}</strong> — Rp {Number(d.menuItem?.price || 0).toLocaleString('id-ID')}</span>
                          <small>Category: {d.menuItem ? formatDishCategoryLabel(d.menuItem.dish_category) : '-'}</small>
                          <small>{d.menuItem?.description}</small>
                          <button className="btn btn-outline btn-sm" type="button" onClick={() => onRemoveDraftItem(d.id)}>Remove</button>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="draft-actions">
                    <p className="auth-help">Selected items: {selectedCount} / 5</p>
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={submitting || placementExpired || placementBlockedByBlackout || placementBlockedByWindow}
                      onClick={onPlaceOrder}
                    >
                      {submitting ? 'Placing...' : (draftSourceContext?.mode === 'edit' ? 'Save Changes' : 'Place Order')}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="auth-help">No active dishes configured by Admin for this date/session.</p>
            )}
          </div>
        ) : null}

        {mode === 'record' ? (
          <div className="module-section">
            <h2>Consolidated Orders</h2>
            <button className="btn btn-outline" type="button" onClick={onRefreshOrders} disabled={loadingOrders}>
              {loadingOrders ? 'Refreshing...' : 'Refresh Orders'}
            </button>
            {sortedVisibleOrders.length === 0 ? (
              <p className="auth-help">No orders yet for the selected student.</p>
            ) : (
              <div className="auth-form">
                {sortedVisibleOrders.map((order) => (
                  <div key={order.id} className="order-row-card" style={getSessionCardStyle(order.session)}>
                    <SessionBadge session={order.session} />
                    <span><strong>{order.child_name}</strong> — {order.service_date}</span>
                    <small>Order: {order.id}</small>
                    <small>Status: {order.status} | Billing: {order.billing_status || '-'} | Delivery: {order.delivery_status || '-'}</small>
                    <small>Total: Rp {Number(order.total_price).toLocaleString('id-ID')}</small>
                    <small>Items: {order.items.map((item) => `${item.item_name_snapshot} x${item.quantity}`).join(', ') || '-'}</small>
                    <div className="order-row-actions">
                      <button className="btn btn-outline" type="button"
                        onClick={() => {
                          if (typeof window === 'undefined') return;
                          const params = new URLSearchParams({
                            action: 'edit',
                            orderId: order.id,
                            serviceDate: order.service_date,
                          });
                          window.location.href = `/schoolcatering/family/order?${params.toString()}`;
                        }}
                        disabled={!order.can_edit || submitting}>Edit Before Cutoff</button>
                      <button className="btn btn-outline" type="button"
                        onClick={() => onDeleteOrder(order.id)}
                        disabled={!order.can_edit || submitting}>Delete Before Cutoff</button>
                    </div>
                    {!order.can_edit ? <small className="muted-note">Cutoff passed — order locked.</small> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </section>

      {/* ── Success Popup ── */}
      {showSuccessPopup ? (
        <div className="popup-overlay" onClick={() => setShowSuccessPopup(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">✅</div>
            <h3 className="popup-title">Order Is Successful</h3>
            <p className="popup-body">Go To Billing To Make Payment.</p>
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
            <p className="popup-body">An order already exists for this date and session. Use Edit Before Cutoff to modify it.</p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowDuplicatePopup(false)}>OK</button>
          </div>
        </div>
      ) : null}

      {/* ── Quick Reorder Popup ── */}
      {showQuickReorderPopup ? (
        <div className="popup-overlay" onClick={() => setShowQuickReorderPopup(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">🛒</div>
            <h3 className="popup-title">Same Order Items Placed in Draft</h3>
            <p className="popup-body">Select Date Then Place Order</p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowQuickReorderPopup(false)}>OK</button>
          </div>
        </div>
      ) : null}

      {/* ── Blackout Popup ── */}
      {showBlackoutModal && activeBlackout ? (
        <div className="popup-overlay" onClick={() => setShowBlackoutModal(false)}>
          <div className="popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="popup-icon">🚫</div>
            <h3 className="popup-title">Date Blocked</h3>
            <p className="popup-body">
              {activeBlackoutMessage(activeBlackout)}{activeBlackout.reason ? ` — ${activeBlackout.reason}` : ''}
            </p>
            <button className="btn btn-primary popup-close" type="button" onClick={() => setShowBlackoutModal(false)}>OK</button>
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
        .day-btn:hover { background: #fff8ec; border-color: #b8860b; }
        .day-btn-active { background: #fff3d6; border-color: #9a6c1f; color: #6b4a10; font-weight: 600; }
        .muted-note { color: #888; font-size: 0.78rem; }
        @media (max-width: 520px) {
          .record-filter-row {
            grid-template-columns: 1fr;
          }
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
        .popup-icon { font-size: 2.4rem; line-height: 1; }
        .popup-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #2d2d2d; }
        .popup-body { margin: 0; font-size: 0.9rem; color: #555; }
        .popup-close { width: 100%; margin-top: 0.25rem; }
      `}</style>
    </main>
    <DraftExitGuard active={hasDraftChanges} onDiscard={discardDraftAndContinue} onSave={onPlaceOrder} subjectLabel="family" />
    <LogoutButton returnHref="/family" showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
