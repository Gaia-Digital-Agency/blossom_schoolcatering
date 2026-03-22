'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiFetch } from '../../../lib/auth';
import LogoutButton from '../../_components/logout-button';
import { getSessionLabel } from '../../../lib/session-theme';

type SessionType = 'BREAKFAST' | 'SNACK' | 'LUNCH';
type Child = { id: string; first_name: string; last_name: string; school_grade?: string };
type SessionSetting = { session: SessionType; is_active: boolean };
type MenuItem = { id: string; name: string };
type MultiOrderItem = { menuItemId: string; quantity: number; itemNameSnapshot?: string; priceSnapshot?: number };
type MultiOrderGroup = {
  id: string;
  child_id: string;
  child_name: string;
  child_first_name?: string;
  child_gender?: string;
  parent_name?: string;
  session: SessionType;
  start_date: string;
  end_date: string;
  repeat_days_json?: number[];
  status: string;
  current_total_amount: number;
  occurrence_count: number;
  has_open_request?: boolean;
};
type MultiOrderDetail = MultiOrderGroup & {
  repeat_days_json?: number[];
  dish_selection_json?: MultiOrderItem[];
  occurrences: Array<{ id: string; service_date: string; status: string; price_snapshot_total: number }>;
  requests: Array<{ id: string; request_type: string; status: string; reason: string }>;
  can_edit: boolean;
  can_request_change: boolean;
};

function todayIsoLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function plusDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function repeatDayLabel(day: number) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1] || String(day);
}

function parseRepeatDays(raw?: unknown) {
  return Array.isArray(raw) ? raw.map((value) => Number(value || 0)).filter((value) => value > 0) : [];
}

function parseDishSelection(raw?: unknown) {
  return Array.isArray(raw) ? raw as MultiOrderItem[] : [];
}

