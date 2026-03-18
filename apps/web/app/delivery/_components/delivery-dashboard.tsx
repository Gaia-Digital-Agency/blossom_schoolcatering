'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';

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
  daily_note?: string | null;
};

type DeliveryProfile = {
  username: string;
  displayName: string;
  role: string;
  phoneNumber?: string | null;
  email?: string | null;
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

export default function DeliveryDashboard({
  offsetDays,
  title,
  returnHref,
  dateMode = 'fixed',
  fixedDateLabel = 'Today',
}: {
  offsetDays: number;
  title: string;
  returnHref?: string;
  dateMode?: 'fixed' | 'select';
  fixedDateLabel?: string;
}) {
  const [rows, setRows] = useState<Assignment[]>([]);
  const [profile, setProfile] = useState<DeliveryProfile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(false);

  const yesterday = dateInMakassar(-1);
  const today = dateInMakassar(0);
  const tomorrow = dateInMakassar(1);
  const defaultServiceDate = dateInMakassar(offsetDays);
  const [selectedDate, setSelectedDate] = useState(defaultServiceDate);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const dateRows = await apiFetch(`/delivery/assignments?date=${encodeURIComponent(selectedDate)}`) as Assignment[];
      setRows(dateRows || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading assignments');
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
          <div><strong>Student Full Name:</strong> ${escapeHtml(row.child_name)}</div>
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

  useEffect(() => {
    setSelectedDate(defaultServiceDate);
  }, [defaultServiceDate]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [selectedDate]);

  useEffect(() => {
    let active = true;
    apiFetch(`/delivery/daily-note?date=${encodeURIComponent(selectedDate)}`)
      .then((row) => {
        if (!active) return;
        setNote(String((row as { note?: string | null })?.note || ''));
        setNoteState('idle');
      })
      .catch(() => {
        if (!active) return;
        setNote('');
        setNoteState('error');
      });
    return () => {
      active = false;
    };
  }, [selectedDate]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setNoteState('saving');
      try {
        await apiFetch(`/delivery/daily-note?date=${encodeURIComponent(selectedDate)}`, {
          method: 'PATCH',
          body: JSON.stringify({ note }),
        }, { skipAutoReload: true });
        setNoteState('saved');
      } catch {
        setNoteState('error');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [note, selectedDate]);

  useEffect(() => {
    apiFetch('/auth/me')
      .then((data) => setProfile(data as DeliveryProfile))
      .catch((e) => {
        if (e instanceof SessionExpiredError) return;
        setError((prev) => prev || (e instanceof Error ? e.message : 'Failed loading delivery profile'));
      });
  }, []);

  const onToggleComplete = async (assignmentId: string) => {
    setError('');
    setMessage('');
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
  const deliveryFirstName = (profile?.displayName || '').trim().split(/\s+/).filter(Boolean)[0] || '';

  return (
    <>
      <main className="page-auth page-auth-mobile delivery-page">
        <section className="auth-panel">
          <h1>{title}</h1>
          {deliveryFirstName ? <p className="module-login-label">Logged In as {deliveryFirstName}</p> : null}
          {message ? <p className="auth-help">{message}</p> : null}
          {error ? <p className="auth-error">{error}</p> : null}

          <div className="module-guide-card">
            💡 Mark Assigned deliveries by school. See assigned orders by service date.
          </div>

          <div className="delivery-user-card">
            <h2>Delivery User Info</h2>
            <div className="delivery-user-grid">
              <div>
                <span>Name</span>
                <strong>{profile?.displayName || '-'}</strong>
              </div>
              <div>
                <span>Username</span>
                <strong>{profile?.username || '-'}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{profile?.phoneNumber || '-'}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{profile?.email || '-'}</strong>
              </div>
            </div>
          </div>

          <div className="delivery-controls">
            <div className="delivery-date-picker-row">
              {dateMode === 'select' ? (
                <label className="delivery-control">
                  Service Date
                  <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                </label>
              ) : (
                <div className="delivery-fixed-date-card">
                  <span className="delivery-fixed-date-label">{fixedDateLabel}</span>
                  <strong>{selectedDate}</strong>
                </div>
              )}
              <button className="btn btn-outline" type="button" onClick={load} disabled={loading}>
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button className="btn btn-outline" type="button" onClick={onDownloadPdf}>
                Download PDF
              </button>
            </div>
            <label className="delivery-control delivery-note">
              Confirmation Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} />
              <small className="field-hint">
                {noteState === 'saving'
                  ? 'Saving...'
                  : noteState === 'saved'
                    ? `Saved for ${selectedDate}.`
                    : noteState === 'error'
                      ? 'Save failed.'
                      : `Autosaved daily for ${selectedDate}.`}
              </small>
            </label>
          </div>

          <div className="delivery-order-columns">
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
                          <small>Student Full Name: {row.child_name}</small>
                          <small>School: {row.school_name || '-'}</small>
                          <small>Phone Number: {row.youngster_mobile || '-'}</small>
                          <small>Dietary Allergies: {(row.allergen_items || '').trim() || '-'}</small>
                          <small>Status: {row.status} | Delivery: {row.delivery_status}</small>
                          <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                          <button className="btn btn-primary" type="button" onClick={() => onToggleComplete(row.id)}>
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
                          <small>Student Full Name: {row.child_name}</small>
                          <small>School: {row.school_name || '-'}</small>
                          <small>Phone Number: {row.youngster_mobile || '-'}</small>
                          <small>Dietary Allergies: {(row.allergen_items || '').trim() || '-'}</small>
                          <small>Status: {row.status} | Delivery: {row.delivery_status}</small>
                          <small>Dishes: {(row.dishes || []).map((dish) => `${dish.item_name} x${dish.quantity}`).join(', ') || '-'}</small>
                          <button className="btn btn-success" type="button" onClick={() => onToggleComplete(row.id)}>
                            Completed (Click to Undo)
                          </button>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
        <style jsx>{`
          .auth-panel > h1 {
            margin: 0;
            line-height: 1.05;
          }
          .module-login-label {
            margin: -0.25rem 0 0.25rem;
            font-size: 1rem;
            font-style: italic;
            font-weight: 800;
            color: #5d4e3a;
          }
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
          .delivery-user-card {
            background: #fffdf8;
            border: 1px solid #eadfc9;
            border-radius: 0.8rem;
            padding: 0.85rem 1rem;
            margin-bottom: 1rem;
          }
          .delivery-user-card h2 {
            margin: 0 0 0.75rem 0;
            font-size: 1rem;
          }
          .delivery-user-grid {
            display: grid;
            gap: 0.65rem;
          }
          .delivery-user-grid div {
            display: grid;
            gap: 0.15rem;
          }
          .delivery-user-grid span {
            font-size: 0.78rem;
            color: #7b6952;
          }
          .delivery-user-grid strong {
            font-size: 0.95rem;
            color: #2f2418;
            font-weight: 600;
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
          .delivery-fixed-date-card {
            border: 1px solid #d8cab1;
            border-radius: 0.7rem;
            background: #fffdf8;
            padding: 0.7rem 0.85rem;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 0.2rem;
            min-height: 100%;
          }
          .delivery-fixed-date-label {
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: #7a6652;
            white-space: nowrap;
          }
          .delivery-fixed-date-card strong {
            white-space: nowrap;
          }
          .delivery-note :global(.field-hint) {
            color: #7b6952;
          }
          .delivery-order-columns {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 1rem;
            align-items: start;
          }
          .delivery-order-columns .module-section {
            min-width: 0;
          }
          @media (min-width: 720px) {
            .delivery-user-grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .delivery-date-picker-row {
              grid-template-columns: 1fr auto auto;
              align-items: end;
            }
          }
          @media (max-width: 640px) {
            .delivery-order-columns {
              gap: 0.7rem;
            }
            .delivery-order-columns :global(.auth-form) {
              padding: 0.7rem;
            }
            .delivery-order-columns :global(label) {
              font-size: 0.8rem;
            }
          }
        `}</style>
      </main>
      <LogoutButton returnHref={returnHref} showRecord={false} showLogout={false} sticky={false} />
    </>
  );
}
