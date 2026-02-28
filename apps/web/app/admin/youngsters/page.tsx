'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type School = { id: string; name: string; city?: string | null };
type ParentRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
};
type ChildRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  email?: string | null;
  date_of_birth: string;
  gender: string;
  school_id: string;
  school_name: string;
  school_grade: string;
  dietary_allergies?: string;
  registration_actor_teacher_name?: string | null;
  parent_ids: string[];
};

type ResetPasswordResponse = {
  ok: boolean;
  newPassword: string;
  username: string;
};

const GRADES = Array.from({ length: 12 }, (_v, i) => String(i + 1));

export default function AdminYoungstersPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [editingYoungsterId, setEditingYoungsterId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [selectedParentId, setSelectedParentId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('UNDISCLOSED');
  const [schoolId, setSchoolId] = useState('');
  const [schoolGrade, setSchoolGrade] = useState(GRADES[0]);
  const [allergies, setAllergies] = useState('');
  const [registrationNote, setRegistrationNote] = useState('');

  const parentLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parents) map.set(p.id, `${p.first_name} ${p.last_name} (${p.username})`);
    return map;
  }, [parents]);

  const load = async () => {
    const [s, p, c] = await Promise.all([
      apiFetch('/schools?active=true') as Promise<School[]>,
      apiFetch('/admin/parents') as Promise<ParentRow[]>,
      apiFetch('/admin/children') as Promise<ChildRow[]>,
    ]);
    setSchools(s || []);
    setParents(p || []);
    setChildren(c || []);
    if (!schoolId && (s || []).length) setSchoolId(s[0].id);
    if (!selectedParentId && (p || []).length) setSelectedParentId(p[0].id);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditingYoungsterId('');
    setFirstName('');
    setLastName('');
    setPhoneNumber('');
    setEmail('');
    setDateOfBirth('');
    setGender('UNDISCLOSED');
    setSchoolGrade(GRADES[0]);
    setAllergies('');
    setRegistrationNote('');
    if (parents.length > 0) setSelectedParentId(parents[0].id);
  };

  const onEdit = (child: ChildRow) => {
    setEditingYoungsterId(child.id);
    setFirstName(child.first_name || '');
    setLastName(child.last_name || '');
    setPhoneNumber(child.phone_number || '');
    setEmail(child.email || '');
    setDateOfBirth((child.date_of_birth || '').slice(0, 10));
    setGender(child.gender || 'UNDISCLOSED');
    setSchoolId(child.school_id || '');
    setSchoolGrade(child.school_grade || GRADES[0]);
    setAllergies(child.dietary_allergies || '');
    setRegistrationNote(
      child.registration_actor_teacher_name
        ? `Registered by Teacher: ${child.registration_actor_teacher_name}`
        : ''
    );
    if ((child.parent_ids || []).length > 0) {
      setSelectedParentId(child.parent_ids[0]);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    if (!selectedParentId) {
      setError('Parent link is compulsory.');
      return;
    }
    setBusy(true);
    try {
      if (editingYoungsterId) {
        await apiFetch(`/admin/youngsters/${editingYoungsterId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            firstName,
            lastName,
            phoneNumber,
            email: email || '',
            dateOfBirth,
            gender,
            schoolId,
            schoolGrade,
            parentId: selectedParentId,
            allergies,
          }),
        });
        setMessage('Youngster updated.');
      } else {
        const created = await apiFetch('/children/register', {
          method: 'POST',
          body: JSON.stringify({
            firstName,
            lastName,
            phoneNumber,
            email: email || undefined,
            dateOfBirth,
            gender,
            schoolId,
            schoolGrade,
            allergies: allergies || undefined,
            parentId: selectedParentId,
          }),
        }) as { username: string; generatedPassword: string };
        setMessage(`Youngster created: ${created.username} / ${created.generatedPassword}`);
      }
      resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (youngsterId: string) => {
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/youngsters/${youngsterId}`, { method: 'DELETE' });
      setMessage('Youngster deleted.');
      if (editingYoungsterId === youngsterId) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting youngster');
    }
  };

  const onResetPassword = async (userId: string) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(`/admin/users/${userId}/reset-password`, { method: 'PATCH', body: JSON.stringify({}) }) as ResetPasswordResponse;
      setMessage(`Password reset for ${res.username}: ${res.newPassword}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed resetting password');
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Youngsters</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Parent (Required)
            <select value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)} required>
              <option value="">Select...</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.username})</option>
              ))}
            </select>
          </label>
          <label>Youngster First Name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
          <label>Youngster Last Name<input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
          <label>Youngster Phone<input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required /></label>
          <label>Youngster Email (Optional)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Date Of Birth<input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required /></label>
          <label>
            Gender
            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNDISCLOSED">Undisclosed</option>
            </select>
          </label>
          <label>
            School
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select...</option>
              {schools.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>))}
            </select>
          </label>
          <label>
            Grade
            <select value={schoolGrade} onChange={(e) => setSchoolGrade(e.target.value)} required>
              {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label>Allergies (Optional)<input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="No input => No allergies" /></label>
          {registrationNote ? (
            <label>
              Registration Note
              <input value={registrationNote} readOnly className="registration-note-field" />
            </label>
          ) : null}
          <div className="menu-actions-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : editingYoungsterId ? 'Update Youngster' : 'Create Youngster'}</button>
            {editingYoungsterId ? <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button> : null}
          </div>
        </form>

        <h2>Existing Youngsters</h2>
        <div className="kitchen-table-wrap">
          <table className="kitchen-table">
            <thead>
              <tr>
                <th>Youngster</th>
                <th>User ID</th>
                <th>Parent</th>
                <th>School</th>
                <th>Grade</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {children.map((c) => (
                <tr key={c.id}>
                  <td>{c.first_name} {c.last_name}<br /><small>{c.username}</small></td>
                  <td><code>{c.user_id}</code></td>
                  <td>{(c.parent_ids || []).map((id) => parentLabelById.get(id) || id).join(', ') || '-'}</td>
                  <td>{c.school_name}</td>
                  <td>{String(c.school_grade || '').replace(/^[Gg]rade\s*/,'')}</td>
                  <td>
                    <div className="action-col">
                      <div className="action-row">
                        <button className="btn btn-outline" type="button" onClick={() => onEdit(c)}>Edit</button>
                        <button className="btn btn-outline" type="button" onClick={() => onDelete(c.id)}>Delete</button>
                      </div>
                      <button className="btn btn-outline" type="button" onClick={() => onResetPassword(c.user_id)}>Reset Password</button>
                    </div>
                  </td>
                </tr>
              ))}
              {children.length === 0 ? (
                <tr><td colSpan={6}>No youngsters found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
      <style jsx>{`
        .menu-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
        }
        .action-col {
          display: grid;
          gap: 0.35rem;
          min-width: 220px;
        }
        .action-row {
          display: flex;
          gap: 0.35rem;
        }
        :global(.registration-note-field) {
          background: #f7f3ec !important;
          color: #7a6a58 !important;
          border-color: #d8cab1 !important;
          cursor: default;
          font-style: italic;
        }
      `}</style>
    </main>
  );
}
