'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../lib/auth';
import LogoutButton from '../_components/logout-button';

type Assignment = {
  id: string;
  order_id: string;
  service_date: string;
  session: string;
  school_name?: string;
  child_name: string;
  youngster_mobile?: string | null;
  parent_name: string;
  delivery_status: string;
  confirmed_at?: string | null;
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
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function DeliveryPage() {
  const [date, setDate] = useState(dateInMakassar(0));
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

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
      }) as { completed: boolean };
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
  const yesterday = dateInMakassar(-1);
  const today = dateInMakassar(0);
  const tomorrow = dateInMakassar(1);

  return (
    <>
    <main className="page-auth page-auth-mobile delivery-page">
      <section className="auth-panel">
        <h1>My Deliveries</h1>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="delivery-controls">
          <div className="delivery-control delivery-window">
            <small><strong>Date Window:</strong> Yesterday, Today, Tomorrow</small>
            <div className="delivery-window-actions">
              <button className="btn btn-outline" type="button" onClick={() => setDate(yesterday)}>Yesterday</button>
              <button className="btn btn-outline" type="button" onClick={() => setDate(today)}>Today</button>
              <button className="btn btn-outline" type="button" onClick={() => setDate(tomorrow)}>Tomorrow</button>
            </div>
          </div>
          <label className="delivery-control">
            Select Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
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
                    <small>Youngster Mobile: {row.youngster_mobile || '-'}</small>
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
    <LogoutButton />
    </>
  );
}
