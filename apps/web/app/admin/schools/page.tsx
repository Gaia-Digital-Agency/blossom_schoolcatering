'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type School = {
  id: string;
  name: string;
  city?: string | null;
  address?: string | null;
  contact_phone?: string | null;
  is_active?: boolean;
};
type SessionSetting = { session: 'LUNCH' | 'SNACK' | 'BREAKFAST'; is_active: boolean };

export default function AdminSchoolsPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [sessions, setSessions] = useState<SessionSetting[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [savingSchoolId, setSavingSchoolId] = useState('');
  const [savingSession, setSavingSession] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolCity, setNewSchoolCity] = useState('');
  const [newSchoolAddress, setNewSchoolAddress] = useState('');
  const [newSchoolPhone, setNewSchoolPhone] = useState('');
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState('');
  const [editingSchoolId, setEditingSchoolId] = useState('');
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const activeSchools = schools.filter((school) => school.is_active !== false);
  const inactiveSchools = schools.filter((school) => school.is_active === false);

  const load = async () => {
    setError('');
    const [activeSchools, inactiveSchools, sessionSettings] = await Promise.all([
      apiFetch('/schools?active=true') as Promise<School[]>,
      apiFetch('/schools?active=false') as Promise<School[]>,
      apiFetch('/admin/session-settings') as Promise<SessionSetting[]>,
    ]);
    setSchools([...(activeSchools || []), ...(inactiveSchools || [])]);
    setSessions(sessionSettings || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onToggleSchool = async (school: School, isActive: boolean) => {
    setSavingSchoolId(school.id);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/schools/${school.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }, { skipAutoReload: true });
      setMessage(`School ${isActive ? 'activated' : 'deactivated'}: ${school.name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingSchoolId('');
    }
  };

  const onCreateSchool = async () => {
    setError('');
    setMessage('');
    if (!newSchoolName.trim()) { setError('School name is required'); return; }
    if (!newSchoolCity.trim()) { setError('City is required'); return; }
    if (!newSchoolAddress.trim()) { setError('Address is required'); return; }
    if (!newSchoolPhone.trim()) { setError('Phone number is required'); return; }
    setCreatingSchool(true);
    try {
      await apiFetch('/admin/schools', {
        method: 'POST',
        body: JSON.stringify({
          name: newSchoolName.trim(),
          city: newSchoolCity.trim(),
          address: newSchoolAddress.trim(),
          contactPhone: newSchoolPhone.trim(),
        }),
      }, { skipAutoReload: true });
      setNewSchoolName('');
      setNewSchoolCity('');
      setNewSchoolAddress('');
      setNewSchoolPhone('');
      setMessage('School created.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setCreatingSchool(false);
    }
  };

  const onDeleteSchool = async (school: School) => {
    setError('');
    setMessage('');
    setDeletingSchoolId(school.id);
    try {
      await apiFetch(`/admin/schools/${school.id}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage(`School deleted: ${school.name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeletingSchoolId('');
    }
  };

  const beginEdit = (school: School) => {
    setEditingSchoolId(school.id);
    setEditName(school.name || '');
    setEditCity(school.city || '');
    setEditAddress(school.address || '');
    setEditPhone(school.contact_phone || '');
  };

  const onSaveEdit = async (school: School) => {
    setError('');
    setMessage('');
    if (!editName.trim()) { setError('School name is required'); return; }
    if (!editCity.trim()) { setError('City is required'); return; }
    if (!editAddress.trim()) { setError('Address is required'); return; }
    if (!editPhone.trim()) { setError('Phone number is required'); return; }
    setSavingSchoolId(school.id);
    try {
      await apiFetch(`/admin/schools/${school.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          city: editCity.trim(),
          address: editAddress.trim(),
          contactPhone: editPhone.trim(),
        }),
      }, { skipAutoReload: true });
      setEditingSchoolId('');
      setMessage(`School updated: ${editName.trim()}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingSchoolId('');
    }
  };

  const onToggleSession = async (session: SessionSetting, isActive: boolean) => {
    if (session.session === 'LUNCH' && !isActive) return;
    setSavingSession(session.session);
    setMessage('');
    setError('');
    try {
      await apiFetch(`/admin/session-settings/${session.session}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }, { skipAutoReload: true });
      setMessage(`Session updated: ${session.session} ${isActive ? 'ON' : 'OFF'}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingSession('');
    }
  };

  const renderSchoolTable = (title: string, list: School[]) => (
    <div className="school-section-card">
      <div className="school-section-head">
        <h3>{title}</h3>
        <span>{list.length} school(s)</span>
      </div>
      <div className="kitchen-table-wrap">
        <table className="kitchen-table admin-schools-table">
          <thead>
            <tr>
              <th>School</th>
              <th>City</th>
              <th>Address</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((school) => (
              <tr key={school.id}>
                {editingSchoolId === school.id ? (
                  <>
                    <td><input value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                    <td><input value={editCity} onChange={(e) => setEditCity(e.target.value)} /></td>
                    <td><input value={editAddress} onChange={(e) => setEditAddress(e.target.value)} /></td>
                    <td><input value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+[country][area][number]" /></td>
                    <td>
                      <div className="action-row">
                        <button className="btn btn-primary btn-sm" type="button" onClick={() => onSaveEdit(school)} disabled={savingSchoolId === school.id}>
                          {savingSchoolId === school.id ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => setEditingSchoolId('')}>Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{school.name}</td>
                    <td>{school.city || '-'}</td>
                    <td>{school.address || '-'}</td>
                    <td>{school.contact_phone || '-'}</td>
                    <td>
                      <div className="action-row">
                        <button className="btn btn-outline btn-sm" type="button" onClick={() => beginEdit(school)}>
                          Edit
                        </button>
                        {school.is_active ? (
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => onToggleSchool(school, false)}
                            disabled={savingSchoolId === school.id}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="btn btn-outline btn-sm"
                            type="button"
                            onClick={() => onToggleSchool(school, true)}
                            disabled={savingSchoolId === school.id}
                          >
                            Activate
                          </button>
                        )}
                        <button
                          className="btn btn-outline btn-sm"
                          type="button"
                          onClick={() => onDeleteSchool(school)}
                          disabled={deletingSchoolId === school.id}
                        >
                          {deletingSchoolId === school.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {list.length === 0 ? (
              <tr><td colSpan={5}>No schools found.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Schools</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>Meal Sessions</h2>
        <div className="sessions-row">
          {sessions.map((s) => (
            <div key={s.session} className="session-card">
              <span className="session-name">{s.session}</span>
              <span className="session-status">{s.is_active ? 'Active' : 'Inactive'}</span>
              {s.is_active ? (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => onToggleSession(s, false)}
                  disabled={savingSession === s.session || s.session === 'LUNCH'}
                >
                  {s.session === 'LUNCH' ? 'Always ON' : 'Deactivate'}
                </button>
              ) : (
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => onToggleSession(s, true)}
                  disabled={savingSession === s.session}
                >
                  Activate
                </button>
              )}
            </div>
          ))}
        </div>

        <h2>Add School</h2>
        <div className="auth-form school-create-form">
          <label>School Name <span className="req">*</span><input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} /></label>
          <label>City <span className="req">*</span><input value={newSchoolCity} onChange={(e) => setNewSchoolCity(e.target.value)} /></label>
          <label>Address <span className="req">*</span><input value={newSchoolAddress} onChange={(e) => setNewSchoolAddress(e.target.value)} /></label>
          <label>Phone Number <span className="req">*</span><input value={newSchoolPhone} onChange={(e) => setNewSchoolPhone(e.target.value)} placeholder="+[country][area][number]" /><small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small></label>
          <button className="btn btn-primary create-school-btn" type="button" onClick={onCreateSchool} disabled={creatingSchool}>
            {creatingSchool ? 'Creating...' : 'Create School'}
          </button>
        </div>

        <h2>Schools</h2>
        <div className="schools-grid">
          {renderSchoolTable('Active Schools', activeSchools)}
          {renderSchoolTable('Deactivated Schools', inactiveSchools)}
        </div>
      </section>
      <AdminReturnButton />
      <style jsx>{`
        .sessions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.65rem;
          margin-bottom: 1rem;
        }
        .session-card {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          border: 1px solid #e2d6c2;
          border-radius: 0.5rem;
          padding: 0.45rem 0.75rem;
          background: #fffaf3;
        }
        .session-name {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .session-status {
          font-size: 0.78rem;
          color: #7a6652;
        }
        .school-create-form {
          margin-bottom: 0.75rem;
        }
        .create-school-btn {
          grid-column: 1 / -1;
          width: 100%;
        }
        .req {
          color: #c0392b;
          margin-left: 2px;
        }
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
        }
        .kitchen-table th,
        .kitchen-table td {
          border-bottom: 1px solid #efe7da;
          padding: 0.65rem;
          text-align: left;
          vertical-align: top;
          font-size: 0.92rem;
          line-height: 1.35;
        }
        .kitchen-table tbody tr:last-child td {
          border-bottom: none;
        }
        .schools-grid {
          display: grid;
          gap: 1rem;
        }
        .school-section-card {
          border: 1px solid #e2d6c2;
          border-radius: 0.85rem;
          background: #fffdf9;
          padding: 0.8rem;
        }
        .school-section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.65rem;
        }
        .school-section-head h3 {
          margin: 0;
          font-size: 1rem;
        }
        .school-section-head span {
          font-size: 0.8rem;
          color: #7a6652;
        }
        .admin-schools-table td input {
          width: 100%;
          padding: 0.35rem 0.6rem;
          border: 1px solid #d1c3a8;
          border-radius: 0.4rem;
          font-size: 0.88rem;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .btn-sm {
          padding: 0.28rem 0.7rem;
          font-size: 0.82rem;
        }
        @media (max-width: 760px) {
          .kitchen-table th,
          .kitchen-table td {
            font-size: 0.82rem;
            padding: 0.45rem 0.5rem;
          }
          .admin-schools-table :global(.btn) {
            width: 100%;
          }
        }
      `}</style>
    </main>
  );
}
