'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type Revenue = {
  fromDate: string;
  toDate: string;
  totalOrders: number;
  totalRevenue: number;
  filters: {
    schools: Array<{ id: string; name: string }>;
    deliveryUsers: Array<{ user_id: string; name: string }>;
    parents: Array<{ parent_id: string; name: string }>;
    sessions: string[];
    orderStatuses: string[];
    billingStatuses: string[];
    dishes: Array<{ dish_name: string }>;
  };
  bySchool: Array<{ school_name: string; orders_count: number; total_revenue: number }>;
  bySession: Array<{ session: string; orders_count: number; total_revenue: number }>;
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminReportsPage() {
  const [from, setFrom] = useState(todayIsoLocal().slice(0, 8) + '01');
  const [to, setTo] = useState(todayIsoLocal());
  const [day, setDay] = useState('ALL');
  const [month, setMonth] = useState('ALL');
  const [year, setYear] = useState('ALL');
  const [schoolId, setSchoolId] = useState('ALL');
  const [deliveryUserId, setDeliveryUserId] = useState('ALL');
  const [parentId, setParentId] = useState('ALL');
  const [session, setSession] = useState('ALL');
  const [dish, setDish] = useState('ALL');
  const [orderStatus, setOrderStatus] = useState('ALL');
  const [billingStatus, setBillingStatus] = useState('ALL');
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const q = new URLSearchParams({
        from,
        to,
        day,
        month,
        year,
        school_id: schoolId,
        delivery_user_id: deliveryUserId,
        parent_id: parentId,
        session,
        dish,
        order_status: orderStatus,
        billing_status: billingStatus,
      });
      const rev = await apiFetch(`/admin/revenue?${q.toString()}`) as Revenue;
      setRevenue(rev);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading reports');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Reports</h1>
        <AdminNav />
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="reports-card">
          <h2>Revenue Dashboard</h2>
          <div className="auth-form reports-filters-grid">
            <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label>Day
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                <option value="ALL">ALL</option>
                {Array.from({ length: 31 }, (_v, i) => String(i + 1)).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Month
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                <option value="ALL">ALL</option>
                {Array.from({ length: 12 }, (_v, i) => String(i + 1)).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>Year
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="ALL">ALL</option>
                {Array.from({ length: 5 }, (_v, i) => String(new Date().getFullYear() - i)).map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
            <label>School
              <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                <option value="ALL">ALL</option>
                {(revenue?.filters.schools || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>Delivery
              <select value={deliveryUserId} onChange={(e) => setDeliveryUserId(e.target.value)}>
                <option value="ALL">ALL</option>
                {(revenue?.filters.deliveryUsers || []).map((u) => <option key={u.user_id} value={u.user_id}>{u.name}</option>)}
              </select>
            </label>
            <label>Parent
              <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="ALL">ALL</option>
                {(revenue?.filters.parents || []).map((p) => <option key={p.parent_id} value={p.parent_id}>{p.name}</option>)}
              </select>
            </label>
            <label>Session
              <select value={session} onChange={(e) => setSession(e.target.value)}>
                {(revenue?.filters.sessions || ['ALL']).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>Dish
              <select value={dish} onChange={(e) => setDish(e.target.value)}>
                <option value="ALL">ALL</option>
                {(revenue?.filters.dishes || []).map((d) => <option key={d.dish_name} value={d.dish_name}>{d.dish_name}</option>)}
              </select>
            </label>
            <label>Order Status
              <select value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                {(revenue?.filters.orderStatuses || ['ALL']).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <label>Billing Status
              <select value={billingStatus} onChange={(e) => setBillingStatus(e.target.value)}>
                {(revenue?.filters.billingStatuses || ['ALL']).map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </label>
            <div className="reports-actions-row">
              <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
            </div>
          </div>

          {revenue ? (
            <div className="auth-form">
              <label>
                <strong>Total</strong>
                <small>Orders: {revenue.totalOrders}</small>
                <small>Revenue: Rp {Number(revenue.totalRevenue).toLocaleString('id-ID')}</small>
              </label>
              {revenue.bySchool.map((r) => (
                <label key={r.school_name}>
                  <strong>{r.school_name}</strong>
                  <small>Orders: {r.orders_count}</small>
                  <small>Revenue: Rp {Number(r.total_revenue).toLocaleString('id-ID')}</small>
                </label>
              ))}
              {revenue.bySession.map((r) => (
                <label key={r.session}>
                  <strong>{r.session}</strong>
                  <small>Orders: {r.orders_count}</small>
                  <small>Revenue: Rp {Number(r.total_revenue).toLocaleString('id-ID')}</small>
                </label>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <style jsx>{`
        .reports-card {
          border: 1px solid #ccbda2;
          border-radius: 0.75rem;
          background: #fffaf3;
          padding: 0.8rem;
        }
        .reports-card h2 {
          margin: 0 0 0.6rem 0;
        }
        .reports-filters-grid {
          margin-bottom: 0.75rem;
        }
        .reports-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          align-items: end;
        }
        .reports-actions-row :global(.btn) {
          min-width: 180px;
        }
        @media (min-width: 900px) {
          .reports-filters-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .reports-actions-row {
            grid-column: 1 / -1;
          }
        }
      `}</style>
    </main>
  );
}
