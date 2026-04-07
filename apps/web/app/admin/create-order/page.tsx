'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { getSessionLabel, getSessionCardStyle } from '../../../lib/session-theme';
import { formatDishCategoryLabel, formatDishDietaryTags } from '../../../lib/dish-tags';
import SessionBadge from '../../_components/session-badge';
import AdminReturnButton from '../_components/admin-return-button';

type SessionType = 'BREAKFAST' | 'SNACK' | 'LUNCH';
type SessionSetting = { session: SessionType; is_active: boolean };
const SESSION_ORDER: SessionType[] = ['LUNCH', 'SNACK', 'BREAKFAST'];

type AdminYoungster = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  school_name: string;
  registration_grade?: string;
  current_school_grade?: string | null;
};

type MenuItem = {
  id: string;
  name: string;
  description?: string;
  nutrition_facts_text?: string;
  price: number;
  dish_category?: string;
  image_url?: string;
  is_available?: boolean;
  is_vegetarian?: boolean;
  is_gluten_free?: boolean;
  is_dairy_free?: boolean;
  contains_peanut?: boolean;
  ingredients?: string[];
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextWeekdayIsoLocal() {
  const d = new Date(`${todayIsoLocal()}T00:00:00`);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function AdminCreateOrderPage() {
  const [youngsters, setYoungsters] = useState<AdminYoungster[]>([]);
  const [youngsterSearch, setYoungsterSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('ALL');
  const [selectedYoungsterId, setSelectedYoungsterId] = useState('');
  const [serviceDate, setServiceDate] = useState(nextWeekdayIsoLocal());
  const [session, setSession] = useState<SessionType>('LUNCH');
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [loadingYoungsters, setLoadingYoungsters] = useState(false);
  const [loadingMenu, setLoadingMenu] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sessionSettings, setSessionSettings] = useState<SessionSetting[]>([{ session: 'LUNCH', is_active: true }]);

  const activeSessions = useMemo(
    () => SESSION_ORDER.filter((s) => sessionSettings.find((x) => x.session === s)?.is_active),
    [sessionSettings],
  );

  const loadYoungsters = async () => {
    setLoadingYoungsters(true);
    setError('');
    try {
      const out = await apiFetch('/admin/youngster') as AdminYoungster[];
      const rows = out || [];
      setYoungsters(rows);
      setSelectedYoungsterId((current) => current || rows[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading students');
    } finally {
      setLoadingYoungsters(false);
    }
  };

  useEffect(() => {
    void loadYoungsters();
    apiFetch('/session-settings')
      .then((data) => {
        const settings = data as SessionSetting[];
        if (Array.isArray(settings) && settings.length > 0) setSessionSettings(settings);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (activeSessions.length > 0 && !activeSessions.includes(session)) {
      setSession(activeSessions[0]);
    }
  }, [activeSessions, session]);

  const visibleYoungsters = useMemo(() => {
    const search = youngsterSearch.trim().toLowerCase();
    return youngsters.filter((row) => {
      if (schoolFilter !== 'ALL' && row.school_name !== schoolFilter) return false;
      if (!search) return true;
      const grade = row.current_school_grade || row.registration_grade || '-';
      const haystack = [
        row.first_name,
        row.last_name,
        row.username,
        row.school_name,
        grade,
      ].join(' ').toLowerCase();
      return haystack.includes(search);
    });
  }, [youngsters, youngsterSearch, schoolFilter]);

  const schoolOptions = useMemo(
    () => Array.from(new Set(youngsters.map((row) => row.school_name).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [youngsters],
  );

  const selectedYoungster = useMemo(
    () => youngsters.find((row) => row.id === selectedYoungsterId) || null,
    [youngsters, selectedYoungsterId],
  );

  const selectedCount = useMemo(
    () => Object.values(quantities).filter((qty) => qty > 0).length,
    [quantities],
  );

  const estimatedTotal = useMemo(
    () => menuItems.reduce((sum, item) => sum + (Number(quantities[item.id] || 0) * Number(item.price || 0)), 0),
    [menuItems, quantities],
  );

  const onToggleItem = (menuItemId: string) => {
    setQuantities((prev) => ({
      ...prev,
      [menuItemId]: prev[menuItemId] ? 0 : 1,
    }));
  };

  const [menuLoaded, setMenuLoaded] = useState(false);

  const onLoadMenu = async () => {
    if (!selectedYoungsterId) {
      setError('Select a student first.');
      return;
    }
    if (!serviceDate) {
      setError('Service date is required.');
      return;
    }
    setLoadingMenu(true);
    setError('');
    setMessage('');
    try {
      const query = new URLSearchParams({ session });
      const out = await apiFetch(`/admin/menus?${query.toString()}`) as { items?: MenuItem[] };
      setMenuItems(out.items || []);
      setQuantities({});
      setMenuLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading menu items');
    } finally {
      setLoadingMenu(false);
    }
  };

  useEffect(() => {
    if (menuLoaded && selectedYoungsterId) {
      void onLoadMenu();
    }
  }, [session]);

  const onCreateOrder = async () => {
    if (!selectedYoungster) {
      setError('Select a student first.');
      return;
    }
    const items = Object.entries(quantities)
      .filter(([, quantity]) => Number(quantity) > 0)
      .map(([menuItemId, quantity]) => ({ menuItemId, quantity: Number(quantity) }));
    if (!serviceDate) {
      setError('Service date is required.');
      return;
    }
    if (items.length === 0) {
      setError('Select at least one menu item.');
      return;
    }
    if (items.length > 5) {
      setError('Maximum 5 items per order.');
      return;
    }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const cart = await apiFetch('/carts', {
        method: 'POST',
        body: JSON.stringify({
          childId: selectedYoungster.id,
          serviceDate,
          session,
        }),
      }, { skipAutoReload: true }) as { id: string };
      await apiFetch(`/carts/${cart.id}/items`, {
        method: 'PATCH',
        body: JSON.stringify({ items }),
      }, { skipAutoReload: true });
      const order = await apiFetch(`/carts/${cart.id}/submit`, {
        method: 'POST',
      }, { skipAutoReload: true }) as { id?: string };
      setMessage(`Created order ${order.id || ''} for ${selectedYoungster.first_name} ${selectedYoungster.last_name}.`.trim());
      setMenuItems([]);
      setQuantities({});
      setServiceDate(nextWeekdayIsoLocal());
      setSession('LUNCH');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed creating order');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="auth-form">
          <h1>Create Order</h1>
          <p className="auth-help">Admin can place a new order for any registered student.</p>
        </div>

        <div className="auth-form create-order-card">
          <div className="create-order-grid">
            <label>
              <span>School Filter</span>
              <select value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)} disabled={loadingYoungsters || submitting}>
                <option value="ALL">All schools</option>
                {schoolOptions.map((school) => (
                  <option key={school} value={school}>{school}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Search Student</span>
              <input
                type="text"
                placeholder="Name, username, school, grade"
                value={youngsterSearch}
                onChange={(e) => setYoungsterSearch(e.target.value)}
                disabled={loadingYoungsters || submitting}
              />
            </label>
            <label>
              <span>Service Date</span>
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} disabled={submitting} />
            </label>
            <label>
              <span>Session</span>
              <select value={session} onChange={(e) => setSession(e.target.value as SessionType)} disabled={submitting}>
                {activeSessions.map((s) => <option key={s} value={s}>{getSessionLabel(s)}</option>)}
              </select>
            </label>
            <label className="create-order-wide">
              <span>Student</span>
              <select value={selectedYoungsterId} onChange={(e) => setSelectedYoungsterId(e.target.value)} disabled={loadingYoungsters || submitting || visibleYoungsters.length === 0}>
                <option value="">Select student</option>
                {visibleYoungsters.map((row) => {
                  const grade = row.current_school_grade || row.registration_grade || '-';
                  return (
                    <option key={row.id} value={row.id}>
                      {row.first_name} {row.last_name} ({row.username}) · {row.school_name} · Grade {grade}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>

          <div className="create-order-actions">
            <button className="btn btn-outline" type="button" onClick={() => void loadYoungsters()} disabled={loadingYoungsters || submitting}>
              {loadingYoungsters ? 'Refreshing...' : 'Refresh Students'}
            </button>
            <button className="btn btn-outline" type="button" onClick={() => void onLoadMenu()} disabled={loadingMenu || submitting || !selectedYoungsterId}>
              {loadingMenu ? 'Loading Menu...' : 'Load Menu'}
            </button>
          </div>

          {selectedYoungster ? (
            <div className="create-order-summary">
              <strong>{selectedYoungster.first_name} {selectedYoungster.last_name}</strong>
              <small>{selectedYoungster.school_name} · Grade {selectedYoungster.current_school_grade || selectedYoungster.registration_grade || '-'}</small>
              <small>Username: {selectedYoungster.username}</small>
            </div>
          ) : null}

          {message ? <p className="auth-help" style={{ color: '#166534' }}>{message}</p> : null}
          {error ? <p className="auth-help" style={{ color: '#a10036' }}>{error}</p> : null}

          {menuItems.length === 0 ? (
            <p className="auth-help">Load menu items for the selected session, then select items to create the order.</p>
          ) : null}
        </div>

      </section>

      {menuItems.length > 0 ? (
        <div className="menu-flow-grid" style={{ width: 'min(1100px, 100%)', margin: '0 auto', padding: '0 1rem 1.5rem' }}>
          <div className="menu-search-section">
            <h3>Menu Section</h3>
            <div className="auth-form">
              {menuItems.map((item) => {
                const selected = Boolean(quantities[item.id]);
                const cardStyle = {
                  ...getSessionCardStyle(session),
                  ...(selected
                    ? {
                        borderColor: '#2f6f3e',
                        background: 'linear-gradient(180deg, #eefbe8 0%, #dcf4d3 100%)',
                        boxShadow: '0 0 0 2px rgba(47, 111, 62, 0.16)',
                      }
                    : {}),
                };
                return (
                  <label key={item.id} style={cardStyle}>
                    <SessionBadge session={session} />
                    <span><strong>{item.name}</strong> - {formatMoney(item.price)}</span>
                    {item.dish_category ? <small>Category: {formatDishCategoryLabel(item.dish_category)}</small> : null}
                    <small>Dietary: {formatDishDietaryTags(item)}</small>
                    {item.description ? <small>{item.description}</small> : null}
                    {item.nutrition_facts_text ? <small>{item.nutrition_facts_text}</small> : null}
                    {item.ingredients && item.ingredients.length > 0 ? <small>Ingredients: {item.ingredients.join(', ')}</small> : null}
                    <button className="btn btn-outline" type="button" onClick={() => onToggleItem(item.id)} disabled={submitting}>{selected ? 'Selected' : 'Add'}</button>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="menu-draft-section">
            <h3>Selected Items</h3>
            {selectedCount === 0 ? <p className="auth-help">No dishes selected. Use Add from Menu Section.</p> : (
              <div className="auth-form">
                {menuItems.filter((item) => quantities[item.id]).map((item) => (
                  <label key={item.id} style={{
                    ...getSessionCardStyle(session),
                    borderColor: '#2f6f3e',
                    background: 'linear-gradient(180deg, #eefbe8 0%, #dcf4d3 100%)',
                    boxShadow: '0 0 0 2px rgba(47, 111, 62, 0.16)',
                  }}>
                    <SessionBadge session={session} />
                    <span><strong>{item.name}</strong> - {formatMoney(item.price)}</span>
                    {item.dish_category ? <small>Category: {formatDishCategoryLabel(item.dish_category)}</small> : null}
                    <small>Dietary: {formatDishDietaryTags(item)}</small>
                    <button className="btn btn-outline" type="button" onClick={() => onToggleItem(item.id)} disabled={submitting}>Remove</button>
                  </label>
                ))}
                <div className="create-order-toolbar">
                  <small>{selectedCount} selected · Estimated total {formatMoney(estimatedTotal)}</small>
                </div>
                <button className="btn btn-primary" type="button" onClick={() => void onCreateOrder()} disabled={submitting || loadingMenu}>
                  {submitting ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div style={{ width: 'min(1100px, 100%)', margin: '0 auto', padding: '0 1rem' }}>
        <AdminReturnButton />
      </div>
      <style jsx>{`
        .create-order-card {
          display: grid;
          gap: 0.9rem;
        }
        .create-order-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .create-order-grid label {
          display: grid;
          gap: 0.3rem;
        }
        .create-order-grid span {
          font-weight: 600;
          color: #4f3a16;
        }
        .create-order-grid input,
        .create-order-grid select {
          width: 100%;
          padding: 0.65rem 0.75rem;
          border: 1px solid #d9ccb4;
          border-radius: 0.7rem;
          background: #fff;
        }
        .create-order-wide {
          grid-column: 1 / -1;
        }
        .create-order-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .create-order-summary {
          display: grid;
          gap: 0.15rem;
          padding: 0.8rem 0.9rem;
          border: 1px solid #ddcfb8;
          border-radius: 0.8rem;
          background: #fffaf2;
        }
        .create-order-summary small,
        .create-order-toolbar small {
          color: #5f5244;
        }
        .create-order-list {
          display: grid;
          gap: 0.65rem;
        }
        .create-order-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 0.75rem 0.85rem;
          border: 1px solid #ddcfb8;
          border-radius: 0.8rem;
          background: #fffaf2;
        }
        .create-order-row span {
          display: grid;
          gap: 0.15rem;
        }
        .create-order-row small {
          color: #5f5244;
        }
        .create-order-row input {
          width: 96px;
          padding: 0.5rem 0.6rem;
          border: 1px solid #c9b89e;
          border-radius: 0.55rem;
        }
        .create-order-submit {
          justify-content: flex-end;
        }
        @media (max-width: 720px) {
          .create-order-grid {
            grid-template-columns: 1fr;
          }
          .create-order-row {
            flex-direction: column;
            align-items: stretch;
          }
          .create-order-row input,
          .create-order-actions :global(.btn) {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
