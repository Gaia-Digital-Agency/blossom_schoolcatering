'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../lib/auth';
import LogoutButton from '../_components/logout-button';

type Assignment = {
  id: string;
  order_id: string;
  service_date: string;
  session: string;
  status: string;
  school_name?: string;
  child_name: string;
  youngster_mobile?: string | null;
  allergen_items?: string | null;
  dishes: Array<{ item_name: string; quantity: number }>;
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

  const onShowSelectedDate = async () => {
    setLoading(true);
    setError('');
    try {
      const dateRows = await apiFetch(`/delivery/assignments?date=${encodeURIComponent(selectedDate)}`) as Assignment[];
      setRows(dateRows || []);
      setMessage(`Showing assigned orders for ${selectedDate}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading selected date assignments');
    } finally {
      setLoading(false);
    }
  };

  const onDownloadPdf = async () => {
    setError('');
    setMessage('');
    try {
      const dateRows = await apiFetch(`/delivery/assignments?date=${encodeURIComponent(selectedDate)}`) as Assignment[];
      const exportRows = dateRows || [];
      setRows(exportRows);
      if (exportRows.length === 0) {
        setMessage('No orders available to export for this service date.');
        return;
      }

      const escapeHtml = (value: string) => value.replace(/[&<>\"']/g, (char) => {
        const entityMap: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          '\'': '&#39;',
        };
        return entityMap[char] || char;
      });
      const formatDishes = (row: Assignment) =>
        (row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-';
      const perColumn = Math.ceil(exportRows.length / 2);
      const columns = [exportRows.slice(0, perColumn), exportRows.slice(perColumn)];
      const renderOrder = (row: Assignment) => `
        <article class=\"order-card\">
          <div><strong>Session:</strong> ${escapeHtml(row.session)}</div>
          <div><strong>Youngster Full Name:</strong> ${escapeHtml(row.child_name)}</div>
          <div><strong>School:</strong> ${escapeHtml(row.school_name || '-')}</div>
          <div><strong>Phone Number:</strong> ${escapeHtml(row.youngster_mobile || '-')}</div>
          <div><strong>Dietary Allergies:</strong> ${escapeHtml((row.allergen_items || '').trim() || '-')}</div>
          <div><strong>Status:</strong> ${escapeHtml(`${row.status} | Delivery: ${row.delivery_status}`)}</div>
          <div><strong>Dishes:</strong> ${escapeHtml(formatDishes(row))}</div>
        </article>
      `;
      const html = `
        <!doctype html>
        <html>
        <head>
          <meta charset=\"utf-8\" />
          <title>Delivery Orders ${escapeHtml(selectedDate)}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 16px; color: #2f2418; }
            h1 { margin: 0 0 12px 0; font-size: 18px; }
            .two-col { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
            .col { display: grid; gap: 8px; align-content: start; }
            .order-card { border: 1px solid #d8c6aa; border-radius: 8px; padding: 8px; font-size: 12px; line-height: 1.35; }
            @media (max-width: 800px) { .two-col { grid-template-columns: 1fr; } }
            @media print { body { margin: 10mm; } }
          </style>
        </head>
        <body>
          <h1>Delivery Orders - ${escapeHtml(selectedDate)}</h1>
          <div class=\"two-col\">
            ${columns.map((col) => `<section class=\"col\">${col.map(renderOrder).join('')}</section>`).join('')}
          </div>
        </body>
        </html>
      `;

      const frame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.right = '0';
      frame.style.bottom = '0';
      frame.style.width = '0';
      frame.style.height = '0';
      frame.style.border = '0';
      frame.setAttribute('aria-hidden', 'true');
      document.body.appendChild(frame);
      const doc = frame.contentWindow?.document;
      if (!doc || !frame.contentWindow) {
        document.body.removeChild(frame);
        setError('Failed to initialize print view.');
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
      window.setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        window.setTimeout(() => {
          if (frame.parentNode) frame.parentNode.removeChild(frame);
        }, 500);
      }, 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate delivery PDF');
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

  const pendingRows = rows.filter((r) => !r.confirmed_at && r.service_date === selectedDate);
  const completedRows = rows.filter((r) => Boolean(r.confirmed_at) && r.service_date === selectedDate);

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

        <div className="module-guide-card">
          💡 Mark Assigned deliveries by school. See Assigned Orders yesterday, today, tomorrow.
        </div>

        <div className="delivery-controls">
          <div className="delivery-date-row">
            <button className={`btn ${selectedDate === yesterday ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setSelectedDate(yesterday)}>Yesterday</button>
            <button className={`btn ${selectedDate === today ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setSelectedDate(today)}>Today</button>
            <button className={`btn ${selectedDate === tomorrow ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setSelectedDate(tomorrow)}>Tomorrow</button>
            <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
          </div>
          <div className="delivery-date-picker-row">
            <label className="delivery-control">
              Service Date
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </label>
            <button className="btn btn-outline" type="button" onClick={onShowSelectedDate} disabled={loading}>
              {loading ? 'Loading...' : 'Show Service Date'}
            </button>
            <button className="btn btn-outline" type="button" onClick={onDownloadPdf}>
              Download PDF
            </button>
          </div>
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
                      <strong>{row.service_date} | Session: {row.session}</strong>
                      <small>Youngster Full Name: {row.child_name}</small>
                      <small>School: {row.school_name || '-'}</small>
                      <small>Phone Number: {row.youngster_mobile || '-'}</small>
                      <small>Dietary Allergies: {(row.allergen_items || '').trim() || '-'}</small>
                      <small>Status: {row.status} | Delivery: {row.delivery_status}</small>
                      <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
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
                      <strong>{row.service_date} | Session: {row.session}</strong>
                      <small>Youngster Full Name: {row.child_name}</small>
                      <small>School: {row.school_name || '-'}</small>
                      <small>Phone Number: {row.youngster_mobile || '-'}</small>
                      <small>Dietary Allergies: {(row.allergen_items || '').trim() || '-'}</small>
                      <small>Status: {row.status} | Delivery: {row.delivery_status}</small>
                      <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
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
      <style jsx>{`
        .module-guide-card {
          background: #fffbf4;
          border: 1px solid #e8d9c0;
          border-left: 3px solid #c8a96e;
          border-radius: 0.6rem;
          padding: 0.6rem 0.85rem;
          font-size: 0.82rem;
          color: #6b5a43;
          margin-bottom: 1rem;
        }
        .delivery-date-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
          margin-bottom: 0.75rem;
        }
        .delivery-date-row .btn {
          flex: 1 1 auto;
        }
        .delivery-date-picker-row {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.4rem;
          margin-bottom: 0.75rem;
        }
        .delivery-date-picker-row .delivery-control {
          margin: 0;
        }
        @media (min-width: 720px) {
          .delivery-date-picker-row {
            grid-template-columns: 1fr auto auto;
            align-items: end;
          }
        }
      `}</style>
    </main>
    <LogoutButton />
    </>
  );
}
