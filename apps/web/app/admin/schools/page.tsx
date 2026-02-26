'use client';

import { useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type School = { id: string; name: string; city?: string | null; address?: string | null; is_active?: boolean };
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
  const [newSchoolContactEmail, setNewSchoolContactEmail] = useState('');
  const [creatingSchool, setCreatingSchool] = useState(false);
  const [deletingSchoolId, setDeletingSchoolId] = useState('');

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
      });
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
    if (!newSchoolName.trim()) {
      setError('School name is required');
      return;
    }
    setCreatingSchool(true);
    try {
      await apiFetch('/admin/schools', {
        method: 'POST',
        body: JSON.stringify({
          name: newSchoolName.trim(),
          city: newSchoolCity.trim() || undefined,
          address: newSchoolAddress.trim() || undefined,
          contactEmail: newSchoolContactEmail.trim() || undefined,
        }),
      });
      setNewSchoolName('');
      setNewSchoolCity('');
      setNewSchoolAddress('');
      setNewSchoolContactEmail('');
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
      await apiFetch(`/admin/schools/${school.id}`, { method: 'DELETE' });
      setMessage(`School deleted: ${school.name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setDeletingSchoolId('');
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
      });
      setMessage(`Session updated: ${session.session} ${isActive ? 'ON' : 'OFF'}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSavingSession('');
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Schools</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <h2>Meal Sessions</h2>
        <div className="auth-form">
          {sessions.map((s) => (
            <label key={s.session}>
              <strong>{s.session}</strong>
              <small>Status: {s.is_active ? 'Active' : 'Inactive'}</small>
              {s.is_active ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => onToggleSession(s, false)}
                  disabled={savingSession === s.session || s.session === 'LUNCH'}
                >
                  {s.session === 'LUNCH' ? 'LUNCH Always ON' : 'Deactivate'}
                </button>
              ) : (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => onToggleSession(s, true)}
                  disabled={savingSession === s.session}
                >
                  Activate
                </button>
              )}
            </label>
          ))}
        </div>
        <h2>Schools</h2>
        <div className="auth-form">
          <label>School Name<input value={newSchoolName} onChange={(e) => setNewSchoolName(e.target.value)} /></label>
          <label>City<input value={newSchoolCity} onChange={(e) => setNewSchoolCity(e.target.value)} /></label>
          <label>Address<input value={newSchoolAddress} onChange={(e) => setNewSchoolAddress(e.target.value)} /></label>
          <label>Contact Email<input value={newSchoolContactEmail} onChange={(e) => setNewSchoolContactEmail(e.target.value)} /></label>
          <button className="btn btn-primary" type="button" onClick={onCreateSchool} disabled={creatingSchool}>
            {creatingSchool ? 'Creating...' : 'Create School'}
          </button>
        </div>
        <div className="auth-form">
          {schools.map((school) => (
            <label key={school.id}>
              <strong>{school.name}</strong>
              <small>City: {school.city || '-'}</small>
              <small>Address: {school.address || '-'}</small>
              <small>Status: {school.is_active ? 'Active' : 'Inactive'}</small>
              {school.is_active ? (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => onToggleSchool(school, false)}
                  disabled={savingSchoolId === school.id}
                >
                  Deactivate
                </button>
              ) : (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => onToggleSchool(school, true)}
                  disabled={savingSchoolId === school.id}
                >
                  Activate
                </button>
              )}
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => onDeleteSchool(school)}
                disabled={deletingSchoolId === school.id}
              >
                {deletingSchoolId === school.id ? 'Deleting...' : 'Delete'}
              </button>
            </label>
          ))}
          {schools.length === 0 ? <p className="auth-help">No schools found.</p> : null}
        </div>
      </section>
    </main>
  );
}
