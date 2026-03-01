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
  const [rows, setRows] = useState<Assignment[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const yesterday = dateInMakassar(-1);
  const today = dateInMakassar(0);
  const tomorrow = dateInMakassar(1);
  const [selectedDate, setSelectedDate] = useState(today);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [y, t, tom] = await Promise.all([
        apiFetch(`/delivery/assignments?date=${yesterday}`) as Promise<Assignment[]>,
        apiFetch(`/delivery/assignments?date=${today}`) as Promise<Assignment[]>,
        apiFetch(`/delivery/assignments?date=${tomorrow}`) as Promise<Assignment[]>,
      ]);
      const merged = [...(y || []), ...(t || []), ...(tom || [])];
      const deduped = Array.from(new Map(merged.map((row) => [row.id, row])).values());
      setRows(deduped);
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

  const pendingRows = rows.filter(
    (r) => !r.confirmed_at && [yesterday, today, tomorrow].includes(r.service_date) && r.service_date === selectedDate,
  );
  const completedRows = rows.filter(
    (r) => Boolean(r.confirmed_at) && [yesterday, today].includes(r.service_date) && r.service_date === selectedDate,
  );

  const pendingBySchool = pendingRows.reduce<Record<string, Assignment[]>>((acc, row) => {
    const key = row.school_name || 'Unassigned School';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});
  const completedBySchool = completedRows.reduce<Record<string, Assignment[]>>((acc, row) => {
    const key = row.school_name || 'Unassigned School';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  return (
    <>
    <main className="page-auth page-auth-mobile delivery-page">
      <section className="auth-panel">
        <h1>My Deliveries</h1>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="delivery-controls">
          <div className="delivery-control delivery-window">
            <small><strong>Visible windows:</strong> Pending ({yesterday}, {today}, {tomorrow}) · Completed ({yesterday}, {today})</small>
            <div className="delivery-window-actions">
              <button
                className={`btn ${selectedDate === yesterday ? 'btn-primary' : 'btn-outline'}`}
                type="button"
                onClick={() => setSelectedDate(yesterday)}
              >
                Yesterday
              </button>
              <button
                className={`btn ${selectedDate === today ? 'btn-primary' : 'btn-outline'}`}
                type="button"
                onClick={() => setSelectedDate(today)}
              >
                Today
              </button>
              <button
                className={`btn ${selectedDate === tomorrow ? 'btn-primary' : 'btn-outline'}`}
                type="button"
                onClick={() => setSelectedDate(tomorrow)}
              >
                Tomorrow
              </button>
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

        <div className="module-section">
          <h2>Order Pending ({pendingRows.length})</h2>
          {pendingRows.length === 0 ? <p className="auth-help">No pending orders in the window.</p> : (
            <div className="auth-form">
              {Object.entries(pendingBySchool).map(([schoolName, group]) => (
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
                        className="btn btn-primary"
                        type="button"
                        onClick={() => onToggleComplete(row.id)}
                      >
                        Mark Complete
                      </button>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="module-section">
          <h2>Order Completed ({completedRows.length})</h2>
          {completedRows.length === 0 ? <p className="auth-help">No completed orders in the window.</p> : (
            <div className="auth-form">
              {Object.entries(completedBySchool).map(([schoolName, group]) => (
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
                        className="btn btn-success"
                        type="button"
                        onClick={() => onToggleComplete(row.id)}
                      >
                        Completed (Click to Undo)
                      </button>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
    <LogoutButton />
    </>
  );
}
