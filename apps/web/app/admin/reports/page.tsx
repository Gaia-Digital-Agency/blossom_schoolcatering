'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type Revenue = {
  fromDate: string;
  toDate: string;
  totalRevenue: number;
  bySchool: Array<{ school_name: string; orders_count: number; total_revenue: number }>;
  bySession: Array<{ session: string; orders_count: number; total_revenue: number }>;
};
type Report = {
  totals: { date: string; orders: number; revenue: number };
  rows: Array<{ order_id: string; session: string; child_name: string; parent_name: string; school_name: string; total_price: number; order_status: string; delivery_status: string; billing_status: string }>;
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminReportsPage() {
  const [date, setDate] = useState(todayIsoLocal());
  const [from, setFrom] = useState(todayIsoLocal().slice(0, 8) + '01');
  const [to, setTo] = useState(todayIsoLocal());
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setError('');
    try {
      const [rev, rep] = await Promise.all([
        apiFetch(`/admin/revenue?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`) as Promise<Revenue>,
        apiFetch(`/admin/reports?date=${encodeURIComponent(date)}`) as Promise<Report>,
      ]);
      setRevenue(rev);
      setReport(rep);
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

        <h2>Revenue Dashboard</h2>
        <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Report Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
        <button className="btn btn-outline" type="button" onClick={() => window.print()}>Print Report</button>

        {revenue ? (
          <div className="auth-form">
            <label><strong>Total Revenue</strong><small>Rp {Number(revenue.totalRevenue).toLocaleString('id-ID')}</small></label>
            {revenue.bySchool.map((r) => (
              <label key={r.school_name}>
                <strong>{r.school_name}</strong>
                <small>Orders: {r.orders_count}</small>
                <small>Revenue: Rp {Number(r.total_revenue).toLocaleString('id-ID')}</small>
              </label>
            ))}
          </div>
        ) : null}

        <h2>Daily Printable Report</h2>
        {report ? (
          <div className="auth-form">
            <label>
              <strong>{report.totals.date}</strong>
              <small>Orders: {report.totals.orders}</small>
              <small>Revenue: Rp {Number(report.totals.revenue).toLocaleString('id-ID')}</small>
            </label>
            {report.rows.map((r) => (
              <label key={r.order_id}>
                <strong>{r.session} - {r.child_name}</strong>
                <small>Parent: {r.parent_name} | School: {r.school_name}</small>
                <small>Order: {r.order_id}</small>
                <small>Status: {r.order_status} | Delivery: {r.delivery_status} | Billing: {r.billing_status}</small>
                <small>Total: Rp {Number(r.total_price).toLocaleString('id-ID')}</small>
              </label>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
