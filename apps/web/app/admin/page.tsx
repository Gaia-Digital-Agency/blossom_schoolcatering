'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import AdminNav from './_components/admin-nav';

type OrdersDishes = {
  totalOrders: number;
  totalDishes: number;
};

type Dashboard = {
  date: string;
  parentsCount: number;
  youngstersCount: number;
  schoolsCount: number;
  deliveryPersonnelCount: number;
  delivery: {
    today: OrdersDishes;
    yesterday: OrdersDishes;
    tomorrow: OrdersDishes;
    pastWeek: OrdersDishes;
    pastMonth: OrdersDishes;
  };
  failedDeliveryByPerson: Array<{ delivery_person_name: string; orders_count: number }>;
  menu: {
    dishesTotalCreated: number;
    dishesTotalActive: number;
  };
  kitchen: {
    nextBlackoutDay: string | null;
    nextBlackoutType: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH' | null;
    nextBlackoutReason: string | null;
    upcomingBlackouts: Array<{
      blackoutDate: string;
      type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
      reason: string | null;
      affectedOrders: number;
    }>;
    serviceBlockedDatesWithOrders: Array<{
      blackoutDate: string;
      type: 'SERVICE_BLOCK' | 'BOTH';
      reason: string | null;
      affectedOrders: number;
    }>;
    yesterday: { ordersNotFulfilled: number; dishesNotFulfilled: number };
    pastWeek: { ordersNotFulfilled: number; dishesNotFulfilled: number };
  };
  billing: {
    yesterday: BillingPeriod;
    pastWeek: BillingPeriod;
    pastMonth: BillingPeriod;
  };
  pendingBillingCount: number;
  birthdayHighlights: Array<{ child_name: string; date_of_birth: string; days_until: number }>;
};