function daysBetweenInclusive(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function formatDurationLabel(totalDays: number) {
  if (totalDays <= 7) return '1 week';
  if (totalDays <= 14) return '2 weeks';
  if (totalDays <= 21) return '3 weeks';
  if (totalDays <= 31) return '1 month';
  if (totalDays <= 62) return '2 months';
  if (totalDays <= 92) return '3 months';
  return `${Math.ceil(totalDays / 7)} weeks`;
}

function buildAiSummary(group: Pick<MultiOrderGroup, 'start_date' | 'end_date' | 'repeat_days_json'>) {
  const repeatDays = parseRepeatDays(group.repeat_days_json);
  const duration = formatDurationLabel(daysBetweenInclusive(group.start_date, group.end_date));
  if (repeatDays.length === 0) return `AI Generated Summary: Custom repeat order for ${duration}`;
  if (repeatDays.length === 1) {
    return `AI Generated Summary: Weekly order every ${repeatDayLabel(repeatDays[0])} for ${duration}`;
  }
  if (repeatDays.length >= 5 && repeatDays.slice(0, 5).join(',') === '1,2,3,4,5') {
    return `AI Generated Summary: Daily repeat order for ${duration}`;
  }
  if (repeatDays.length === 2) {
    return `AI Generated Summary: Weekly order every ${repeatDayLabel(repeatDays[0])} and ${repeatDayLabel(repeatDays[1])} for ${duration}`;
  }
  if (repeatDays.length === 3) {
    return `AI Generated Summary: Repeating order every ${repeatDayLabel(repeatDays[0])}, ${repeatDayLabel(repeatDays[1])}, and ${repeatDayLabel(repeatDays[2])} for ${duration}`;
  }
  return `AI Generated Summary: Custom weekly repeat on ${repeatDays.map(repeatDayLabel).join(', ')} for ${duration}`;
}

function getStudentHonorific(genderRaw?: string) {
  const gender = String(genderRaw || '').trim().toUpperCase();
  if (gender === 'MALE') return 'Master';
  if (gender === 'FEMALE') return 'Miss';
  return 'Student';
}

function getFirstName(name?: string, fallback?: string) {
  const fromField = String(name || '').trim();
  if (fromField) return fromField;
  const parts = String(fallback || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || 'Student';
}

function toTitleCase(value?: string) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '-';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function buildCardNarrative(group: MultiOrderGroup) {
  const honorific = getStudentHonorific(group.child_gender);
  const firstName = getFirstName(group.child_first_name, group.child_name);
  const summary = buildAiSummary(group).replace(/^AI Generated Summary:\s*/, '');
  return `${honorific} ${firstName} have an ${toTitleCase(group.status)} multi order ${getSessionLabel(group.session)} from ${group.start_date} to ${group.end_date}. The order is for ${summary}.`;
}

export default function FamilyMultiOrderPage() {
  const pathname = usePathname();
  const isStudentView = pathname.startsWith('/student');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<0 | 1 | 2 | 3>(1);
  const [children, setChildren] = useState<Child[]>([]);
  const [groups, setGroups] = useState<MultiOrderGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<MultiOrderDetail | null>(null);
  const [editingGroupId, setEditingGroupId] = useState('');
  const [sessionSettings, setSessionSettings] = useState<SessionSetting[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedChildId, setSelectedChildId] = useState('');
  const [session, setSession] = useState<SessionType>('LUNCH');
  const [startDate, setStartDate] = useState(plusDays(todayIsoLocal(), 1));
  const [endDate, setEndDate] = useState(plusDays(todayIsoLocal(), 14));
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [itemQty, setItemQty] = useState<Record<string, number>>({});
  const [requestType, setRequestType] = useState<'CHANGE' | 'DELETE'>('CHANGE');
  const [requestReason, setRequestReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeSessions = useMemo(
    () => (sessionSettings.length ? sessionSettings.filter((row) => row.is_active).map((row) => row.session) : ['LUNCH', 'SNACK', 'BREAKFAST']) as SessionType[],
    [sessionSettings],
  );

  const selectedItems = useMemo(
    () => Object.entries(itemQty)
      .filter(([, quantity]) => quantity > 0)
      .map(([menuItemId]) => ({ menuItemId, quantity: 1 })),
    [itemQty],
  );

  const reviewDates = useMemo(() => {
    const out: string[] = [];
    let current = startDate;
    while (current <= endDate) {
      const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
      const isoDow = weekday === 0 ? 7 : weekday;
      if (repeatDays.includes(isoDow)) out.push(current);
      current = plusDays(current, 1);
    }
    return out;
  }, [endDate, repeatDays, startDate]);

  const loadGroups = async () => {
    const data = await apiFetch('/multi-orders') as MultiOrderGroup[];
    setGroups(data || []);
  };

  const loadBase = async () => {
    const [settings, groupsData] = await Promise.all([
      apiFetch('/session-settings') as Promise<SessionSetting[]>,
      apiFetch('/multi-orders') as Promise<MultiOrderGroup[]>,
    ]);
    setSessionSettings(settings || []);
    setGroups(groupsData || []);
    if (isStudentView) {
      const me = await apiFetch('/children/me') as Child;
      setChildren(me ? [me] : []);
      if (me?.id) setSelectedChildId(me.id);
    } else {
      const childrenData = await apiFetch('/parent/me/children/pages') as { children: Child[] };
      setChildren(childrenData.children || []);
      if (childrenData.children?.[0]?.id) setSelectedChildId(childrenData.children[0].id);
    }
  };

  const loadMenu = async (targetSession: SessionType) => {
    const out = await apiFetch(`/menus?session=${targetSession}`) as { items: MenuItem[] };
    setMenuItems((out.items || []).map((item) => ({ id: item.id, name: item.name })));
  };

  const loadGroupDetail = async (groupId: string) => {
    const detail = await apiFetch(`/multi-orders/${groupId}`) as MultiOrderDetail;
    setSelectedGroup({
      ...detail,
      repeat_days_json: parseRepeatDays(detail.repeat_days_json),
      dish_selection_json: parseDishSelection(detail.dish_selection_json),
    });
  };

  useEffect(() => {
    loadBase()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed loading multi orders'))
      .finally(() => setLoading(false));
  }, [isStudentView]);

  useEffect(() => {
    loadMenu(session).catch(() => undefined);
  }, [session]);

  const resetBuilder = () => {
    setEditingGroupId('');
    setStep(1);
    setStartDate(plusDays(todayIsoLocal(), 1));
    setEndDate(plusDays(todayIsoLocal(), 14));
    setRepeatDays([]);
    setItemQty({});
    setRequestType('CHANGE');
    setRequestReason('');
  };

  const startEdit = async (groupId: string) => {
    await loadGroupDetail(groupId);
    const detail = await apiFetch(`/multi-orders/${groupId}`) as MultiOrderDetail;
    const days = parseRepeatDays(detail.repeat_days_json);
    const dishes = parseDishSelection(detail.dish_selection_json);
    setEditingGroupId(groupId);
    setSelectedChildId(detail.child_id);
    setSession(detail.session);
    setStartDate(detail.start_date);
    setEndDate(detail.end_date);
    setRepeatDays(days);
    setItemQty(Object.fromEntries(dishes.map((item) => [item.menuItemId, item.quantity && Number(item.quantity) > 0 ? 1 : 0])));
    setStep(1);
  };

  const toggleRepeatDay = (day: number) => {
    setRepeatDays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b));
  };

  const toggleMenuItem = (menuItemId: string) => {
    setItemQty((current) => ({
      ...current,
      [menuItemId]: current[menuItemId] ? 0 : 1,
    }));
  };

  const submitBuilder = async () => {
    if (!selectedChildId) { setError('Select a student first.'); return; }
    if (repeatDays.length === 0) { setError('Select at least one repeat day.'); return; }
    if (selectedItems.length === 0) { setError('Select at least one dish.'); return; }
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      if (editingGroupId) {
        await apiFetch(`/multi-orders/${editingGroupId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            startDate,
            endDate,
            repeatDays: repeatDays.map((day) => repeatDayLabel(day).toUpperCase()),
            items: selectedItems,
          }),
        }, { skipAutoReload: true });
        setMessage('Multi order updated.');
      } else {
        await apiFetch('/multi-orders', {
          method: 'POST',
          body: JSON.stringify({
            childId: selectedChildId,
            session,
            startDate,
            endDate,
            repeatDays: repeatDays.map((day) => repeatDayLabel(day).toUpperCase()),
            items: selectedItems,
          }),
        }, { skipAutoReload: true });
        setMessage('Multi order created.');
      }
      resetBuilder();
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed saving multi order');
    } finally {
      setSubmitting(false);
    }
  };

  const deleteGroup = async (groupId: string) => {
    if (!window.confirm('Delete this multi order before it starts?')) return;
    setError('');
    try {
      await apiFetch(`/multi-orders/${groupId}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage('Multi order deleted.');
      if (selectedGroup?.id === groupId) setSelectedGroup(null);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed deleting multi order');
    }
  };

  const submitRequest = async () => {
    if (!selectedGroup) return;
    if (!requestReason.trim()) { setError('Request reason is required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/multi-orders/${selectedGroup.id}/requests`, {
        method: 'POST',
        body: JSON.stringify({
          requestType,
          reason: requestReason.trim(),
          replacementPlan: requestType === 'CHANGE'
            ? {
                startDate,
                endDate,
                repeatDays: repeatDays.map((day) => repeatDayLabel(day).toUpperCase()),
                items: selectedItems,
              }
            : undefined,
        }),
      }, { skipAutoReload: true });
      setMessage('Admin request submitted.');
      setRequestReason('');
      await loadGroupDetail(selectedGroup.id);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed submitting request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <main className="page-auth page-auth-mobile"><section className="auth-panel"><h1>Multi Order</h1><p>Loading...</p></section></main>;
  }

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel multiorder-panel">
        <h1>{isStudentView ? 'Student Multi Order' : 'Family Multi Order'}</h1>
        <p className="auth-help">Plan repeated meal orders for one student and one session in one grouped action.</p>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="module-section">
          <div className="step-row">
            <button type="button" className={step === 0 ? 'step-pill active' : 'step-pill'} onClick={() => setStep(0)}>
              Guide
            </button>
            {[1, 2, 3].map((value) => (
              <button key={value} type="button" className={step === value ? 'step-pill active' : 'step-pill'} onClick={() => setStep(value as 1 | 2 | 3)}>
                Step {value}
              </button>
            ))}
          </div>

          {step === 0 ? (
            <div className="guide-card">
              <h2>Multi Order Guide</h2>
              <p>Multi Order lets one student create repeated meal orders in one setup instead of ordering each date manually.</p>
              <p><strong>Step 1:</strong> Choose the student, session, start date, end date, and repeat weekdays.</p>
              <p><strong>Step 2:</strong> Choose the dishes. Each dish can only be selected once, so no quantity dropdown is needed.</p>
              <p><strong>Step 3:</strong> Review the repeated dates and submit the grouped order.</p>
              <p><strong>Repeat by days:</strong> Turn on the weekdays you want, such as Monday, Wednesday, and Friday.</p>
              <p><strong>Repeat by week:</strong> Keep the same weekday pattern across multiple weeks by setting a longer end date.</p>
              <p><strong>Repeat by month:</strong> Extend the date range into the next month to continue the same pattern, up to the allowed booking limit.</p>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="auth-form">
              {!isStudentView && children.length > 0 ? (
                <label>
                  Student
                  <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>{child.first_name} {child.last_name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Session
                <select value={session} onChange={(e) => setSession(e.target.value as SessionType)}>
                  {activeSessions.map((value) => (
                    <option key={value} value={value}>{getSessionLabel(value)}</option>
                  ))}
                </select>
              </label>
              <label>
                Start Date
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </label>
              <label>
                End Date
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
              <div>
                <strong>Repeat Days</strong>
                <div className="repeat-grid">
                  {[1, 2, 3, 4, 5].map((day) => (
                    <button
                      key={day}
                      type="button"
                      className={repeatDays.includes(day) ? 'step-pill active' : 'step-pill'}
                      onClick={() => toggleRepeatDay(day)}
                    >
                      {repeatDayLabel(day)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="menu-pick-grid">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={itemQty[item.id] ? 'dish-pill active' : 'dish-pill'}
                  onClick={() => toggleMenuItem(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="auth-form">
              <p><strong>Session:</strong> {getSessionLabel(session)}</p>
              <p><strong>Date Range:</strong> {startDate} to {endDate}</p>
              <p><strong>Repeat:</strong> {repeatDays.length ? repeatDays.map(repeatDayLabel).join(', ') : '-'}</p>
              <p><strong>Dishes:</strong> {selectedItems.length}</p>
              <div className="date-chip-grid">
                {reviewDates.map((date) => <span key={date} className="date-chip">{date}</span>)}
              </div>
              <button className="btn btn-primary" type="button" onClick={submitBuilder} disabled={submitting}>
                {editingGroupId ? 'Update Multi Order' : 'Create Multi Order'}
              </button>
              {editingGroupId ? <button className="btn btn-outline" type="button" onClick={resetBuilder}>Cancel Edit</button> : null}
            </div>
          ) : null}
        </div>

        <div className="module-section">
          <h2>Existing Multi Orders</h2>
          <div className="multiorder-list">
            {groups.map((group) => (
              <article key={group.id} className="multiorder-card">
                <div>
                  <strong>{group.child_name}</strong>
                  <p>{buildCardNarrative(group)}</p>
                  <p>AI Generated Summary: {buildAiSummary(group).replace(/^AI Generated Summary:\s*/, '')}</p>
                  <p>Amount: Rp {Number(group.current_total_amount || 0).toLocaleString('id-ID')}</p>
                </div>
                <div className="card-actions">
                  <button className="btn btn-outline" type="button" onClick={() => loadGroupDetail(group.id)}>View</button>
                  {selectedGroup?.id === group.id && selectedGroup.can_edit ? <button className="btn btn-outline" type="button" onClick={() => startEdit(group.id)}>Edit</button> : null}
                  {selectedGroup?.id === group.id && selectedGroup.can_edit ? <button className="btn btn-outline" type="button" onClick={() => deleteGroup(group.id)}>Delete</button> : null}
                </div>
              </article>
            ))}
          </div>
        </div>

        {selectedGroup ? (
          <div className="multiorder-modal-backdrop" role="presentation" onClick={() => setSelectedGroup(null)}>
            <div className="multiorder-modal" role="dialog" aria-modal="true" aria-labelledby="multiorder-modal-title" onClick={(e) => e.stopPropagation()}>
              <div className="multiorder-modal-header">
                <h2 id="multiorder-modal-title">Multi Order Details</h2>
                <div className="multiorder-modal-actions">
                  {selectedGroup.can_edit ? <button className="btn btn-outline" type="button" onClick={() => startEdit(selectedGroup.id)}>Edit</button> : null}
                  {selectedGroup.can_edit ? <button className="btn btn-outline" type="button" onClick={() => deleteGroup(selectedGroup.id)}>Delete</button> : null}
                  <button className="btn btn-outline" type="button" onClick={() => setSelectedGroup(null)}>Close</button>
                </div>
              </div>
              <p><strong>{selectedGroup.child_name}</strong> · {getSessionLabel(selectedGroup.session)} · {selectedGroup.status}</p>
              <p><strong>Date Range:</strong> {selectedGroup.start_date} to {selectedGroup.end_date}</p>
              <p><strong>Repeat:</strong> {parseRepeatDays(selectedGroup.repeat_days_json).map(repeatDayLabel).join(', ') || '-'}</p>
              <p><strong>Amount:</strong> Rp {Number(selectedGroup.current_total_amount || 0).toLocaleString('id-ID')}</p>
              <div>
                <strong>Dishes</strong>
                <div className="modal-list">
                  {parseDishSelection(selectedGroup.dish_selection_json).map((dish) => (
                    <div key={dish.menuItemId} className="modal-list-item">
                      <span>{dish.itemNameSnapshot || dish.menuItemId}</span>
                      <span>Qty {Number(dish.quantity || 1)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <strong>Occurrences</strong>
                <div className="date-chip-grid">
                  {selectedGroup.occurrences.map((occurrence) => (
                    <span key={occurrence.id} className="date-chip">{occurrence.service_date} · {occurrence.status}</span>
                  ))}
                </div>
              </div>
              {selectedGroup.can_request_change ? (
                <div className="auth-form">
                  <label>
                    Request Type
                    <select value={requestType} onChange={(e) => setRequestType(e.target.value as 'CHANGE' | 'DELETE')}>
                      <option value="CHANGE">Change Future Plan</option>
                      <option value="DELETE">Delete Future Plan</option>
                    </select>
                  </label>
                  <label>
                    Reason
                    <textarea value={requestReason} onChange={(e) => setRequestReason(e.target.value)} rows={3} />
                  </label>
                  <button className="btn btn-primary" type="button" onClick={submitRequest} disabled={submitting}>Submit Admin Request</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <LogoutButton showRecord={false} sticky={false} />
      </section>
      <style jsx>{`
        .multiorder-panel { width: min(760px, 100%); gap: 1rem; }
        .step-row, .repeat-grid, .date-chip-grid, .card-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }
        .step-pill, .date-chip {
          border: 1px solid #d7c8b5;
          border-radius: 999px;
          padding: 0.45rem 0.8rem;
          background: #fffaf2;
        }
        .step-pill.active {
          background: #2f7a43;
          border-color: #2f7a43;
          color: #ffffff;
          box-shadow: 0 10px 24px rgba(47, 122, 67, 0.22);
        }
        .guide-card {
          display: grid;
          gap: 0.65rem;
          padding: 1rem;
          border: 1px solid #d7c8b5;
          border-radius: 1rem;
          background: #fffdf9;
        }
        .guide-card h2,
        .guide-card p {
          margin: 0;
        }
        .menu-pick-grid {
          display: grid;
          gap: 0.65rem;
        }
        .dish-pill {
          width: 100%;
          text-align: left;
          border: 1px solid #d7c8b5;
          border-radius: 0.9rem;
          padding: 0.85rem 1rem;
          background: #fffaf2;
          color: #3f3226;
        }
        .dish-pill.active {
          background: #2f7a43;
          border-color: #2f7a43;
          color: #ffffff;
          box-shadow: 0 10px 24px rgba(47, 122, 67, 0.18);
        }
        .multiorder-list {
          display: grid;
          gap: 0.75rem;
        }
        .multiorder-card {
          border: 1px solid #eadcc9;
          border-radius: 1rem;
          padding: 0.9rem;
          display: grid;
          gap: 0.6rem;
          background: #fffdf9;
        }
        .multiorder-modal-backdrop {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background: rgba(35, 28, 22, 0.45);
          z-index: 40;
        }
        .multiorder-modal {
          width: min(680px, 100%);
          max-height: min(88vh, 920px);
          overflow: auto;
          display: grid;
          gap: 0.85rem;
          padding: 1rem;
          border-radius: 1rem;
          border: 1px solid #eadcc9;
          background: #fffdf9;
          box-shadow: 0 24px 60px rgba(35, 28, 22, 0.18);
        }
        .multiorder-modal-header,
        .multiorder-modal-actions,
        .modal-list-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .multiorder-modal-header {
          justify-content: space-between;
        }
        .multiorder-modal-actions {
          justify-content: flex-end;
          flex-wrap: wrap;
        }
        .multiorder-modal-header h2 {
          margin: 0;
        }
        .modal-list {
          display: grid;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }
        .modal-list-item {
          padding: 0.75rem 0.9rem;
          border: 1px solid #eadcc9;
          border-radius: 0.85rem;
          background: #fffaf2;
        }
      `}</style>
    </main>
  );
}
