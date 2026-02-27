'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';

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
  showOrderBoards = true,
}: {
  offsetDays: number;
  title: string;
  showOrderBoards?: boolean;
}) {
  const [data, setData] = useState<KitchenData | null>(null);
  const [error, setError] = useState('');
  const [completedOrderIds, setCompletedOrderIds] = useState<Set<string>>(new Set());
  const serviceDate = useMemo(() => dateInMakassar(offsetDays), [offsetDays]);
  const pendingOrders = useMemo(
    () => (data?.orders || []).filter((o) => !completedOrderIds.has(o.id)),
    [data?.orders, completedOrderIds],
  );
  const completedOrders = useMemo(
    () => (data?.orders || []).filter((o) => completedOrderIds.has(o.id)),
    [data?.orders, completedOrderIds],
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

  const onTogglePrepared = (orderId: string) => {
    setCompletedOrderIds((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
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

            {showOrderBoards ? (
              <>
                <h2>Allergen Alerts</h2>
                {data.allergenAlerts.length === 0 ? <p className="auth-help">No allergen-alert orders.</p> : (
                  <div className="kitchen-alert-grid">
                    {data.allergenAlerts.map((o) => (
                      <article className="kitchen-alert-card" key={o.id}>
                        <strong>{o.session} - {o.child_name}</strong>
                        <small>Parent: {o.parent_name}</small>
                        <small>Allergens: {o.allergen_items || '-'}</small>
                        <small>Dishes: {o.dish_count}</small>
                      </article>
                    ))}
                  </div>
                )}

                <h2>Orders</h2>
                {data.orders.length === 0 ? <p className="auth-help">No orders for this day.</p> : (
                  <div className="kitchen-order-columns">
                    <section>
                      <h3>Pending</h3>
                      {pendingOrders.length === 0 ? <p className="auth-help">No pending orders.</p> : (
                        <div className="kitchen-order-list">
                          {pendingOrders.map((o) => (
                            <button className="kitchen-order-card" key={o.id} type="button" onClick={() => onTogglePrepared(o.id)}>
                              <strong>{o.session} - {o.child_name}</strong>
                              <small>Parent: {o.parent_name}</small>
                              <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                              <small>Dishes: {o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-'}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                    <section>
                      <h3>Completed</h3>
                      {completedOrders.length === 0 ? <p className="auth-help">No completed orders.</p> : (
                        <div className="kitchen-order-list">
                          {completedOrders.map((o) => (
                            <button className="kitchen-order-card kitchen-order-card-complete" key={o.id} type="button" onClick={() => onTogglePrepared(o.id)}>
                              <strong>{o.session} - {o.child_name}</strong>
                              <small>Parent: {o.parent_name}</small>
                              <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                              <small>Dishes: {o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-'}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                )}
              </>
            ) : null}
          </>
        ) : null}
      </section>
      <style jsx>{`
        .kitchen-top-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: nowrap;
          overflow-x: auto;
          padding-bottom: 0.2rem;
        }
        .kitchen-top-actions :global(.btn) {
          white-space: nowrap;
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
        .kitchen-order-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 1rem;
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
  );
}
