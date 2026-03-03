'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import PasswordInput from '../../_components/password-input';

type DeliveryUser = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  email?: string | null;
  is_active: boolean;
};
type School = { id: string; name: string };
type Mapping = {
  delivery_user_id: string;
  school_id: string;
  is_active: boolean;
  delivery_name: string;
  delivery_username: string;
  school_name: string;
};
type Assignment = {
  id: string;
  order_id: string;
  delivery_user_id: string;
  service_date: string;
  session: string;
  school_name: string;
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

function mapDeliveryAdminError(raw: string) {
  if (raw.includes('Cannot delete delivery user with active assignments')) {
    return 'user still has active delivery assignments';
  }
  if (raw.includes('maximum 3 active delivery personnel')) {
    return 'Cannot activate assignment: this school already has 3 active delivery personnel.';
  }
  return raw || 'Operation failed';
}

export default function AdminDeliveryPage() {
  const [users, setUsers] = useState<DeliveryUser[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [assignDate, setAssignDate] = useState(todayIsoLocal());
  const [selectedDeliveryUserId, setSelectedDeliveryUserId] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newPhoneNumber, setNewPhoneNumber] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creatingUser, setCreatingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhoneNumber, setEditPhoneNumber] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingUserId, setSavingUserId] = useState('');
  const [togglingUserId, setTogglingUserId] = useState('');
  const [deletingUserId, setDeletingUserId] = useState('');
  const [deletingMappingKey, setDeletingMappingKey] = useState('');
  const editFirstNameInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    const [rU, rS, rM, rA] = await Promise.allSettled([
      apiFetch('/delivery/users?include_inactive=true') as Promise<DeliveryUser[]>,
      apiFetch('/schools?active=true') as Promise<School[]>,
      apiFetch('/delivery/school-assignments') as Promise<Mapping[]>,
      apiFetch(`/delivery/assignments?date=${encodeURIComponent(assignDate)}`) as Promise<Assignment[]>,
    ]);
    const u = rU.status === 'fulfilled' ? (rU.value || []) : null;
    const s = rS.status === 'fulfilled' ? (rS.value || []) : null;
    const m = rM.status === 'fulfilled' ? (rM.value || []) : null;
    const a = rA.status === 'fulfilled' ? (rA.value || []) : null;
    if (u !== null) { setUsers(u); if (!selectedDeliveryUserId && u.length) setSelectedDeliveryUserId(u[0].id); }
    if (s !== null) { setSchools(s); if (!selectedSchoolId && s.length) setSelectedSchoolId(s[0].id); }
    if (m !== null) setMappings(m);
    if (a !== null) setAssignments(a);
    const firstErr = [rU, rS, rM, rA].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
    if (firstErr) throw firstErr.reason;
  };

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : 'Failed')); /* eslint-disable-next-line */ }, [assignDate]);

  const onSaveMapping = async () => {
    if (!selectedDeliveryUserId || !selectedSchoolId) return;
    setError('');
    setMessage('');
    try {
      await apiFetch('/delivery/school-assignments', {
        method: 'POST',
        body: JSON.stringify({ deliveryUserId: selectedDeliveryUserId, schoolId: selectedSchoolId, isActive: true }),
      }, { skipAutoReload: true });
      setMessage('School assignment saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? mapDeliveryAdminError(e.message) : 'Failed saving mapping');
    }
  };

  const onToggleMapping = async (row: Mapping, isActive: boolean) => {
    setError('');
    setMessage('');
    try {
      await apiFetch('/delivery/school-assignments', {
        method: 'POST',
        body: JSON.stringify({ deliveryUserId: row.delivery_user_id, schoolId: row.school_id, isActive }),
      }, { skipAutoReload: true });
      setMessage(isActive ? 'Mapping activated.' : 'Mapping deactivated.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? mapDeliveryAdminError(e.message) : 'Failed updating mapping');
    }
  };

  const onDeleteMapping = async (row: Mapping) => {
    const ok = window.confirm(`Delete mapping "${row.school_name}" -> "${row.delivery_name}"?`);
    if (!ok) return;
    const key = `${row.delivery_user_id}-${row.school_id}`;
    setDeletingMappingKey(key);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/delivery/school-assignments/${row.delivery_user_id}/${row.school_id}`, {
        method: 'DELETE',
      }, { skipAutoReload: true });
      setMessage('Mapping deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? mapDeliveryAdminError(e.message) : 'Failed deleting mapping');
    } finally {
      setDeletingMappingKey('');
    }
  };

  const onAutoAssign = async () => {
    setError('');
    setMessage('');
    try {
      const out = await apiFetch('/delivery/auto-assign', {
        method: 'POST',
        body: JSON.stringify({ date: assignDate }),
      }, { skipAutoReload: true }) as { assignedCount: number; skippedOrderIds: string[] };
      setMessage(
        out.skippedOrderIds.length
          ? `Auto-assigned ${out.assignedCount}. Skipped ${out.skippedOrderIds.length} (missing school mapping).`
          : `Auto-assigned ${out.assignedCount} orders.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed auto-assignment');
    }
  };

  const onCreateDeliveryUser = async () => {
    setError('');
    setMessage('');
    if (!newUsername.trim() || !newPassword.trim() || !newFirstName.trim() || !newLastName.trim() || !newPhoneNumber.trim()) {
      setError('username, password, first name, last name, phone number are required');
      return;
    }
    setCreatingUser(true);
    try {
      const out = await apiFetch('/admin/delivery/users', {
        method: 'POST',
        body: JSON.stringify({
          username: newUsername.trim(),
          password: newPassword.trim(),
          firstName: newFirstName.trim(),
          lastName: newLastName.trim(),
          phoneNumber: newPhoneNumber.trim(),
          email: newEmail.trim() || undefined,
        }),
      }, { skipAutoReload: true }) as { username: string };
      setMessage(`Delivery user created: ${out.username}`);
      setNewUsername('');
      setNewPassword('');
      setNewFirstName('');
      setNewLastName('');
      setNewPhoneNumber('');
      setNewEmail('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed creating delivery user');
    } finally {
      setCreatingUser(false);
    }
  };

  const beginEditUser = (user: DeliveryUser) => {
    setEditingUserId(user.id);
    setEditFirstName(user.first_name || '');
    setEditLastName(user.last_name || '');
    setEditPhoneNumber(user.phone_number || '');
    setEditEmail(user.email || '');
    // Keep the selected row visible and focus first editable field.
    window.setTimeout(() => {
      const row = document.getElementById(`delivery-user-row-${user.id}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      editFirstNameInputRef.current?.focus();
      editFirstNameInputRef.current?.select();
    }, 0);
  };

  const onSaveUserEdit = async (userId: string) => {
    setSavingUserId(userId);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/delivery/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editFirstName,
          lastName: editLastName,
          phoneNumber: editPhoneNumber,
          email: editEmail,
        }),
      }, { skipAutoReload: true });
      setEditingUserId('');
      setMessage('Delivery user updated.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed updating delivery user');
    } finally {
      setSavingUserId('');
    }
  };

  const onToggleUserActive = async (user: DeliveryUser) => {
    setTogglingUserId(user.id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/delivery/users/${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !user.is_active }),
      }, { skipAutoReload: true });
      setMessage(!user.is_active ? `Delivery user activated: ${user.username}` : `Delivery user deactivated: ${user.username}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed updating delivery user status');
    } finally {
      setTogglingUserId('');
    }
  };

  const onDeleteUser = async (user: DeliveryUser) => {
    if (!window.confirm(`Delete delivery user "${user.username}"? This cannot be undone.`)) return;
    setDeletingUserId(user.id);
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/delivery/users/${user.id}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage(`Delivery user deleted: ${user.username}`);
      if (editingUserId === user.id) setEditingUserId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? mapDeliveryAdminError(e.message) : 'Failed deleting delivery user');
    } finally {
      setDeletingUserId('');
    }
  };

  const usersById = useMemo(() => {
    const map = new Map<string, DeliveryUser>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const autoAssignmentSummary = useMemo(() => {
    const grouped = new Map<string, { schools: Set<string>; youngsters: Set<string>; orderCount: number }>();
    for (const row of assignments) {
      const key = row.delivery_user_id || 'UNASSIGNED';
      if (!grouped.has(key)) grouped.set(key, { schools: new Set<string>(), youngsters: new Set<string>(), orderCount: 0 });
      const target = grouped.get(key)!;
      if (row.school_name) target.schools.add(row.school_name);
      if (row.child_name) target.youngsters.add(row.child_name);
      target.orderCount += 1;
    }
    return Array.from(grouped.entries()).map(([deliveryUserId, value]) => {
      const u = usersById.get(deliveryUserId);
      return {
        deliveryUserId,
        deliveryName: u ? `${u.first_name} ${u.last_name}` : 'Unassigned',
        schools: Array.from(value.schools).sort(),
        youngsterCount: value.youngsters.size,
        orderCount: value.orderCount,
      };
    }).sort((a, b) => b.orderCount - a.orderCount || a.deliveryName.localeCompare(b.deliveryName));
  }, [assignments, usersById]);

  const onDownloadSummary = async () => {
    setError('');
    setMessage('');
    try {
      const data = await apiFetch(`/delivery/summary?date=${encodeURIComponent(assignDate)}`) as {
        date: string;
        deliveries: Array<{
          deliveryUserId: string;
          deliveryName: string;
          schools: Array<{
            schoolName: string;
            orderCount: number;
            dishCount: number;
            orders: Array<{ orderNumber: string; childLastName: string; youngsterPhone: string | null }>;
          }>;
        }>;
      };
      if (!data || !data.deliveries || data.deliveries.length === 0) {
        setMessage('No assignment data for selected date.');
        return;
      }
      const lines: string[] = [];
      lines.push(`DELIVERY SUMMARY - ${data.date}`);
      lines.push('');
      for (const delivery of data.deliveries) {
        lines.push(`Delivery Person: ${delivery.deliveryName}`);
        for (const school of delivery.schools) {
          lines.push(`  School: ${school.schoolName}`);
          lines.push(`  Total Orders: ${school.orderCount}`);
          lines.push(`  Total Dishes: ${school.dishCount}`);
          lines.push(`  Order# | Last Name | Phone`);
          lines.push(`  -------|-----------|------`);
          for (const order of school.orders) {
            lines.push(`  ${order.orderNumber} | ${order.childLastName} | ${order.youngsterPhone || '-'}`);
          }
          lines.push('');
        }
        lines.push('');
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `delivery-summary-${data.date}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed downloading summary');
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Delivery</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>Delivery Registration (Admin Only)</h2>
        <div className="auth-form">
          <label>Username <span className="req">*</span><input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></label>
          <label>Password <span className="req">*</span><PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <label>First Name <span className="req">*</span><input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} /></label>
          <label>Last Name <span className="req">*</span><input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} /></label>
          <label>Phone Number <span className="req">*</span><input value={newPhoneNumber} onChange={(e) => setNewPhoneNumber(e.target.value)} placeholder="+[country][area][number]" /><small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small></label>
          <label>Email <span className="opt">(Optional)</span><input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
          <button className="btn btn-primary" type="button" onClick={onCreateDeliveryUser} disabled={creatingUser}>
            {creatingUser ? 'Creating...' : 'Create Delivery User'}
          </button>
        </div>

        <div className="admin-section-card">
          <h2>List Delivery Users</h2>
          <div className="kitchen-table-wrap">
            <table className="kitchen-table admin-delivery-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan={6}>No delivery users yet.</td></tr>
                ) : users.map((u) => (
                  <tr id={`delivery-user-row-${u.id}`} key={u.id}>
                    <td>
                      {editingUserId === u.id ? (
                        <div className="edit-grid">
                          <input ref={editFirstNameInputRef} value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="First" />
                          <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Last" />
                        </div>
                      ) : `${u.first_name} ${u.last_name}`}
                    </td>
                    <td>{u.username}</td>
                    <td>{editingUserId === u.id ? <input value={editPhoneNumber} onChange={(e) => setEditPhoneNumber(e.target.value)} placeholder="+[country][area][number]" /> : (u.phone_number || '-')}</td>
                    <td>{editingUserId === u.id ? <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} /> : (u.email || '-')}</td>
                    <td>{u.is_active ? 'ACTIVE' : 'INACTIVE'}</td>
                    <td>
                      <div className="action-row">
                        {editingUserId === u.id ? (
                          <>
                            <button className="btn btn-primary" type="button" onClick={() => onSaveUserEdit(u.id)} disabled={savingUserId === u.id}>
                              {savingUserId === u.id ? 'Saving...' : 'Save'}
                            </button>
                            <button className="btn btn-outline" type="button" onClick={() => setEditingUserId('')}>Cancel</button>
                          </>
                        ) : (
                          <button className="btn btn-outline" type="button" onClick={() => beginEditUser(u)}>Edit</button>
                        )}
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => onToggleUserActive(u)}
                          disabled={togglingUserId === u.id || deletingUserId === u.id}
                        >
                          {togglingUserId === u.id ? 'Updating...' : (u.is_active ? 'Deactivate' : 'Activate')}
                        </button>
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => onDeleteUser(u)}
                          disabled={deletingUserId === u.id || togglingUserId === u.id || savingUserId === u.id}
                        >
                          {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-section-card">
          <h2>Delivery vs School Assignment</h2>
          <p className="auth-help">One school can have maximum 3 active delivery personnel assignments.</p>
          <div className="auth-form admin-mapping-controls">
            <label>
              School
              <select value={selectedSchoolId} onChange={(e) => setSelectedSchoolId(e.target.value)}>
                <option value="">Select...</option>
                {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label>
              Delivery Personnel
              <select value={selectedDeliveryUserId} onChange={(e) => setSelectedDeliveryUserId(e.target.value)}>
                <option value="">Select...</option>
                {users.filter((u) => u.is_active).map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.username})</option>)}
              </select>
            </label>
            <button className="btn btn-primary" type="button" onClick={onSaveMapping}>Save Assignment</button>
          </div>

          <div className="kitchen-table-wrap">
            <table className="kitchen-table admin-delivery-table">
              <thead>
                <tr>
                  <th>School</th>
                  <th>Delivery User</th>
                  <th>Username</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {mappings.length === 0 ? (
                  <tr><td colSpan={5}>No delivery-school mappings yet.</td></tr>
                ) : mappings.map((m) => (
                  <tr key={`${m.delivery_user_id}-${m.school_id}`}>
                    <td>{m.school_name}</td>
                    <td>{m.delivery_name}</td>
                    <td>{m.delivery_username}</td>
                    <td>{m.is_active ? 'ACTIVE' : 'INACTIVE'}</td>
                    <td>
                      <div className="action-row">
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => {
                            setSelectedSchoolId(m.school_id);
                            setSelectedDeliveryUserId(m.delivery_user_id);
                          }}
                        >
                          Edit
                        </button>
                        {m.is_active
                          ? <button className="btn btn-outline" type="button" onClick={() => onToggleMapping(m, false)}>Deactivate</button>
                          : <button className="btn btn-outline" type="button" onClick={() => onToggleMapping(m, true)}>Activate</button>}
                        <button
                          className="btn btn-outline"
                          type="button"
                          onClick={() => onDeleteMapping(m)}
                          disabled={deletingMappingKey === `${m.delivery_user_id}-${m.school_id}`}
                        >
                          {deletingMappingKey === `${m.delivery_user_id}-${m.school_id}` ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <h2>Auto Assignment ({assignDate})</h2>
        <div className="auth-form auto-assign-controls">
          <label>
            Service Date
            <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
          </label>
          <button className="btn btn-outline" type="button" onClick={() => setAssignDate(todayIsoLocal())}>Show Today</button>
          <button className="btn btn-primary" type="button" onClick={onAutoAssign}>Auto Assign by School</button>
          <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>
          <button className="btn btn-outline" type="button" onClick={onDownloadSummary}>Download Summary</button>
        </div>

        <div className="kitchen-table-wrap">
          <table className="kitchen-table admin-delivery-table">
            <thead>
              <tr>
                <th>Delivery User</th>
                <th>Schools</th>
                <th className="count-col">Number of Youngsters</th>
                <th className="count-col">Number of Orders</th>
              </tr>
            </thead>
            <tbody>
              {autoAssignmentSummary.length === 0 ? (
                <tr><td colSpan={4}>No auto-assignment data for selected date.</td></tr>
              ) : autoAssignmentSummary.map((row) => (
                <tr key={row.deliveryUserId}>
                  <td>{row.deliveryName}</td>
                  <td>{row.schools.join(', ') || '-'}</td>
                  <td className="count-col">{row.youngsterCount}</td>
                  <td className="count-col">{row.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Assigned Orders ({assignDate})</h2>
        <div className="kitchen-table-wrap">
          <table className="kitchen-table admin-delivery-table">
            <thead>
              <tr>
                <th>Date/Session</th>
                <th>School</th>
                <th>Order</th>
                <th>Youngster / Parent</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {assignments.length === 0 ? (
                <tr><td colSpan={5}>No assignments.</td></tr>
              ) : assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.service_date} {a.session}</td>
                  <td>{a.school_name}</td>
                  <td>{a.order_id}</td>
                  <td>{a.child_name} / {a.parent_name}</td>
                  <td>{a.delivery_status} {a.confirmed_at ? `(Confirmed ${a.confirmed_at})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .kitchen-table-wrap {
          overflow-x: auto;
          max-width: 100%;
          -webkit-overflow-scrolling: touch;
        }
        .kitchen-table {
          width: 100%;
          border-collapse: collapse;
          background: #fff;
          border: 1px solid #e2d6c2;
          border-radius: 10px;
          overflow: hidden;
          margin-bottom: 0.5rem;
        }
        .kitchen-table th,
        .kitchen-table td {
          border-bottom: 1px solid #efe7da;
          padding: 0.6rem;
          text-align: left;
          vertical-align: top;
          font-size: 0.88rem;
          line-height: 1.35;
        }
        .kitchen-table th {
          white-space: nowrap;
        }
        .kitchen-table td {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .kitchen-table tbody tr:last-child td {
          border-bottom: none;
        }
        .admin-delivery-table th,
        .admin-delivery-table td {
          text-align: left;
          vertical-align: middle;
        }
        .admin-section-card {
          border: 1px solid #ccbda2;
          border-radius: 0.7rem;
          background: #fffaf3;
          padding: 0.75rem;
          margin-bottom: 0.9rem;
        }
        .admin-section-card h2 {
          margin: 0 0 0.65rem 0;
        }
        .admin-delivery-table .count-col {
          text-align: center;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .admin-mapping-controls,
        .auto-assign-controls {
          display: grid;
          gap: 0.6rem;
          margin-bottom: 0.6rem;
        }
        .edit-grid {
          display: grid;
          gap: 0.35rem;
        }
        .req {
          color: #c0392b;
          margin-left: 2px;
        }
        .opt {
          color: #7a6652;
          font-size: 0.78rem;
          font-weight: normal;
          margin-left: 4px;
        }
        @media (min-width: 900px) {
          .admin-mapping-controls {
            grid-template-columns: 1fr auto auto auto;
            align-items: end;
          }
          .auto-assign-controls {
            grid-template-columns: 1fr auto auto auto auto;
            align-items: end;
          }
        }
        @media (max-width: 680px) {
          .kitchen-table th,
          .kitchen-table td {
            font-size: 0.78rem;
            padding: 0.38rem 0.4rem;
          }
          .kitchen-table th {
            white-space: nowrap;
          }
          /* Assignments table: hide Order ID column on mobile */
          .admin-delivery-table.assignments-table th:nth-child(3),
          .admin-delivery-table.assignments-table td:nth-child(3) {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
