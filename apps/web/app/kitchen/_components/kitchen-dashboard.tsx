'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

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
  school_name?: string;
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

function dateInMakassar(offsetDays = 0) {
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
  const base = new Date(Date.UTC(yyyy, mm - 1, dd));
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function nowMakassarHour() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Makassar',
    hour12: false,
    hour: '2-digit',
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'hour')?.value || '0');
}

function withinKitchenHours() {
  const hour = nowMakassarHour();
  return hour >= 5 && hour < 21;
}

export default function KitchenDashboard({
  offsetDays,
  title,
}: {
  offsetDays: number;
  title: string;
}) {
  const [data, setData] = useState<KitchenData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingOrderId, setSubmittingOrderId] = useState('');
  const serviceDate = useMemo(() => dateInMakassar(offsetDays), [offsetDays]);
  const completedStatuses = useMemo(() => new Set(['OUT_FOR_DELIVERY', 'ASSIGNED', 'DELIVERED']), []);
  const pendingOrders = useMemo(
    () => (data?.orders || []).filter((o) => !completedStatuses.has(String(o.delivery_status || '').toUpperCase())),
    [data?.orders, completedStatuses],
  );
  const completedOrders = useMemo(
    () => (data?.orders || []).filter((o) => completedStatuses.has(String(o.delivery_status || '').toUpperCase())),
    [data?.orders, completedStatuses],
  );

  const load = async () => {
    setError('');
    try {
      const out = await apiFetch(`/kitchen/daily-summary?date=${encodeURIComponent(serviceDate)}`) as KitchenData;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading kitchen summary');
    }
  };

  const onMarkKitchenComplete = async (orderId: string) => {
    setError('');
    setMessage('');
    setSubmittingOrderId(orderId);
    try {
      const out = await apiFetch(`/kitchen/orders/${orderId}/complete`, {
        method: 'POST',
      }) as { completed?: boolean; deliveryStatus?: string };
      if (out?.completed) {
        setMessage('Order moved to completed and assigned to delivery.');
      } else {
        setMessage('Order reverted to pending.');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed updating kitchen completion');
    } finally {
      setSubmittingOrderId('');
    }
  };

  useEffect(() => {
    load();
    const everyHour = window.setInterval(() => {
      if (withinKitchenHours()) load();
    }, 60 * 60 * 1000);
    return () => window.clearInterval(everyHour);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceDate]);

  return (
    <>
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p className="auth-help">Auto refresh every 60 minutes during 05:00-21:00 (Asia/Makassar). Service date: {serviceDate}</p>
        <div className="kitchen-top-actions">
          <Link className="btn btn-outline" href="/kitchen/yesterday">Yesterday</Link>
          <Link className="btn btn-outline" href="/kitchen/today">Today</Link>
          <Link className="btn btn-outline" href="/kitchen/tomorrow">Tomorrow</Link>
          <button className="btn btn-outline" type="button" onClick={load}>Refresh Now</button>
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {data ? (
          <>
            <div className="kitchen-section-card">
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
            </div>

            <div className="kitchen-section-card">
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
            </div>

            <div className="kitchen-section-card">
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

            <div className="kitchen-section-card">
              <h2>Orders</h2>
              {data.orders.length === 0 ? <p className="auth-help">No orders for this day.</p> : (
                <div className="kitchen-order-columns">
                  <section className="kitchen-order-panel">
                    <h3>Order Pending</h3>
                    {pendingOrders.length === 0 ? <p className="auth-help">No pending orders.</p> : (
                      <div className="kitchen-order-list">
                        {pendingOrders.map((o) => (
                          <button className="kitchen-order-card" key={o.id} type="button" onClick={() => onMarkKitchenComplete(o.id)}>
                            <strong>{o.session} - {o.child_name}</strong>
                            <small>School: {o.school_name || '-'}</small>
                            <small>Parent: {o.parent_name}</small>
                            <small>Dietary Allergies: {o.allergen_items || '-'}</small>
                            <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                            <small>Dishes: {o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-'}</small>
                            <span className="kitchen-card-action">
                              <span className="btn btn-primary">
                                {submittingOrderId === o.id ? 'Updating...' : 'Mark Kitchen Complete'}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="kitchen-order-panel">
                    <h3>Order Completed</h3>
                    {completedOrders.length === 0 ? <p className="auth-help">No completed orders.</p> : (
                      <div className="kitchen-order-list">
                        {completedOrders.map((o) => (
                          <button className="kitchen-order-card kitchen-order-card-complete" key={o.id} type="button" onClick={() => onMarkKitchenComplete(o.id)}>
                            <strong>{o.session} - {o.child_name}</strong>
                            <small>School: {o.school_name || '-'}</small>
                            <small>Parent: {o.parent_name}</small>
                            <small>Dietary Allergies: {o.allergen_items || '-'}</small>
                            <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                            <small>Dishes: {o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-'}</small>
                            <span className="kitchen-card-action">
                              <span className="btn btn-outline">
                                {submittingOrderId === o.id ? 'Updating...' : 'Revert to Pending'}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
      <style jsx>{`
        .kitchen-top-actions {
          display: flex;
          gap: 0.8rem;
          flex-wrap: wrap;
          overflow-x: hidden;
          padding-bottom: 0.35rem;
          margin-bottom: 0.35rem;
          max-width: 100%;
        }
        .kitchen-top-actions :global(.btn) {
          white-space: normal;
          min-height: 2.4rem;
          padding-inline: 0.95rem;
          border-radius: 0.65rem;
          max-width: 100%;
        }
        .kitchen-section-card {
          border: 1px solid #ddcfb8;
          border-radius: 0.8rem;
          background: #fffaf2;
          padding: 0.85rem;
          margin-bottom: 1rem;
        }
        .kitchen-section-card h2 {
          margin-top: 0;
          margin-bottom: 0.6rem;
        }
        .kitchen-table-wrap {
          overflow-x: hidden;
          max-width: 100%;
        }
        .kitchen-table {
          width: 100%;
          table-layout: fixed;
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
          overflow-wrap: anywhere;
          word-break: break-word;
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
        .kitchen-order-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
        }
        .kitchen-order-panel {
          border: 1px solid #ddcfb8;
          border-radius: 0.7rem;
          background: #fff;
          padding: 0.7rem;
        }
        .kitchen-order-panel h3 {
          margin-top: 0;
          margin-bottom: 0.5rem;
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
          cursor: pointer;
        }
        .kitchen-card-action {
          margin-top: 0.3rem;
          display: inline-flex;
        }
        .kitchen-order-card .btn {
          pointer-events: none;
        }
        .kitchen-order-card-complete {
          border-color: #7fb08a;
          background: #f1fbf3;
        }
        @media (min-width: 640px) {
          .kitchen-alert-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (min-width: 900px) {
          .kitchen-alert-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .kitchen-order-columns {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (min-width: 1200px) {
          .kitchen-alert-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }
        }
        @media (min-width: 1600px) {
          .kitchen-alert-grid {
            grid-template-columns: repeat(6, minmax(0, 1fr));
          }
        }
      `}</style>
    </main>
    <LogoutButton />
    </>
  );
}
