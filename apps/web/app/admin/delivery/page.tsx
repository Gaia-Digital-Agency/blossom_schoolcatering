'use client';

import { useEffect, useMemo, useState } from 'react';
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

  const load = async () => {
    const [u, s, m, a] = await Promise.all([
      apiFetch('/delivery/users?include_inactive=true') as Promise<DeliveryUser[]>,
      apiFetch('/schools?active=true') as Promise<School[]>,
      apiFetch('/delivery/school-assignments') as Promise<Mapping[]>,
      apiFetch(`/delivery/assignments?date=${encodeURIComponent(assignDate)}`) as Promise<Assignment[]>,
    ]);
    setUsers(u || []);
    setSchools(s || []);
    setMappings(m || []);
    setAssignments(a || []);
    if (!selectedDeliveryUserId && u.length) setSelectedDeliveryUserId(u[0].id);
    if (!selectedSchoolId && s.length) setSelectedSchoolId(s[0].id);
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
      });
      setMessage('School assignment saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed saving mapping');
    }
  };

  const onToggleMapping = async (row: Mapping, isActive: boolean) => {
    setError('');
    setMessage('');
    try {
      await apiFetch('/delivery/school-assignments', {
        method: 'POST',
        body: JSON.stringify({ deliveryUserId: row.delivery_user_id, schoolId: row.school_id, isActive }),
      });
      setMessage(isActive ? 'Mapping activated.' : 'Mapping deactivated.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed updating mapping');
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
      });
      setMessage('Mapping deleted.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting mapping');
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
      }) as { assignedCount: number; skippedOrderIds: string[] };
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
      }) as { username: string };
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
      });
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
      });
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
      await apiFetch(`/admin/delivery/users/${user.id}`, { method: 'DELETE' });
      setMessage(`Delivery user deleted: ${user.username}`);
      if (editingUserId === user.id) setEditingUserId('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting delivery user');
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

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Delivery</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>Delivery Registration (Admin Only)</h2>
        <div className="auth-form">
          <label>Username<input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></label>
          <label>Password<PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <label>First Name<input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} /></label>
          <label>Last Name<input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} /></label>
          <label>Phone Number<input value={newPhoneNumber} onChange={(e) => setNewPhoneNumber(e.target.value)} /></label>
          <label>Email<input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
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
                  <tr key={u.id}>
                    <td>
                      {editingUserId === u.id ? (
                        <div className="edit-grid">
                          <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="First" />
                          <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Last" />
                        </div>
                      ) : `${u.first_name} ${u.last_name}`}
                    </td>
                    <td>{u.username}</td>
                    <td>{editingUserId === u.id ? <input value={editPhoneNumber} onChange={(e) => setEditPhoneNumber(e.target.value)} /> : (u.phone_number || '-')}</td>
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
          <p className="auth-help">One school can have maximum 2 active delivery personnel assignments.</p>
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
        @media (min-width: 900px) {
          .admin-mapping-controls,
          .auto-assign-controls {
            grid-template-columns: 1fr auto auto auto;
            align-items: end;
          }
        }
      `}</style>
    </main>
  );
}
