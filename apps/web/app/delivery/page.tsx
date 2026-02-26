'use client';

import { useEffect, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../lib/auth';

type Assignment = {
  id: string;
  order_id: string;
  service_date: string;
  session: string;
  child_name: string;
  parent_name: string;
  delivery_status: string;
  confirmed_at?: string | null;
};

function todayIsoLocal() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function DeliveryPage() {
  const [date, setDate] = useState(todayIsoLocal());
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');

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
    try {
      const data = await apiFetch(`/delivery/assignments?date=${date}`) as Assignment[];
      setRows(data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading assignments');
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onConfirm = async (assignmentId: string) => {
    setError(''); setMessage('');
    try {
      await apiFetch(`/delivery/assignments/${assignmentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ note: note || undefined }),
      });
      setMessage('Delivery confirmed. Billing delivery status updated.');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed confirm');
    }
  };

  const todaysRows = rows.filter((r) => r.service_date === date);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>My Deliveries</h1>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn btn-outline" type="button" onClick={load}>Refresh Assignments</button>
        <label>
          Confirmation Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        {todaysRows.length === 0 ? <p className="auth-help">No assigned orders for this date.</p> : (
          <div className="auth-form">
            {todaysRows.map((row) => (
              <label key={row.id}>
                <strong>{row.service_date} {row.session}</strong>
                <small>Order: {row.order_id}</small>
                <small>Child: {row.child_name}</small>
                <small>Parent: {row.parent_name}</small>
                <small>Status: {row.delivery_status} | Confirmed: {row.confirmed_at || '-'}</small>
                <button className="btn btn-primary" type="button" onClick={() => onConfirm(row.id)} disabled={Boolean(row.confirmed_at)}>
                  {row.confirmed_at ? 'Completed' : 'Mark Complete'}
                </button>
              </label>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
