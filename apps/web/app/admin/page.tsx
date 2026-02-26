'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../lib/auth';
import AdminNav from './_components/admin-nav';

type Dashboard = {
  date: string;
  parentsCount: number;
  youngstersCount: number;
  schoolsCount: number;
  deliveryPersonnelCount: number;
  todayOrdersCount: number;
  todayTotalDishes: number;
  totalSales: number;
  yesterdayFailedOrUncheckedDelivery: number;
  pendingBillingCount: number;
  birthdayHighlights: Array<{ child_name: string; date_of_birth: string; days_until: number }>;
};

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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

  const card = (label: string, value: string | number) => (
    <label>
      <strong>{label}</strong>
      <small>{value}</small>
    </label>
  );

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Dashboard</h1>
        <p className="auth-help">CMS overview and key operational metrics.</p>
        <AdminNav />

        <label>
          Dashboard Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Dashboard'}
        </button>

        {error ? <p className="auth-error">{error}</p> : null}

        {data ? (
          <div className="auth-form">
            {card('Date', data.date)}
            {card('Number of Parents', data.parentsCount)}
            {card('Number of Youngsters', data.youngstersCount)}
            {card('Number of Schools', data.schoolsCount)}
            {card('Number of Delivery Personnel', data.deliveryPersonnelCount)}
            {card('Today Number of Orders', data.todayOrdersCount)}
            {card('Today Total Dishes', data.todayTotalDishes)}
            {card('Total Total Sales (IDR)', `Rp ${Number(data.totalSales).toLocaleString('id-ID')}`)}
            {card('Yesterday Failed/Unchecked Delivery', data.yesterdayFailedOrUncheckedDelivery)}
            {card('Pending Billing', data.pendingBillingCount)}
            <label>
              <strong>Birthday Highlights (30 days)</strong>
              <small>{data.birthdayHighlights?.length || 0} upcoming</small>
              <small>{(data.birthdayHighlights || []).map((b) => `${b.child_name} (${b.days_until}d)`).join(', ') || '-'}</small>
            </label>
          </div>
        ) : loading ? (
          <p className="auth-help">Loading dashboard...</p>
        ) : null}
      </section>
    </main>
  );
}
