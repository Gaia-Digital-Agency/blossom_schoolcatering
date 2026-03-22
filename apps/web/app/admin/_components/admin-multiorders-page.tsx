'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import { getSessionLabel } from '../../../lib/session-theme';
import AdminNav from './admin-nav';
import AdminReturnButton from './admin-return-button';

type SessionType = 'BREAKFAST' | 'SNACK' | 'LUNCH';
type MultiOrderRow = {
  id: string;
  child_name: string;
  parent_name: string;
  session: SessionType;
  start_date: string;
  end_date: string;
  status: string;
  billing_status?: string;
  total_amount?: number;
  requests?: Array<{ id: string; request_type: string; status: string; reason: string }>;
};
type MultiOrderDetail = MultiOrderRow & {
  child_id: string;
  repeat_days_json?: number[];
  dish_selection_json?: Array<{ menuItemId: string; quantity: number }>;
  occurrences: Array<{ id: string; service_date: string; status: string; price_snapshot_total: number }>;
  requests: Array<{ id: string; request_type: string; status: string; reason: string }>;
};

function repeatDayLabel(day: number) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1] || String(day);
}

export default function AdminMultiOrdersPage() {
  const [rows, setRows] = useState<MultiOrderRow[]>([]);
  const [selected, setSelected] = useState<MultiOrderDetail | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [session, setSession] = useState<'ALL' | SessionType>('ALL');
  const [status, setStatus] = useState('ALL');
  const [replacementStart, setReplacementStart] = useState('');
  const [replacementEnd, setReplacementEnd] = useState('');
  const [replacementDays, setReplacementDays] = useState<number[]>([1, 3, 5]);

  const load = async () => {
    setError('');
    const query = new URLSearchParams();
    if (session !== 'ALL') query.set('session', session);
    if (status !== 'ALL') query.set('status', status);
    const data = await apiFetch(`/admin/multi-orders${query.toString() ? `?${query.toString()}` : ''}`) as MultiOrderRow[];
    setRows(data || []);
  };

  const loadDetail = async (groupId: string) => {
    const detail = await apiFetch(`/admin/multi-orders/${groupId}`) as MultiOrderDetail;
    setSelected(detail);
    setReplacementStart(detail.start_date);
    setReplacementEnd(detail.end_date);
    setReplacementDays(Array.isArray(detail.repeat_days_json) ? detail.repeat_days_json.map((value) => Number(value || 0)) : [1, 3, 5]);
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'Failed loading admin multi orders'));
  }, [session, status]);

  const openRequest = useMemo(
    () => selected?.requests?.find((request) => request.status === 'OPEN') || null,
    [selected],
  );

  const runAdminAction = async (task: () => Promise<void>, successMessage: string) => {
    setError('');
    setMessage('');
    try {
      await task();
      setMessage(successMessage);
      await load();
      if (selected?.id) await loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <div className="auth-form">
          <h1>Admin Multi Orders</h1>
          <AdminNav />
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="auth-form orders-filter-card">
          <div className="orders-filter-grid">
            <label>
              <span>Session</span>
              <select value={session} onChange={(e) => setSession(e.target.value as 'ALL' | SessionType)}>
                <option value="ALL">All Sessions</option>
                <option value="BREAKFAST">Breakfast</option>
                <option value="SNACK">Snack</option>
                <option value="LUNCH">Lunch</option>
              </select>
            </label>
            <label>
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PARTIALLY_CHANGED">PARTIALLY_CHANGED</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </label>
            <button className="btn btn-outline" type="button" onClick={() => load().catch(() => undefined)}>Refresh</button>
          </div>
        </div>

        <div className="multiorder-admin-grid">
          <div className="auth-form">
            {rows.map((row) => (
              <article key={row.id} className="multi-card">
                <strong>{row.child_name}</strong>
                <p>{row.parent_name} · {getSessionLabel(row.session)}</p>
                <p>{row.start_date} to {row.end_date}</p>
                <p>Status: {row.status} · Billing: {row.billing_status || '-'}</p>
                <button className="btn btn-outline" type="button" onClick={() => loadDetail(row.id)}>Open</button>
              </article>
            ))}
          </div>

          <div className="auth-form">
            {selected ? (
              <>
                <h2>{selected.child_name}</h2>
                <p>{selected.parent_name} · {getSessionLabel(selected.session)}</p>
                <p>Repeat: {(selected.repeat_days_json || []).map(repeatDayLabel).join(', ') || '-'}</p>
                <div className="occurrence-grid">
                  {selected.occurrences.map((occurrence) => (
                    <span key={occurrence.id} className="date-chip">{occurrence.service_date} · {occurrence.status}</span>
                  ))}
                </div>

                <div className="card-actions">
                  <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                    await apiFetch(`/admin/multi-orders/${selected.id}/future-trim`, { method: 'PATCH' }, { skipAutoReload: true });
                  }, 'Future occurrences trimmed.')}>Trim Future</button>
                  <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                    await apiFetch(`/admin/multi-orders/${selected.id}/billing/verify`, {
                      method: 'POST',
                      body: JSON.stringify({ decision: 'VERIFIED' }),
                    }, { skipAutoReload: true });
                  }, 'Grouped billing verified.')}>Verify Billing</button>
                  <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                    await apiFetch(`/admin/multi-orders/${selected.id}/receipt`, { method: 'POST' }, { skipAutoReload: true });
                  }, 'Receipt generated.')}>Generate Receipt</button>
                </div>

                {openRequest ? (
                  <div className="module-guide-card">
                    <p><strong>Open Request:</strong> {openRequest.request_type} · {openRequest.reason}</p>
                    <div className="card-actions">
                      <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                        await apiFetch(`/admin/multi-orders/${selected.id}/resolve-request`, {
                          method: 'POST',
                          body: JSON.stringify({ decision: 'APPROVE_DELETE' }),
                        }, { skipAutoReload: true });
                      }, 'Request approved as future delete.')}>Approve Delete</button>
                      <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                        await apiFetch(`/admin/multi-orders/${selected.id}/resolve-request`, {
                          method: 'POST',
                          body: JSON.stringify({ decision: 'APPROVE_CHANGE' }),
                        }, { skipAutoReload: true });
                      }, 'Request approved as replacement change.')}>Approve Change</button>
                      <button className="btn btn-outline" type="button" onClick={() => runAdminAction(async () => {
                        await apiFetch(`/admin/multi-orders/${selected.id}/resolve-request`, {
                          method: 'POST',
                          body: JSON.stringify({ decision: 'REJECT', note: 'Rejected by admin.' }),
                        }, { skipAutoReload: true });
                      }, 'Request rejected.')}>Reject</button>
                    </div>
                  </div>
                ) : null}

                <div className="module-guide-card">
                  <h3>Create Replacement</h3>
                  <label>
                    Start Date
                    <input type="date" value={replacementStart} onChange={(e) => setReplacementStart(e.target.value)} />
                  </label>
                  <label>
                    End Date
                    <input type="date" value={replacementEnd} onChange={(e) => setReplacementEnd(e.target.value)} />
                  </label>
                  <div className="card-actions">
                    {[1, 2, 3, 4, 5].map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={replacementDays.includes(day) ? 'step-pill active' : 'step-pill'}
                        onClick={() => setReplacementDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b))}
                      >
                        {repeatDayLabel(day)}
                      </button>
                    ))}
                  </div>
                  <button className="btn btn-primary" type="button" onClick={() => runAdminAction(async () => {
                    await apiFetch(`/admin/multi-orders/${selected.id}/replacement`, {
                      method: 'POST',
                      body: JSON.stringify({
                        childId: selected.child_id,
                        session: selected.session,
                        startDate: replacementStart,
                        endDate: replacementEnd,
                        repeatDays: replacementDays.map((day) => repeatDayLabel(day).toUpperCase()),
                        items: selected.dish_selection_json || [],
                      }),
                    }, { skipAutoReload: true });
                  }, 'Replacement multi order created.')}>Create Replacement Group</button>
                </div>
              </>
            ) : (
              <p>Select a multi order to review.</p>
            )}
          </div>
        </div>

        <AdminReturnButton />
      </section>
      <style jsx>{`
        .multiorder-admin-grid {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) minmax(320px, 1.2fr);
          gap: 1rem;
        }
        .multi-card, .occurrence-grid, .card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .multi-card {
          border: 1px solid #eadcc9;
          border-radius: 1rem;
          padding: 0.8rem;
          display: grid;
          gap: 0.45rem;
        }
        .date-chip, .step-pill {
          border: 1px solid #d7c8b5;
          border-radius: 999px;
          padding: 0.35rem 0.75rem;
          background: #fffaf2;
        }
        .step-pill.active { background: #e8f4ea; border-color: #7ca486; }
      `}</style>
    </main>
  );
}
