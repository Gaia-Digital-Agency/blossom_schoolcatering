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
        <p className="auth-help">CMS overview and key operational metrics.</p>
        <AdminNav />

        <div className="admin-dashboard-controls">
          <label>
            Dashboard Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Dashboard'}
          </button>
        </div>

        {error ? <p className="auth-error">{error}</p> : null}

        {data ? (
          <div className="auth-form admin-dashboard-block">
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr>
                    <th>Date</th>
                    <td>{data.date}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2>PARENTS/YOUNGSTER</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr><th>Number of Youngsters</th><td>{data.youngstersCount}</td></tr>
                  <tr><th>Number of Parents</th><td>{data.parentsCount}</td></tr>
                  <tr><th>Number Of Schools</th><td>{data.schoolsCount}</td></tr>
                  <tr><th>Birthday Highlight (Today)</th><td>{(data.birthdayHighlights || []).map((b) => b.child_name).join(', ') || '-'}</td></tr>
                </tbody>
              </table>
            </div>

            <h2>DELIVERY</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr><th>Number of Delivery Person</th><td>{data.deliveryPersonnelCount}</td></tr>
                  <tr><th>Today</th><td>Total Orders: {data.delivery.today.totalOrders}, Total Dishes: {data.delivery.today.totalDishes}</td></tr>
                  <tr><th>Yesterday</th><td>Total Orders: {data.delivery.yesterday.totalOrders}, Total Dishes: {data.delivery.yesterday.totalDishes}</td></tr>
                  <tr><th>Tomorrow</th><td>Total Orders: {data.delivery.tomorrow.totalOrders}, Total Dishes: {data.delivery.tomorrow.totalDishes}</td></tr>
                  <tr><th>Past Week</th><td>Total Orders: {data.delivery.pastWeek.totalOrders}, Total Dishes: {data.delivery.pastWeek.totalDishes}</td></tr>
                  <tr><th>Past Month</th><td>Total Orders: {data.delivery.pastMonth.totalOrders}, Total Dishes: {data.delivery.pastMonth.totalDishes}</td></tr>
                  <tr>
                    <th>Yesterday Failed/Unchecked Delivery</th>
                    <td>
                      {(data.failedDeliveryByPerson || []).length === 0
                        ? '-'
                        : data.failedDeliveryByPerson.map((x) => `${x.delivery_person_name} (${x.orders_count})`).join(', ')}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h2>MENU</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr><th>Dishes Total Created</th><td>{data.menu.dishesTotalCreated}</td></tr>
                  <tr><th>Dishes Total Active</th><td>{data.menu.dishesTotalActive}</td></tr>
                </tbody>
              </table>
            </div>

            <h2>KITCHEN</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr><th>Next Back Out Day</th><td>{data.kitchen.nextBlackoutDay || '-'}</td></tr>
                  <tr><th>Orders Not Fulfilled From Kitchen</th><td>Yesterday: {data.kitchen.yesterday.ordersNotFulfilled}, Past Week: {data.kitchen.pastWeek.ordersNotFulfilled}</td></tr>
                  <tr><th>Dishes Not Fulfilled From Kitchen</th><td>Yesterday: {data.kitchen.yesterday.dishesNotFulfilled}, Past Week: {data.kitchen.pastWeek.dishesNotFulfilled}</td></tr>
                </tbody>
              </table>
            </div>

            <h2>BILLING</h2>
            <div className="kitchen-table-wrap">
              <table className="kitchen-table">
                <tbody>
                  <tr>
                    <th>Total Number Billing</th>
                    <td>Yesterday: {data.billing.yesterday.totalNumberBilling}, Past Week: {data.billing.pastWeek.totalNumberBilling}, Past Month: {data.billing.pastMonth.totalNumberBilling}</td>
                  </tr>
                  <tr>
                    <th>Total Value Billing</th>
                    <td>Yesterday: {asCurrency(data.billing.yesterday.totalValueBilling)}, Past Week: {asCurrency(data.billing.pastWeek.totalValueBilling)}, Past Month: {asCurrency(data.billing.pastMonth.totalValueBilling)}</td>
                  </tr>
                  <tr>
                    <th>Total Number Unpaid (Proof Not Provided)</th>
                    <td>Yesterday: {data.billing.yesterday.totalNumberUnpaidNoProof}, Past Week: {data.billing.pastWeek.totalNumberUnpaidNoProof}, Past Month: {data.billing.pastMonth.totalNumberUnpaidNoProof}</td>
                  </tr>
                  <tr>
                    <th>Total Value Unpaid (Proof Not Provided)</th>
                    <td>Yesterday: {asCurrency(data.billing.yesterday.totalValueUnpaidNoProof)}, Past Week: {asCurrency(data.billing.pastWeek.totalValueUnpaidNoProof)}, Past Month: {asCurrency(data.billing.pastMonth.totalValueUnpaidNoProof)}</td>
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
          margin-bottom: 0.9rem;
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
