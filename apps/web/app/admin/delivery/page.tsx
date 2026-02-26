'use client';

import { useEffect, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type DeliveryUser = { id: string; username: string; first_name: string; last_name: string };
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
  const [deactivatingUserId, setDeactivatingUserId] = useState('');

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
    const [u, s, m, a] = await Promise.all([
      apiFetch('/delivery/users') as Promise<DeliveryUser[]>,
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

  useEffect(() => { load().catch((e) => setError(e instanceof Error ? e.message : 'Failed')); /* eslint-disable-next-line */ }, []);

  const onSaveMapping = async () => {
    if (!selectedDeliveryUserId || !selectedSchoolId) return;
    setError(''); setMessage('');
    try {
      await apiFetch('/delivery/school-assignments', {
        method: 'POST',
        body: JSON.stringify({ deliveryUserId: selectedDeliveryUserId, schoolId: selectedSchoolId, isActive: true }),
      });
      setMessage('School assignment saved.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed saving mapping'); }
  };

  const onToggleMapping = async (row: Mapping, isActive: boolean) => {
    setError(''); setMessage('');
    try {
      await apiFetch('/delivery/school-assignments', {
        method: 'POST',
        body: JSON.stringify({ deliveryUserId: row.delivery_user_id, schoolId: row.school_id, isActive }),
      });
      setMessage(isActive ? 'Mapping activated.' : 'Mapping deactivated.');
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed updating mapping'); }
  };

  const onAutoAssign = async () => {
    setError(''); setMessage('');
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
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed auto-assignment'); }
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

  const onDeactivateDeliveryUser = async (user: DeliveryUser) => {
    setError('');
    setMessage('');
    setDeactivatingUserId(user.id);
    try {
      await apiFetch(`/admin/delivery/users/${user.id}/deactivate`, { method: 'PATCH' });
      setMessage(`Delivery user deactivated: ${user.username}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deactivating delivery user');
    } finally {
      setDeactivatingUserId('');
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Delivery</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>School To Deliverer Mapping</h2>
        <div className="auth-form">
          <label>Username<input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} /></label>
          <label>Password<input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
          <label>First Name<input value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} /></label>
          <label>Last Name<input value={newLastName} onChange={(e) => setNewLastName(e.target.value)} /></label>
          <label>Phone Number<input value={newPhoneNumber} onChange={(e) => setNewPhoneNumber(e.target.value)} /></label>
          <label>Email<input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} /></label>
          <button className="btn btn-primary" type="button" onClick={onCreateDeliveryUser} disabled={creatingUser}>
            {creatingUser ? 'Creating...' : 'Create Delivery User'}
          </button>
        </div>
        <div className="auth-form">
          {users.map((u) => (
            <label key={u.id}>
              <strong>{u.first_name} {u.last_name}</strong>
              <small>{u.username}</small>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => onDeactivateDeliveryUser(u)}
                disabled={deactivatingUserId === u.id}
              >
                {deactivatingUserId === u.id ? 'Deactivating...' : 'Deactivate User'}
              </button>
            </label>
          ))}
        </div>

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
            {users.map((u) => <option key={u.id} value={u.id}>{u.first_name} {u.last_name} ({u.username})</option>)}
          </select>
        </label>
        <button className="btn btn-primary" type="button" onClick={onSaveMapping}>Save Mapping</button>

        <h2>Daily Auto Assignment</h2>
        <label>
          Service Date
          <input type="date" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
        </label>
        <button className="btn btn-primary" type="button" onClick={onAutoAssign}>Auto Assign by School</button>
        <button className="btn btn-outline" type="button" onClick={load}>Refresh</button>

        <h2>Mappings</h2>
        {mappings.length === 0 ? <p className="auth-help">No delivery-school mappings yet.</p> : (
          <div className="auth-form">
            {mappings.map((m) => (
              <label key={`${m.delivery_user_id}-${m.school_id}`}>
                <strong>{m.school_name}</strong>
                <small>{m.delivery_name} ({m.delivery_username})</small>
                <small>Status: {m.is_active ? 'ACTIVE' : 'INACTIVE'}</small>
                {m.is_active
                  ? <button className="btn btn-outline" type="button" onClick={() => onToggleMapping(m, false)}>Deactivate</button>
                  : <button className="btn btn-outline" type="button" onClick={() => onToggleMapping(m, true)}>Activate</button>}
              </label>
            ))}
          </div>
        )}

        <h2>Assignments ({assignDate})</h2>
        {assignments.length === 0 ? <p className="auth-help">No assignments.</p> : (
          <div className="auth-form">
            {assignments.map((a) => (
              <label key={a.id}>
                <strong>{a.service_date} {a.session}</strong>
                <small>Order: {a.order_id}</small>
                <small>Youngster: {a.child_name} | Parent: {a.parent_name}</small>
                <small>Status: {a.delivery_status} | Confirmed: {a.confirmed_at || '-'}</small>
              </label>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
