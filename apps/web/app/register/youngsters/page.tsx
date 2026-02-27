'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '../../../lib/auth';

type School = {
  id: string;
  name: string;
  city?: string | null;
};

type RegisterResponse = {
  parent: {
    username: string;
    generatedPassword: string | null;
    existed: boolean;
  };
  youngster: {
    username: string;
    generatedPassword: string;
    lastName: string;
  };
};

const GRADES = Array.from({ length: 12 }, (_v, i) => `Grade ${i + 1}`);

export default function YoungsterRegisterPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [youngsterFirstName, setYoungsterFirstName] = useState('');
  const [youngsterLastName, setYoungsterLastName] = useState('');
  const [youngsterGender, setYoungsterGender] = useState('UNDISCLOSED');
  const [youngsterDateOfBirth, setYoungsterDateOfBirth] = useState('');
  const [youngsterSchoolId, setYoungsterSchoolId] = useState('');
  const [youngsterGrade, setYoungsterGrade] = useState(GRADES[0]);
  const [youngsterPhone, setYoungsterPhone] = useState('');
  const [youngsterEmail, setYoungsterEmail] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentMobileNumber, setParentMobileNumber] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentAddress, setParentAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RegisterResponse | null>(null);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoadingSchools(true);
        const res = await fetch(`${getApiBase()}/auth/register/schools`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load schools');
        const data = (await res.json()) as School[];
        if (!active) return;
        setSchools(data);
        if (data.length > 0) setYoungsterSchoolId(data[0].id);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load schools');
      } finally {
        if (active) setLoadingSchools(false);
      }
    };
    run();
    return () => {
      active = false;
    };
  }, []);

  const selectedSchoolLabel = useMemo(() => {
    const found = schools.find((s) => s.id === youngsterSchoolId);
    if (!found) return '';
    return found.city ? `${found.name} (${found.city})` : found.name;
  }, [schools, youngsterSchoolId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/register/youngsters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          youngsterFirstName,
          youngsterLastName,
          youngsterGender,
          youngsterDateOfBirth,
          youngsterSchoolId,
          youngsterGrade,
          youngsterPhone,
          youngsterEmail,
          parentFirstName,
          parentLastName,
          parentMobileNumber,
          parentEmail,
          parentAddress,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Registration failed');
      }
      const data = (await res.json()) as RegisterResponse;
      setSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Youngster Registration</h1>
        <p className="auth-help">Youngster registration also creates/links the parent account in one flow.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Youngster First Name
            <input value={youngsterFirstName} onChange={(e) => setYoungsterFirstName(e.target.value)} required />
          </label>
          <label>
            Youngster Last Name
            <input value={youngsterLastName} onChange={(e) => setYoungsterLastName(e.target.value)} required />
          </label>
          <label>
            Youngster Gender
            <select value={youngsterGender} onChange={(e) => setYoungsterGender(e.target.value)} required>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNDISCLOSED">Undisclosed</option>
            </select>
          </label>
          <label>
            Youngster Date Of Birth
            <input type="date" value={youngsterDateOfBirth} onChange={(e) => setYoungsterDateOfBirth(e.target.value)} required />
          </label>
          <label>
            Youngster School
            <select
              value={youngsterSchoolId}
              onChange={(e) => setYoungsterSchoolId(e.target.value)}
              disabled={loadingSchools || schools.length === 0}
              required
            >
              {schools.length === 0 ? <option value="">No active schools available</option> : null}
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                  {school.city ? ` (${school.city})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Youngster Grade on Registration Date
            <select value={youngsterGrade} onChange={(e) => setYoungsterGrade(e.target.value)} required>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label>
            Youngster Phone
            <input value={youngsterPhone} onChange={(e) => setYoungsterPhone(e.target.value)} required />
          </label>
          <label>
            Youngster Email (Optional)
            <input type="email" value={youngsterEmail} onChange={(e) => setYoungsterEmail(e.target.value)} />
          </label>
          <label>
            Parent First Name
            <input value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} required />
          </label>
          <label>
            Parent Last Name (Must match Youngster Last Name)
            <input value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} required />
          </label>
          <label>
            Parent Mobile Number
            <input value={parentMobileNumber} onChange={(e) => setParentMobileNumber(e.target.value)} required />
          </label>
          <label>
            Parent Email
            <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
          </label>
          <label>
            Parent Address (Optional)
            <input value={parentAddress} onChange={(e) => setParentAddress(e.target.value)} />
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          {success ? (
            <div className="soft-card">
              <strong>Registration Successful</strong>
              <p className="auth-help">School: {selectedSchoolLabel || '-'}</p>
              <p className="auth-help">Youngster final last name: {success.youngster.lastName}</p>
              <p className="auth-help">
                Youngster login: <code>{success.youngster.username}</code> / <code>{success.youngster.generatedPassword}</code>
              </p>
              <p className="auth-help">
                Parent login: <code>{success.parent.username}</code> /{' '}
                <code>{success.parent.generatedPassword || 'Existing password retained'}</code>
              </p>
              {success.parent.existed ? <p className="auth-help">Parent email already existed, linked to existing parent account.</p> : null}
            </div>
          ) : null}
          <button className="btn btn-primary" type="submit" disabled={submitting || loadingSchools || schools.length === 0}>
            {submitting ? 'Creating Accounts...' : 'Register Youngster'}
          </button>
        </form>
      </section>
    </main>
  );
}
