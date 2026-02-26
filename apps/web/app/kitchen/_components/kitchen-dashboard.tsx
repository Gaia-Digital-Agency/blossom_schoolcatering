'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../../lib/auth';

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

export default function KitchenDashboard({ offsetDays, title }: { offsetDays: number; title: string }) {
  const [data, setData] = useState<KitchenData | null>(null);
  const [error, setError] = useState('');
  const serviceDate = useMemo(() => dateInMakassar(offsetDays), [offsetDays]);

  const apiFetch = async (path: string, init?: RequestInit) => {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) throw new Error('Please login first.');
    let res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) throw new Error('Session expired. Please log in again.');
      token = refreshed;
      res = await fetch(`${getApiBase()}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = Array.isArray(body.message) ? body.message.join(', ') : body.message;
      throw new Error(msg || 'Request failed');
    }
    return res.json();
  };

  const load = async () => {
    setError('');
    try {
      const out = await apiFetch(`/kitchen/daily-summary?date=${encodeURIComponent(serviceDate)}`) as KitchenData;
      setData(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading kitchen summary');
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
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p className="auth-help">Auto refresh every 60 minutes during 05:00-21:00 (Asia/Makassar). Service date: {serviceDate}</p>
        <div className="dev-links">
          <Link href="/kitchen/yesterday">Yesterday</Link>
          <Link href="/kitchen/today">Today</Link>
          <Link href="/kitchen/tomorrow">Tomorrow</Link>
        </div>
        {error ? <p className="auth-error">{error}</p> : null}
        <button className="btn btn-outline" type="button" onClick={load}>Refresh Now</button>

        {data ? (
          <>
            <div className="admin-kpi-grid">
              <article className="admin-kpi-card"><h3>Total Orders</h3><p>{data.totals.totalOrders}</p></article>
              <article className="admin-kpi-card"><h3>Total Dishes</h3><p>{data.totals.totalDishes}</p></article>
              <article className="admin-kpi-card"><h3>Breakfast</h3><p>{data.totals.breakfastOrders}</p></article>
              <article className="admin-kpi-card"><h3>Snack</h3><p>{data.totals.snackOrders}</p></article>
              <article className="admin-kpi-card"><h3>Lunch</h3><p>{data.totals.lunchOrders}</p></article>
            </div>

            <h2>Allergen Alerts</h2>
            {data.allergenAlerts.length === 0 ? <p className="auth-help">No allergen-alert orders.</p> : (
              <div className="auth-form">
                {data.allergenAlerts.map((o) => (
                  <label key={o.id}>
                    <strong>{o.session} - {o.child_name}</strong>
                    <small>Parent: {o.parent_name}</small>
                    <small>Allergens: {o.allergen_items || '-'}</small>
                    <small>Dishes: {o.dish_count}</small>
                  </label>
                ))}
              </div>
            )}

            <h2>Orders</h2>
            {data.orders.length === 0 ? <p className="auth-help">No orders for this day.</p> : (
              <div className="auth-form">
                {data.orders.map((o) => (
                  <label key={o.id}>
                    <strong>{o.session} - {o.child_name}</strong>
                    <small>Parent: {o.parent_name}</small>
                    <small>Order: {o.id}</small>
                    <small>Status: {o.status} | Delivery: {o.delivery_status}</small>
                    <small>Dishes: {o.dish_count}</small>
                  </label>
                ))}
              </div>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
}