type BillingPeriod = {
  totalNumberBilling: number;
  totalValueBilling: number;
  totalNumberUnpaidNoProof: number;
  totalValueUnpaidNoProof: number;
};

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function asCurrency(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function AdminPage() {
  const [date, setDate] = useState(todayIsoLocal());
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await apiFetch(`/admin/dashboard?date=${date}`) as Dashboard;
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Dashboard</h1>
        <p className="auth-help">Overview and key operational metrics.</p>
        <AdminNav />

        <div className="auth-form admin-controls-card">
          <div className="admin-dashboard-controls">
            <label>
              Dashboard Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh Dashboard'}
            </button>
          </div>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        {data ? (
          <div className="auth-form admin-dashboard-block">
            <div className="kitchen-table-wrap admin-overview-wrap">
              <table className="kitchen-table admin-overview-table">
                <tbody>
                  <tr>
                    <th>Date</th>
                    <td>{data.date}</td>
                  </tr>
                  <tr className="section-row"><th colSpan={2}>PARENTS</th></tr>
                  <tr><th>Number of Youngsters</th><td>{data.youngstersCount}</td></tr>
                  <tr><th>Number of Parents</th><td>{data.parentsCount}</td></tr>
                  <tr><th>Number Of Schools</th><td>{data.schoolsCount}</td></tr>
                  <tr><th>Birthday Highlight (Today)</th><td>{(data.birthdayHighlights || []).map((b) => b.child_name).join(', ') || '-'}</td></tr>
                  <tr className="section-row"><th colSpan={2}>DELIVERY</th></tr>
                  <tr><th>Number of Delivery Person</th><td>{data.deliveryPersonnelCount}</td></tr>
                  <tr>
                    <th>Today</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.today.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.today.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Yesterday</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.yesterday.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.yesterday.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Tomorrow</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.tomorrow.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.tomorrow.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Past Week</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.pastWeek.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.pastWeek.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Past Month</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Total Orders: {data.delivery.pastMonth.totalOrders}</span>
                        <span className="metric-chip">Total Dishes: {data.delivery.pastMonth.totalDishes}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Yesterday Failed/Unchecked Delivery</th>
                    <td>
                      {(data.failedDeliveryByPerson || []).length === 0
                        ? '-'
                        : data.failedDeliveryByPerson.map((x) => `${x.delivery_person_name} (${x.orders_count})`).join(', ')}
                    </td>
                  </tr>
                  <tr className="section-row"><th colSpan={2}>MENU</th></tr>
                  <tr><th>Dishes Total Created</th><td>{data.menu.dishesTotalCreated}</td></tr>
                  <tr><th>Dishes Total Active</th><td>{data.menu.dishesTotalActive}</td></tr>
                  <tr className="section-row"><th colSpan={2}>KITCHEN</th></tr>
                  <tr>
                    <th>Next Blackout Day</th>
                    <td>
                      {data.kitchen.nextBlackoutDay
                        ? `${data.kitchen.nextBlackoutDay} (${data.kitchen.nextBlackoutType || '-'})`
                        : '-'}
                    </td>
                  </tr>
                  <tr>
                    <th>Next Blackout Reason</th>
                    <td>{data.kitchen.nextBlackoutReason || '-'}</td>
                  </tr>
                  <tr>
                    <th>Upcoming Blocked Dates (10)</th>
                    <td>
                      {(data.kitchen.upcomingBlackouts || []).length === 0
                        ? '-'
                        : data.kitchen.upcomingBlackouts
                          .map((row) => `${row.blackoutDate} ${row.type} affected=${row.affectedOrders}`)
                          .join(', ')}
                    </td>
                  </tr>
                  <tr>
                    <th>Service-Blocked Dates With Existing Orders</th>
                    <td>
                      {(data.kitchen.serviceBlockedDatesWithOrders || []).length === 0
                        ? 'No conflict'
                        : data.kitchen.serviceBlockedDatesWithOrders
                          .map((row) => `${row.blackoutDate} (${row.type}) orders=${row.affectedOrders}`)
                          .join(', ')}
                    </td>
                  </tr>
                  <tr>
                    <th>Orders Not Fulfilled From Kitchen</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.kitchen.yesterday.ordersNotFulfilled}</span>
                        <span className="metric-chip">Past Week: {data.kitchen.pastWeek.ordersNotFulfilled}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Dishes Not Fulfilled From Kitchen</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.kitchen.yesterday.dishesNotFulfilled}</span>
                        <span className="metric-chip">Past Week: {data.kitchen.pastWeek.dishesNotFulfilled}</span>
                      </div>
                    </td>
                  </tr>
                  <tr className="section-row"><th colSpan={2}>BILLING</th></tr>
                  <tr>
                    <th>Total Number Billing</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.billing.yesterday.totalNumberBilling}</span>
                        <span className="metric-chip">Past Week: {data.billing.pastWeek.totalNumberBilling}</span>
                        <span className="metric-chip">Past Month: {data.billing.pastMonth.totalNumberBilling}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Value Billing</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {asCurrency(data.billing.yesterday.totalValueBilling)}</span>
                        <span className="metric-chip">Past Week: {asCurrency(data.billing.pastWeek.totalValueBilling)}</span>
                        <span className="metric-chip">Past Month: {asCurrency(data.billing.pastMonth.totalValueBilling)}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Number Unpaid (Proof Not Provided)</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {data.billing.yesterday.totalNumberUnpaidNoProof}</span>
                        <span className="metric-chip">Past Week: {data.billing.pastWeek.totalNumberUnpaidNoProof}</span>
                        <span className="metric-chip">Past Month: {data.billing.pastMonth.totalNumberUnpaidNoProof}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <th>Total Value Unpaid (Proof Not Provided)</th>
                    <td>
                      <div className="metric-chip-row">
                        <span className="metric-chip">Yesterday: {asCurrency(data.billing.yesterday.totalValueUnpaidNoProof)}</span>
                        <span className="metric-chip">Past Week: {asCurrency(data.billing.pastWeek.totalValueUnpaidNoProof)}</span>
                        <span className="metric-chip">Past Month: {asCurrency(data.billing.pastMonth.totalValueUnpaidNoProof)}</span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : loading ? (
          <p className="auth-help">Loading dashboard...</p>
        ) : null}
      </section>
      <style jsx>{`
        .admin-dashboard-controls {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 0.6rem;
        }
        .admin-controls-card {
          margin-bottom: 0.9rem;
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-dashboard-controls label {
          display: grid;
          gap: 0.25rem;
        }
        .admin-dashboard-controls input {
          min-height: 2.3rem;
        }
        .admin-dashboard-block h2 {
          margin: 0.25rem 0;
        }
        .admin-dashboard-block {
          grid-template-columns: minmax(0, 1fr);
        }
        .admin-overview-wrap {
          margin-top: 0.1rem;
          width: 100%;
        }
        .admin-overview-table th,
        .admin-overview-table td {
          text-align: center;
          font-size: 0.92rem;
        }
        .admin-overview-table .section-row th {
          text-align: center;
          font-size: 0.82rem;
          letter-spacing: 0.06em;
          background: rgba(15, 23, 42, 0.08);
        }
        .metric-chip-row {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 0.35rem;
        }
        .metric-chip {
          display: inline-block;
          padding: 0.18rem 0.5rem;
          border: 1px solid rgba(15, 23, 42, 0.16);
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.1);
          white-space: nowrap;
        }
        @media (min-width: 860px) {
          .admin-dashboard-controls {
            grid-template-columns: 1fr auto;
            align-items: end;
          }
        }
      `}</style>
    </main>
  );
}
