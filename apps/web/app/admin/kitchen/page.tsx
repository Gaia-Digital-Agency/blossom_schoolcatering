'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type KitchenDish = {
  menu_item_id: string;
  item_name: string;
  quantity: number;
};

type KitchenOrder = {
  id: string;
  service_date: string;
  session: string;
  status: string;
  delivery_status: string;
  child_name: string;
  parent_name: string;
  dish_count: number;
  has_allergen: boolean;
  allergen_items: string;
  dishes: KitchenDish[];
};

type KitchenData = {
  serviceDate: string;
  totals: {
    totalOrders: number;
    totalDishes: number;
    breakfastOrders: number;
    snackOrders: number;
    lunchOrders: number;
  };
  dishSummary: Array<{ name: string; quantity: number }>;
  allergenAlerts: KitchenOrder[];
  orders: KitchenOrder[];
};

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminKitchenPage() {
  const [serviceDate, setServiceDate] = useState(todayIsoLocal());
  const [data, setData] = useState<KitchenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Chef personal message
  const [chefMessage, setChefMessage] = useState('');
  const [chefMessageSaving, setChefMessageSaving] = useState(false);
  const [chefMessageStatus, setChefMessageStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const out = await apiFetch(`/kitchen/daily-summary?date=${encodeURIComponent(serviceDate)}`) as KitchenData;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading kitchen view');
    } finally {
      setLoading(false);
    }
  };

  const loadChefMessage = async () => {
    try {
      const result = await apiFetch('/admin/site-settings') as { chef_message: string };
      setChefMessage(result.chef_message ?? '');
    } catch {
      // non-critical
    }
  };

  const saveChefMessage = async () => {
    setChefMessageSaving(true);
    setChefMessageStatus('idle');
    try {
      await apiFetch('/admin/site-settings', { method: 'PATCH', body: JSON.stringify({ chef_message: chefMessage }) });
      setChefMessageStatus('saved');
      setTimeout(() => setChefMessageStatus('idle'), 3000);
    } catch {
      setChefMessageStatus('error');
    } finally {
      setChefMessageSaving(false);
    }
  };

  useEffect(() => {
    load();
    loadChefMessage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate]);

  const orders = useMemo(() => data?.orders || [], [data?.orders]);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Kitchen</h1>
        <AdminNav />
        <p className="auth-help">Read-only real-time Kitchen view for admin monitoring.</p>

        <div className="chef-message-card">
          <label className="chef-message-label">
            Chef Personal Message
            <span className="chef-message-sub">Shown on the homepage under "Chef Message"</span>
            <textarea
              rows={3}
              maxLength={500}
              value={chefMessage}
              onChange={(e) => { setChefMessage(e.target.value); setChefMessageStatus('idle'); }}
              placeholder="Write the chef's personal message shown on the homepage…"
            />
          </label>
          <div className="chef-message-footer">
            <span className="chef-message-count">{chefMessage.length}/500</span>
            {chefMessageStatus === 'saved' && <span className="chef-message-ok">✓ Saved</span>}
            {chefMessageStatus === 'error' && <span className="chef-message-err">✗ Failed to save</span>}
            <button className="btn btn-primary btn-sm" type="button" onClick={saveChefMessage} disabled={chefMessageSaving}>
              {chefMessageSaving ? 'Saving…' : 'Save Message'}
            </button>
          </div>
        </div>

        <div className="admin-kitchen-controls">
          <label>
            Service Date
            <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} />
          </label>
          <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        {data ? (
          <>
            <h2>Overview</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <thead>
                  <tr>
                    <th>Total Orders</th>
                    <th>Total Dishes</th>
                    <th>Lunch</th>
                    <th>Snack</th>
                    <th>Breakfast</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{data.totals.totalOrders}</td>
                    <td>{data.totals.totalDishes}</td>
                    <td>{data.totals.lunchOrders}</td>
                    <td>{data.totals.snackOrders}</td>
                    <td>{data.totals.breakfastOrders}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2>Summary</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <thead>
                  <tr>
                    <th>Dish</th>
                    <th>Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {data.dishSummary.length === 0 ? (
                    <tr><td colSpan={2}>No dishes yet.</td></tr>
                  ) : data.dishSummary.map((d) => (
                    <tr key={d.name}>
                      <td>{d.name}</td>
                      <td>{d.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="admin-kitchen-card">
              <h2>Dietary Alerts</h2>
              {data.allergenAlerts.length === 0 ? <p className="auth-help">No dietary-alert orders.</p> : (
                <div className="kitchen-alert-grid">
                  {data.allergenAlerts.map((o) => (
                    <article className="kitchen-alert-card" key={o.id}>
                      <strong>{o.session} - {o.child_name}</strong>
                      <small>Parent: {o.parent_name}</small>
                      <small>Dietary Allergies: {o.allergen_items || '-'}</small>
                      <small>Dishes: {o.dish_count}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="admin-kitchen-card">
              <h2>Orders</h2>
              {orders.length === 0 ? <p className="auth-help">No orders for this day.</p> : (
                <div className="kitchen-order-list">
                  {orders.map((o) => (
                    <article className="kitchen-order-card" key={o.id}>
                      <strong>{o.session} - {o.child_name}</strong>
                      <small>Parent: {o.parent_name}</small>
                      <small>Dietary Allergies: {o.allergen_items || '-'}</small>
                      <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                      <small>Dishes: {o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-'}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
      <style jsx>{`
        .chef-message-card {
          border: 1px solid #d4c4a8;
          border-radius: 7px;
          background: #fdf8f2;
          padding: 0.7rem 0.9rem;
          margin-bottom: 0.9rem;
          display: grid;
          gap: 0.4rem;
        }
        .chef-message-label {
          display: grid;
          gap: 0.2rem;
          font-size: 0.85rem;
          font-weight: 600;
        }
        .chef-message-sub {
          font-size: 0.76rem;
          font-weight: 400;
          color: #64748b;
          font-style: italic;
        }
        .chef-message-card textarea {
          resize: vertical;
          min-height: 5rem;
          padding: 0.5rem 0.65rem;
          font-size: 0.88rem;
          border: 1px solid rgba(15,23,42,0.18);
          border-radius: 6px;
          font-family: inherit;
          line-height: 1.5;
        }
        .chef-message-footer {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
        }
        .chef-message-count { font-size: 0.75rem; color: #64748b; }
        .chef-message-ok { font-size: 0.78rem; color: #16a34a; font-weight: 600; }
        .chef-message-err { font-size: 0.78rem; color: #dc2626; font-weight: 600; }
        .btn-sm { padding: 0.3rem 0.8rem; font-size: 0.82rem; min-height: unset; }
        .admin-kitchen-card {
          border: 1px solid #d6c8b0;
          border-radius: 0.7rem;
          background: #fffaf3;
          padding: 0.75rem;
          margin-bottom: 0.85rem;
        }
        .admin-kitchen-card h2 {
          margin-top: 0;
        }
        .admin-kitchen-controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.6rem;
          margin-bottom: 0.7rem;
        }
        .admin-kitchen-controls label {
          display: grid;
          gap: 0.25rem;
        }
        .kitchen-table-wrap {
          overflow-x: auto;
        }
        .kitchen-table {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid #e2d6c2;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 1rem;
        }
        .kitchen-table th,
        .kitchen-table td {
          border-bottom: 1px solid #efe7da;
          padding: 0.65rem;
          text-align: left;
        }
        .kitchen-table tbody tr:last-child td {
          border-bottom: none;
        }
        .kitchen-alert-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.6rem;
          margin-bottom: 1rem;
        }
        .kitchen-alert-card {
          border: 1px solid #e6d9c8;
          border-radius: 10px;
          background: #fff;
          padding: 0.65rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .kitchen-order-list {
          display: grid;
          gap: 0.55rem;
        }
        .kitchen-order-card {
          text-align: left;
          border: 1px solid #d4c2a7;
          border-radius: 10px;
          background: #fff;
          padding: 0.7rem;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        @media (min-width: 640px) {
          .kitchen-alert-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 860px) {
          .admin-kitchen-controls {
            grid-template-columns: 1fr auto;
            align-items: end;
          }
        }
      `}</style>
    </main>
  );
}
