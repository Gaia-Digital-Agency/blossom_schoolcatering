'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../lib/auth';

type Youngster = {
  id: string;
  first_name: string;
  last_name: string;
  school_name: string;
  school_grade: string;
  dietary_allergies?: string;
};

type MenuItem = {
  id: string;
  name: string;
  description: string;
  nutrition_facts_text: string;
  price: number;
  ingredients: string[];
  has_allergen: boolean;
};
type DraftCart = {
  id: string;
  status: 'OPEN' | 'SUBMITTED' | 'EXPIRED';
  expires_at: string;
};
type YoungsterInsights = {
  week: { start: string; end: string; totalCalories: number; days: Array<{ service_date: string; calories_display: string; tba_items: number }> };
  badge: { level: 'NONE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'; maxConsecutiveOrderDays: number; currentMonthOrders: number };
  birthdayHighlight: { date_of_birth: string; days_until: number };
};

function nextWeekdayIsoDate() {
  const d = new Date();
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

export default function YoungstersPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [youngster, setYoungster] = useState<Youngster | null>(null);
  const [serviceDate, setServiceDate] = useState(nextWeekdayIsoDate());
  const [session, setSession] = useState<'LUNCH' | 'SNACK' | 'BREAKFAST'>('LUNCH');
  const [searchText, setSearchText] = useState('');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [draftCartId, setDraftCartId] = useState('');
  const [draftExpiresAt, setDraftExpiresAt] = useState('');
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [insights, setInsights] = useState<YoungsterInsights | null>(null);

  const selectedCount = useMemo(
    () => Object.values(itemQty).filter((qty) => qty > 0).length,
    [itemQty],
  );
  const searchResults = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    return (menuItems || []).filter((item) => {
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle);
    });
  }, [menuItems, searchText]);
  const draftItems = useMemo(() => {
    const index = new Map(menuItems.map((m) => [m.id, m]));
    return Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ menuItem: index.get(id), id, qty }))
      .filter((x) => Boolean(x.menuItem));
  }, [itemQty, menuItems]);
  const cutoffRemainingMs = getCutoffTimestamp(serviceDate) - nowMs;
  const draftRemainingMs = draftExpiresAt ? new Date(draftExpiresAt).getTime() - nowMs : 0;
  const placementExpired = cutoffRemainingMs <= 0;
  const hasOpenDraft = Boolean(draftCartId) && draftRemainingMs > 0;

  useEffect(() => {
    apiFetch('/children/me')
      .then((data) => setYoungster(data as Youngster))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed loading youngster profile'))
      .finally(() => setLoading(false));
    apiFetch('/youngsters/me/insights')
      .then((data) => setInsights(data as YoungsterInsights))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const onLoadMenu = async () => {
    setError('');
    setMessage('');
    const data = await apiFetch(`/menus?service_date=${serviceDate}&session=${session}`) as { items: MenuItem[] };
    setMenuItems(data.items);
    setItemQty({});
    apiFetch('/youngsters/me/insights').then((x) => setInsights(x as YoungsterInsights)).catch(() => undefined);
  };

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
    setLoadingDraft(true);
    try {
      const [menuData, cartsData] = await Promise.all([
        apiFetch(`/menus?service_date=${serviceDate}&session=${session}`) as Promise<{ items: MenuItem[] }>,
        apiFetch(`/carts?child_id=${childId}&service_date=${serviceDate}&session=${session}`) as Promise<DraftCart[]>,
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
      setMessage('Draft detected and loaded for selected date/session.');
    } finally {
      setLoadingDraft(false);
    }
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

    const items = Object.entries(itemQty)
      .filter(([, qty]) => qty > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity }));

    if (items.length === 0) {
      setError('Select at least one menu item.');
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
    setMessage('');
    try {
      const cartRes = await apiFetch('/carts', {
        method: 'POST',
        body: JSON.stringify({ childId: youngster.id, serviceDate, session }),
      }) as { id?: string };

      if (!cartRes?.id) throw new Error('Cart creation failed — no cart ID returned.');
      const cartId = cartRes.id;

      await apiFetch(`/carts/${cartId}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      });

      const order = await apiFetch(`/carts/${cartId}/submit`, {
        method: 'POST',
      }) as { id: string; total_price: number };

      setMessage(`Order placed. Order ID: ${order.id}, total: Rp ${order.total_price.toLocaleString('id-ID')}.`);
      setItemQty({});
      setDraftCartId('');
      setDraftExpiresAt('');
      apiFetch('/youngsters/me/insights').then((x) => setInsights(x as YoungsterInsights)).catch(() => undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Order placement failed');
    } finally {
      setSubmitting(false);
    }
  };

  const onResumeDraft = async () => {
    if (!draftCartId) return;
    setError('');
    setMessage('');
    setLoadingDraft(true);
    try {
      await loadDraftItems(draftCartId);
      setMessage('Draft resumed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume draft');
    } finally {
      setLoadingDraft(false);
    }
  };

  const onDiscardDraft = async () => {
    if (!draftCartId) return;
    if (!window.confirm('Discard this draft cart?')) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/carts/${draftCartId}`, { method: 'DELETE' });
      setDraftCartId('');
      setDraftExpiresAt('');
      setItemQty({});
      setMessage('Draft discarded.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to discard draft');
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
    <main className="page-auth page-auth-mobile youngsters-page">
      <section className="auth-panel">
        <h1>Youngsters Module (Step 6)</h1>
        {youngster ? (
          <p className="auth-help">
            {youngster.first_name} {youngster.last_name} - {youngster.school_name} ({youngster.school_grade})
          </p>
        ) : null}
        <button className="btn btn-outline" type="button" onClick={() => { window.location.href = '/register/youngsters'; }}>
          Update Registration Details
        </button>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section">
          <h2>Weekly Nutrition + Badge</h2>
          {insights ? (
            <div className="auth-form">
              <label>
                <strong>Clean Plate Club Badge: {insights.badge.level}</strong>
                <small>Max consecutive order days: {insights.badge.maxConsecutiveOrderDays}</small>
                <small>Current month orders: {insights.badge.currentMonthOrders}</small>
              </label>
              <label>
                <strong>Nutrition Week {insights.week.start} to {insights.week.end}</strong>
                <small>Total Calories: {insights.week.totalCalories} kcal</small>
                <small>Birthday in {insights.birthdayHighlight.days_until} day(s)</small>
              </label>
              {insights.week.days.map((d) => (
                <label key={d.service_date}>
                  <strong>{d.service_date}</strong>
                  <small>Calories: {d.calories_display}</small>
                  <small>{d.tba_items > 0 ? `TBA items: ${d.tba_items}` : 'All calorie data available'}</small>
                </label>
              ))}
            </div>
          ) : (
            <p className="auth-help">Loading nutrition insights...</p>
          )}
        </div>

        <div className="module-section">
          <h2>Session Menu and Cart</h2>
          <label>
            Service Date
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </label>
          <p className="auth-help">Place-order cutoff countdown: {formatRemaining(cutoffRemainingMs)} (08:00 Asia/Makassar)</p>
          {draftCartId ? (
            <p className="auth-help">
              Draft status: {hasOpenDraft ? 'OPEN' : 'EXPIRED'} | Draft countdown: {formatRemaining(draftRemainingMs)}
            </p>
          ) : (
            <p className="auth-help">Draft status: none</p>
          )}
          <label>
            Session
            <select value={session} onChange={(e) => setSession(e.target.value as 'LUNCH' | 'SNACK' | 'BREAKFAST')}>
              <option value="LUNCH">LUNCH</option>
              <option value="SNACK">SNACK</option>
              <option value="BREAKFAST">BREAKFAST</option>
            </select>
          </label>
          <label>
            Allergies
            <input value={youngster?.dietary_allergies || 'No Allergies'} readOnly />
          </label>
          <label>
            Search Name Of Dish
            <input value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Type dish name..." />
          </label>
          <button className="btn btn-outline" type="button" onClick={onLoadMenu}>Refresh Menu</button>
          <button className="btn btn-outline" type="button" onClick={onResumeDraft} disabled={!draftCartId || loadingDraft}>
            {loadingDraft ? 'Loading Draft...' : 'Resume Draft'}
          </button>
          <button className="btn btn-outline" type="button" onClick={onDiscardDraft} disabled={!draftCartId || loadingDraft}>
            Discard Draft
          </button>

          {menuItems.length > 0 ? (
            <div className="menu-flow-grid">
              <div className="menu-search-section">
                <h3>Search Results</h3>
                {searchResults.length === 0 ? <p className="auth-help">No dishes found.</p> : (
                  <div className="auth-form">
                    {searchResults.map((item) => (
                      <label key={item.id}>
                        <span>
                          <strong>{item.name}</strong> - Rp {Number(item.price).toLocaleString('id-ID')}
                          {item.has_allergen ? ' (Contains allergen)' : ''}
                        </span>
                        <small>{item.description}</small>
                        <small>{item.nutrition_facts_text}</small>
                        <small>Ingredients: {item.ingredients.join(', ') || '-'}</small>
                        <button className="btn btn-outline" type="button" onClick={() => onAddDraftItem(item.id)}>Add</button>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="menu-draft-section">
                <h3>Draft Section</h3>
                {draftItems.length === 0 ? <p className="auth-help">No dishes in draft. Use Add from search results.</p> : (
                  <div className="auth-form">
                    {draftItems.map((d) => (
                      <label key={d.id}>
                        <span><strong>{d.menuItem?.name}</strong> - Rp {Number(d.menuItem?.price || 0).toLocaleString('id-ID')}</span>
                        <small>{d.menuItem?.description}</small>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          value={d.qty}
                          onChange={(e) => setItemQty((prev) => ({ ...prev, [d.id]: Number(e.target.value || 0) }))}
                        />
                        <button className="btn btn-outline" type="button" onClick={() => onRemoveDraftItem(d.id)}>Remove</button>
                      </label>
                    ))}
                  </div>
                )}
                <p className="auth-help">Selected items: {selectedCount} / 5</p>
                <button className="btn btn-primary" type="button" disabled={submitting || placementExpired} onClick={onPlaceOrder}>
                  {submitting ? 'Placing Order...' : 'Place Order'}
                </button>
              </div>
            </div>
          ) : (
            <p className="auth-help">Loading menu for selected date/session...</p>
          )}
        </div>
      </section>
    </main>
  );
}
