'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type OrderRow = {
  order_id: string;
  service_date: string;
  session: string;
  status: string;
  delivery_status: string;
  total_price: number;
  school_name: string;
  child_name: string;
  account_name: string;
  delivery_name: string;
  billing_status: string;
  dishes: Array<{ item_name: string; quantity: number }>;
};

type AdminOrdersResponse = {
  filters: {
    schools: Array<{ id: string; name: string }>;
    deliveryUsers: Array<{ user_id: string; name: string }>;
  };
  outstanding: OrderRow[];
  completed: OrderRow[];
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return `Rp ${Number(value || 0).toLocaleString('id-ID')}`;
}

export default function AdminOrdersPage() {
  const [filterMode, setFilterMode] = useState<'ALL' | 'DATE' | 'SCHOOL' | 'DELIVERY'>('ALL');
  const [date, setDate] = useState(todayIsoLocal());
  const [schoolId, setSchoolId] = useState('ALL');
  const [deliveryUserId, setDeliveryUserId] = useState('ALL');
  const [data, setData] = useState<AdminOrdersResponse | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const query = new URLSearchParams();
      if (filterMode === 'DATE') query.set('date', date);
      if (filterMode === 'SCHOOL' && schoolId !== 'ALL') query.set('school_id', schoolId);
      if (filterMode === 'DELIVERY' && deliveryUserId !== 'ALL') query.set('delivery_user_id', deliveryUserId);
      const out = await apiFetch(`/admin/orders${query.toString() ? `?${query.toString()}` : ''}`) as AdminOrdersResponse;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading orders');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterMode]);

  const outstandingTotal = useMemo(
    () => (data?.outstanding || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    [data],
  );
  const completedTotal = useMemo(
    () => (data?.completed || []).reduce((sum, row) => sum + Number(row.total_price || 0), 0),
    [data],
  );

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="auth-form">
          <h1>Admin Orders</h1>
          <p className="auth-help">Outstanding orders on the left, completed orders on the right.</p>
          <AdminNav />
        </div>

        <div className="auth-form orders-filter-card">
          <div className="orders-filter-grid">
            <label>
              <span>Filter</span>
              <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as 'ALL' | 'DATE' | 'SCHOOL' | 'DELIVERY')}>
                <option value="ALL">All</option>
                <option value="DATE">By Date</option>
                <option value="SCHOOL">By School</option>
                <option value="DELIVERY">By Delivery</option>
              </select>
            </label>
            {filterMode === 'DATE' ? (
              <label>
                <span>Service Date</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
            ) : null}
            {filterMode === 'SCHOOL' ? (
              <label>
                <span>School</span>
                <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)}>
                  <option value="ALL">All schools</option>
                  {(data?.filters.schools || []).map((school) => (
                    <option key={school.id} value={school.id}>{school.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            {filterMode === 'DELIVERY' ? (
              <label>
                <span>Delivery</span>
                <select value={deliveryUserId} onChange={(e) => setDeliveryUserId(e.target.value)}>
                  <option value="ALL">All delivery</option>
                  {(data?.filters.deliveryUsers || []).map((user) => (
                    <option key={user.user_id} value={user.user_id}>{user.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="orders-filter-action">
              <button className="btn btn-outline" type="button" onClick={load}>Apply</button>
            </div>
          </div>
          {error ? <p className="auth-help" style={{ color: '#a10036' }}>{error}</p> : null}
        </div>

        <div className="admin-orders-columns">
          <div className="auth-form orders-column">
            <div className="orders-column-head">
              <h2>Outstanding</h2>
              <small>{data?.outstanding.length || 0} orders · {formatMoney(outstandingTotal)}</small>
            </div>
            <div className="orders-list">
              {(data?.outstanding || []).map((row) => (
                <article key={row.order_id} className="orders-card">
                  <strong>{row.child_name}</strong>
                  <small>{row.school_name}</small>
                  <small>{row.service_date} · {row.session}</small>
                  <small>Family/Student: {row.account_name}</small>
                  <small>Delivery: {row.delivery_name}</small>
                  <small>Status: {row.status} · {row.delivery_status}</small>
                  <small>Billing: {row.billing_status}</small>
                  <small>{formatMoney(row.total_price)}</small>
                  <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                </article>
              ))}
              {data && data.outstanding.length === 0 ? <p className="auth-help">No outstanding orders.</p> : null}
            </div>
          </div>

          <div className="auth-form orders-column">
            <div className="orders-column-head">
              <h2>Completed</h2>
              <small>{data?.completed.length || 0} orders · {formatMoney(completedTotal)}</small>
            </div>
            <div className="orders-list">
              {(data?.completed || []).map((row) => (
                <article key={row.order_id} className="orders-card orders-card-complete">
                  <strong>{row.child_name}</strong>
                  <small>{row.school_name}</small>
                  <small>{row.service_date} · {row.session}</small>
                  <small>Family/Student: {row.account_name}</small>
                  <small>Delivery: {row.delivery_name}</small>
                  <small>Status: {row.status} · {row.delivery_status}</small>
                  <small>Billing: {row.billing_status}</small>
                  <small>{formatMoney(row.total_price)}</small>
                  <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                </article>
              ))}
              {data && data.completed.length === 0 ? <p className="auth-help">No completed orders.</p> : null}
            </div>
          </div>
        </div>

        <AdminReturnButton />
      </section>
      <style jsx>{`
        .orders-filter-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
          align-items: end;
        }
        .orders-filter-action {
          display: flex;
          align-items: end;
        }
        .orders-filter-action :global(button) {
          width: 100%;
        }
        .admin-orders-columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 1rem;
        }
        @media (min-width: 980px) {
          .admin-orders-columns {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .orders-column {
          display: flex;
          flex-direction: column;
          gap: 0.8rem;
        }
        .orders-column-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.75rem;
        }
        .orders-column-head h2 {
          margin: 0;
        }
        .orders-list {
          display: grid;
          gap: 0.75rem;
        }
        .orders-card {
          display: grid;
          gap: 0.18rem;
          padding: 0.8rem;
          border: 1px solid #d9ccb4;
          border-radius: 0.8rem;
          background: #fffaf2;
        }
        .orders-card-complete {
          background: #f2fbf2;
          border-color: #bfd9bf;
        }
        .orders-card strong {
          color: #2f271d;
        }
        .orders-card small {
          color: #645647;
        }
      `}</style>
    </main>
  );
}
