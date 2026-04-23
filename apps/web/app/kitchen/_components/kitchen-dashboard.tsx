'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { getSessionLabel } from '../../../lib/session-theme';
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
  school_grade?: string;
  child_name: string;
  youngster_mobile?: string | null;
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
    totalOrdersComplete: number;
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


export default function KitchenDashboard({
  offsetDays,
  title,
  returnHref,
  dateMode = 'fixed',
  fixedDateLabel = 'Today',
}: {
  offsetDays: number;
  title: string;
  returnHref?: string;
  dateMode?: 'fixed' | 'select';
  fixedDateLabel?: string;
}) {
  const [data, setData] = useState<KitchenData | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submittingOrderId, setSubmittingOrderId] = useState('');
  const [sessionFilter, setSessionFilter] = useState<'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH'>('ALL');
  const defaultServiceDate = useMemo(() => dateInMakassar(offsetDays), [offsetDays]);
  const [selectedDate, setSelectedDate] = useState(defaultServiceDate);
  const completedStatuses = useMemo(() => new Set(['OUT_FOR_DELIVERY', 'DELIVERED']), []);
  const sessionFilteredOrders = useMemo(
    () => (data?.orders || []).filter((o) => sessionFilter === 'ALL' || String(o.session || '').toUpperCase() === sessionFilter),
    [data?.orders, sessionFilter],
  );
  const filteredAlerts = useMemo(
    () => (data?.allergenAlerts || []).filter((o) => sessionFilter === 'ALL' || String(o.session || '').toUpperCase() === sessionFilter),
    [data?.allergenAlerts, sessionFilter],
  );
  const pendingOrders = useMemo(
    () => sessionFilteredOrders.filter((o) => !completedStatuses.has(String(o.delivery_status || '').toUpperCase())),
    [sessionFilteredOrders, completedStatuses],
  );
  const completedOrders = useMemo(
    () => sessionFilteredOrders.filter((o) => completedStatuses.has(String(o.delivery_status || '').toUpperCase())),
    [sessionFilteredOrders, completedStatuses],
  );

  const load = async () => {
    setError('');
    try {
      const out = await apiFetch(`/kitchen/daily-summary?date=${encodeURIComponent(selectedDate)}`) as KitchenData;
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

  const onDownloadPdf = () => {
    if (!data) return;
    const allOrders = sessionFilteredOrders;
    if (allOrders.length === 0) {
      setMessage('No orders available to export.');
      return;
    }

    const escapeHtml = (value: string) => value.replace(/[&<>\"']/g, (char) => {
      const entityMap: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#39;',
      };
      return entityMap[char] || char;
    });

    const formatDishes = (o: KitchenOrder) => o.dishes.map((d) => `${d.item_name} x${d.quantity}`).join(', ') || '-';
    const perColumn = Math.ceil(allOrders.length / 2);
    const columns = [
      allOrders.slice(0, perColumn),
      allOrders.slice(perColumn),
    ];

    const renderOrder = (o: KitchenOrder) => `
      <article class=\"order-card\">
        <div><strong>Session:</strong> ${escapeHtml(getSessionLabel(o.session))}</div>
        <div><strong>Student:</strong> ${escapeHtml(o.child_name)}</div>
        <div><strong>Grade:</strong> ${escapeHtml(o.school_grade || '-')}</div>
        <div><strong>School:</strong> ${escapeHtml(o.school_name || '-')}</div>
        <div><strong>Phone Number:</strong> ${escapeHtml(o.youngster_mobile || '-')}</div>
        <div><strong>Dietary Allergies:</strong> ${escapeHtml(o.allergen_items || '-')}</div>
        <div><strong>Status:</strong> ${escapeHtml(`${o.status} | Delivery: ${o.delivery_status}`)}</div>
        <div><strong>Dishes:</strong> ${escapeHtml(formatDishes(o))}</div>
      </article>
    `;

    const html = `
      <!doctype html>
      <html>
      <head>
        <meta charset=\"utf-8\" />
        <title>Kitchen Orders ${escapeHtml(data.serviceDate)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; color: #2f2418; }
          h1 { margin: 0 0 12px 0; font-size: 18px; }
          .two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .col { display: grid; gap: 8px; align-content: start; }
          .order-card { border: 1px solid #d8c6aa; border-radius: 8px; padding: 8px; font-size: 12px; line-height: 1.35; }
          @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }
          @media print { body { margin: 10mm; } }
        </style>
      </head>
      <body>
        <h1>Kitchen Orders - ${escapeHtml(data.serviceDate)}</h1>
        <div class=\"two-col\">
          ${columns.map((col) => `<section class=\"col\">${col.map(renderOrder).join('')}</section>`).join('')}
        </div>
      </body>
      </html>
    `;

    // Print through hidden iframe to avoid popup blockers.
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);

    const doc = frame.contentWindow?.document;
    if (!doc || !frame.contentWindow) {
      document.body.removeChild(frame);
      setError('Failed to initialize print view.');
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    window.setTimeout(() => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      window.setTimeout(() => {
        if (frame.parentNode) frame.parentNode.removeChild(frame);
      }, 500);
    }, 120);
  };

  useEffect(() => {
    setSelectedDate(defaultServiceDate);
  }, [defaultServiceDate]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  return (
    <>
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>{title}</h1>
        {returnHref ? (
          <a className="module-return-link" href={returnHref}>← Return to Kitchen</a>
        ) : null}
        <div className="module-guide-card">
          💡 See Orders and Summary, Allergens, Mark ordered as prepared, print order tags. Press Refresh Button for latest updates.
        </div>
        <div className="kitchen-date-picker-row">
          {dateMode === 'select' ? (
            <label className="kitchen-control">
              Service Date
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setMessage('');
                  setSelectedDate(e.target.value);
                }}
              />
            </label>
          ) : (
            <div className="kitchen-fixed-date-card">
              <span className="kitchen-fixed-date-label">{fixedDateLabel}</span>
              <strong>{selectedDate}</strong>
            </div>
          )}
          <label className="kitchen-control">
            Session
            <select value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value as 'ALL' | 'BREAKFAST' | 'SNACK' | 'LUNCH')}>
              <option value="ALL">All sessions</option>
              <option value="BREAKFAST">{getSessionLabel('BREAKFAST')}</option>
              <option value="SNACK">{getSessionLabel('SNACK')}</option>
              <option value="LUNCH">{getSessionLabel('LUNCH')}</option>
            </select>
          </label>
          <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
          <button className="btn btn-outline" type="button" onClick={onDownloadPdf}>Download PDF</button>
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
                      <th>Total Orders Complete</th>
                      <th>Total Dishes</th>
                      <th>Lunch</th>
                      <th>Snack</th>
                      <th>Breakfast</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{data.totals.totalOrders}</td>
                      <td>{data.totals.totalOrdersComplete}</td>
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
              {filteredAlerts.length === 0 ? <p className="auth-help">No dietary-alert orders.</p> : (
                <div className="kitchen-alert-grid">
                  {filteredAlerts.map((o) => (
                    <article className="kitchen-alert-card" key={o.id}>
                      <strong>{getSessionLabel(o.session)} - {o.child_name}</strong>
                      <small>Grade: {o.school_grade || '-'}</small>
                      <small>Family: {o.parent_name}</small>
                      <small>Dietary Allergies: {o.allergen_items || '-'}</small>
                      <small>Dishes: {o.dish_count}</small>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <div className="kitchen-section-card">
              <h2>Orders</h2>
              {sessionFilteredOrders.length === 0 ? <p className="auth-help">No orders for this day.</p> : (
                <div className="kitchen-order-columns">
                  <section className="kitchen-order-panel">
                    <h3>Order Pending</h3>
                    {pendingOrders.length === 0 ? <p className="auth-help">No pending orders.</p> : (
                      <div className="kitchen-order-list">
                        {pendingOrders.map((o) => (
                          <button className="kitchen-order-card" key={o.id} type="button" onClick={() => onMarkKitchenComplete(o.id)}>
                            <small>Session: {getSessionLabel(o.session)}</small>
                            <small>Student: {o.child_name}</small>
                            <small>Grade: {o.school_grade || '-'}</small>
                            <small>School: {o.school_name || '-'}</small>
                            <small>Phone Number: {o.youngster_mobile || '-'}</small>
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
                            <small>Session: {getSessionLabel(o.session)}</small>
                            <small>Student: {o.child_name}</small>
                            <small>Grade: {o.school_grade || '-'}</small>
                            <small>School: {o.school_name || '-'}</small>
                            <small>Phone Number: {o.youngster_mobile || '-'}</small>
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
        .module-return-link {
          display: inline-block;
          margin: 0 0 0.65rem 0;
          padding: 0.4rem 0.75rem;
          border: 1px solid #ccbda2;
          border-radius: 0.5rem;
          background: rgba(255, 253, 248, 0.88);
          color: #7a6a58;
          font-size: 0.82rem;
          text-decoration: none;
        }
        .module-return-link:hover {
          background: #fff0e0;
          border-color: #9e6b20;
          color: #5a3a10;
        }
        .module-guide-card {
          background: #fffbf4;
          border: 1px solid #e8d9c0;
          border-left: 3px solid #c8a96e;
          border-radius: 0.6rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          color: #6b5a43;
          margin-bottom: 0.75rem;
        }
        .auth-panel > h1 {
          margin: 0;
          line-height: 1.05;
        }
        .kitchen-date-picker-row {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.6rem;
          margin-bottom: 0.65rem;
          align-items: end;
        }
        .kitchen-control {
          margin: 0;
          border: 1px solid #d8cab1;
          border-radius: 0.7rem;
          background: #fffdf8;
          padding: 0.7rem 0.85rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.35rem;
          min-height: 100%;
        }
        .kitchen-control :global(select),
        .kitchen-control :global(input) {
          border: none;
          background: transparent;
          padding: 0;
          min-height: auto;
          box-shadow: none;
        }
        .kitchen-control :global(select:focus),
        .kitchen-control :global(input:focus) {
          outline: none;
        }
        .kitchen-fixed-date-card {
          border: 1px solid #d8cab1;
          border-radius: 0.7rem;
          background: #fffdf8;
          padding: 0.7rem 0.85rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 0.2rem;
          min-height: 100%;
        }
        .kitchen-fixed-date-label {
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #7a6652;
          white-space: nowrap;
        }
        .kitchen-fixed-date-card strong {
          white-space: nowrap;
        }
        .kitchen-date-picker-row :global(.btn) {
          width: 100%;
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
        }
        .kitchen-table th {
          white-space: nowrap;
        }
        .kitchen-table td {
          overflow-wrap: normal;
          word-break: normal;
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
    <LogoutButton
      returnHref={returnHref}
      showRecord={false}
      showLogout={!returnHref}
      sticky={false}
    />
    </>
  );
}
