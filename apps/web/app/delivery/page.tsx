'use client';

import { useEffect, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../lib/auth';

type Assignment = {
  id: string;
  order_id: string;
  service_date: string;
  session: string;
  school_name?: string;
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
  const [loading, setLoading] = useState(false);

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
      const data = await apiFetch(`/delivery/assignments?date=${date}`) as Assignment[];
      setRows(data || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const onToggleComplete = async (assignmentId: string) => {
    setError(''); setMessage('');
    try {
      const out = await apiFetch(`/delivery/assignments/${assignmentId}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ note: note || undefined }),
      });
      setMessage(out?.completed ? 'Delivery marked complete.' : 'Delivery marked assigned again.');
      setNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed toggle');
    }
  };

  const todaysRows = rows.filter((r) => r.service_date === date);
  const rowsBySchool = todaysRows.reduce<Record<string, Assignment[]>>((acc, row) => {
    const key = row.school_name || 'Unassigned School';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const d = new Date(`${date}T00:00:00`);
  const prev = new Date(d); prev.setDate(d.getDate() - 1);
  const next = new Date(d); next.setDate(d.getDate() + 1);
  const toIso = (x: Date) => {
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };
  const prevDate = toIso(prev);
  const nextDate = toIso(next);

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>My Deliveries</h1>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="delivery-controls">
          <label className="delivery-control delivery-date">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="delivery-control delivery-window">
            <small><strong>Date Window:</strong> {prevDate} to {nextDate}</small>
            <div className="delivery-window-actions">
              <button className="btn btn-outline" type="button" onClick={() => setDate(prevDate)}>Past</button>
              <button className="btn btn-outline" type="button" onClick={() => setDate(todayIsoLocal())}>Today</button>
              <button className="btn btn-outline" type="button" onClick={() => setDate(nextDate)}>Future</button>
            </div>
          </div>
          <button className="btn btn-outline delivery-refresh" type="button" onClick={load} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh Assignments'}
          </button>
          <label className="delivery-control delivery-note">
            Confirmation Note (optional)
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>

        {todaysRows.length === 0 ? <p className="auth-help">No assigned orders for this date.</p> : (
          <div className="auth-form">
            {Object.entries(rowsBySchool).map(([schoolName, group]) => (
              <div key={schoolName} className="delivery-school-group">
                <h3 className="delivery-school-title">{schoolName}</h3>
                {group.map((row) => (
                  <label key={row.id}>
                    <strong>{row.service_date} {row.session}</strong>
                    <small>Order: {row.order_id}</small>
                    <small>Youngster: {row.child_name}</small>
                    <small>Parent: {row.parent_name}</small>
                    <small>Status: {row.delivery_status} | Confirmed: {row.confirmed_at || '-'}</small>
                    <button
                      className={`btn ${row.confirmed_at ? 'btn-success' : 'btn-primary'}`}
                      type="button"
                      onClick={() => onToggleComplete(row.id)}
                    >
                      {row.confirmed_at ? 'Completed (Click to Undo)' : 'Mark Complete'}
                    </button>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
