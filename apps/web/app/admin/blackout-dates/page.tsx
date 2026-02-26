'use client';

import { FormEvent, useEffect, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type BlackoutDay = {
  id: string;
  blackout_date: string;
  type: 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH';
  reason?: string | null;
  created_at: string;
  created_by_username: string;
};

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminBlackoutDatesPage() {
  const [rows, setRows] = useState<BlackoutDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [blackoutDate, setBlackoutDate] = useState(todayIsoLocal());
  const [type, setType] = useState<'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH'>('BOTH');
  const [reason, setReason] = useState('');

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
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (fromDate) qs.set('from_date', fromDate);
      if (toDate) qs.set('to_date', toDate);
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      const data = await apiFetch(`/blackout-days${suffix}`) as BlackoutDay[];
      setRows(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading blackout dates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await apiFetch('/blackout-days', {
        method: 'POST',
        body: JSON.stringify({ blackoutDate, type, reason: reason || undefined }),
      });
      setMessage('Blackout date saved. Ordering rules now use this immediately.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed saving blackout date');
    }
  };

  const onDelete = async (id: string) => {
    if (!window.confirm('Delete this blackout date?')) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/blackout-days/${id}`, { method: 'DELETE' });
      setMessage('Blackout date deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting blackout date');
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Blackout Dates</h1>
        <AdminNav />
        <p className="auth-help">Manage blackout dates. Order placement checks these rules immediately.</p>

        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Blackout Date
            <input type="date" value={blackoutDate} onChange={(e) => setBlackoutDate(e.target.value)} required />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as 'ORDER_BLOCK' | 'SERVICE_BLOCK' | 'BOTH')}>
              <option value="ORDER_BLOCK">ORDER_BLOCK</option>
              <option value="SERVICE_BLOCK">SERVICE_BLOCK</option>
              <option value="BOTH">BOTH</option>
            </select>
          </label>
          <label>
            Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Public holiday / school event" />
          </label>
          <button className="btn btn-primary" type="submit">Save Blackout Date</button>
        </form>

        <h2>Filter</h2>
        <label>
          From Date
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>
        <label>
          To Date
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>
        <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh List'}
        </button>

        <h2>Blackout List</h2>
        {rows.length === 0 ? (
          <p className="auth-help">No blackout dates found.</p>
        ) : (
          <div className="auth-form">
            {rows.map((row) => (
              <label key={row.id}>
                <strong>{row.blackout_date} - {row.type}</strong>
                <small>Reason: {row.reason || '-'}</small>
                <small>Created by: {row.created_by_username}</small>
                <button className="btn btn-outline" type="button" onClick={() => onDelete(row.id)}>Delete</button>
              </label>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
