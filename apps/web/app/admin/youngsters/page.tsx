'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch, SessionExpiredError } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type School = { id: string; name: string; city?: string | null };
type ParentRow = { id: string; first_name: string; last_name: string; username: string };
type ChildRow = { id: string; first_name: string; last_name: string; username: string; school_name: string; school_grade: string };

export default function AdminYoungstersPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('MALE');
  const [schoolId, setSchoolId] = useState('');
  const [schoolGrade, setSchoolGrade] = useState('');
  const [allergies, setAllergies] = useState('');

  const load = async () => {
    const [s, p, c] = await Promise.all([
      apiFetch('/schools?active=true') as Promise<School[]>,
      apiFetch('/admin/parents') as Promise<ParentRow[]>,
      apiFetch('/admin/children') as Promise<ChildRow[]>,
    ]);
    setSchools(s);
    setParents(p);
    setChildren(c);
    if (!schoolId && s.length) setSchoolId(s[0].id);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const data = await apiFetch('/children/register', {
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
          parentId: selectedParentId || undefined,
        }),
      }) as { username: string; generatedPassword: string };
      setMessage(`Youngster created: ${data.username} / ${data.generatedPassword}`);
      setFirstName('');
      setLastName('');
      setPhoneNumber('');
      setEmail('');
      setDateOfBirth('');
      setSchoolGrade('');
      setAllergies('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Youngsters</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            Parent (Optional)
            <select value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)}>
              <option value="">No link</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.username})</option>
              ))}
            </select>
          </label>
          <label>First Name<input value={firstName} onChange={(e) => setFirstName(e.target.value)} required /></label>
          <label>Last Name<input value={lastName} onChange={(e) => setLastName(e.target.value)} required /></label>
          <label>Phone Number<input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required /></label>
          <label>Email (Optional)<input value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>Date of Birth<input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required /></label>
          <label>
            Gender
            <select value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">MALE</option><option value="FEMALE">FEMALE</option><option value="OTHER">OTHER</option><option value="UNDISCLOSED">UNDISCLOSED</option>
            </select>
          </label>
          <label>
            School
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select...</option>
              {schools.map((s) => (<option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>))}
            </select>
          </label>
          <label>Grade<input value={schoolGrade} onChange={(e) => setSchoolGrade(e.target.value)} required /></label>
          <label>Allergies (max 9 words)<input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="No input => No Allergies" /></label>
          <button className="btn btn-primary" type="submit">Create Youngster</button>
        </form>

        <h2>Existing Youngsters</h2>
        <div className="auth-form">
          {children.map((c) => (
            <label key={c.id}><strong>{c.first_name} {c.last_name}</strong><small>{c.username}</small><small>{c.school_name} - {c.school_grade}</small></label>
          ))}
        </div>
      </section>
    </main>
  );
}
