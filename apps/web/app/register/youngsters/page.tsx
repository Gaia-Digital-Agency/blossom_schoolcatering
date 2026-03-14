'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearBrowserSession, fetchWithTimeout, getApiBase, ROLE_KEY, type Role } from '../../../lib/auth';

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

type RecordChild = {
  id: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_grade: string;
  gender: string;
  date_of_birth: string;
  dietary_allergies?: string;
};

const GRADES = Array.from({ length: 12 }, (_v, i) => `Grade ${i + 1}`);

export default function YoungsterRegisterPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [registrantType, setRegistrantType] = useState<'' | 'YOUNGSTER' | 'PARENT' | 'TEACHER'>('');
  const [teacherName, setTeacherName] = useState('');
  const [youngsterFirstName, setYoungsterFirstName] = useState('');
  const [youngsterLastName, setYoungsterLastName] = useState('');
  const [youngsterGender, setYoungsterGender] = useState('UNDISCLOSED');
  const [youngsterDateOfBirth, setYoungsterDateOfBirth] = useState('');
  const [youngsterSchoolId, setYoungsterSchoolId] = useState('');
  const [youngsterGrade, setYoungsterGrade] = useState(GRADES[0]);
  const [youngsterPhone, setYoungsterPhone] = useState('');
  const [youngsterEmail, setYoungsterEmail] = useState('');
  const [youngsterAllergies, setYoungsterAllergies] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentMobileNumber, setParentMobileNumber] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentAddress, setParentAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RegisterResponse | null>(null);
  const [savedInfo, setSavedInfo] = useState(false);
  const [recordRole, setRecordRole] = useState<Role | ''>('');
  const [recordChildren, setRecordChildren] = useState<RecordChild[]>([]);
  const [recordChildId, setRecordChildId] = useState('');
  const [isRecordMode, setIsRecordMode] = useState(false);

  const isReadonlyRecord = isRecordMode && (recordRole === 'PARENT' || recordRole === 'YOUNGSTER');

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        setLoadingSchools(true);
        const res = await fetchWithTimeout(`${getApiBase()}/auth/register/schools`, { credentials: 'include' });
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsRecordMode(new URLSearchParams(window.location.search).get('mode') === 'record');
    const stored = localStorage.getItem(ROLE_KEY) as Role | null;
    if (!stored) return;
    setRecordRole(stored);
  }, []);

  useEffect(() => {
    if (!isReadonlyRecord) return;
    let active = true;
    const loadRecord = async () => {
      try {
        setError('');
        if (recordRole === 'YOUNGSTER') {
          const child = await apiFetch('/children/me') as RecordChild;
          if (!active) return;
          setRecordChildren([child]);
          setRecordChildId(child.id);
          setRegistrantType('YOUNGSTER');
          return;
        }

        if (recordRole === 'PARENT') {
          const data = await apiFetch('/parent/me/children/pages') as { children?: RecordChild[] };
          const children = Array.isArray(data.children) ? data.children : [];
          if (!active) return;
          setRecordChildren(children);
          if (children.length > 0) {
            setRecordChildId(children[0].id);
            setRegistrantType('PARENT');
          }

          const me = await apiFetch('/auth/me') as { displayName?: string };
          const fullName = (me.displayName || '').trim();
          if (fullName) {
            const parts = fullName.split(/\s+/);
            setParentFirstName(parts[0] || '');
            setParentLastName(parts.slice(1).join(' ') || '');
          }
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load youngster record');
      }
    };
    loadRecord();
    return () => { active = false; };
  }, [isReadonlyRecord, recordRole]);

  const selectedRecordChild = useMemo(
    () => recordChildren.find((c) => c.id === recordChildId) || null,
    [recordChildren, recordChildId],
  );

  useEffect(() => {
    if (!isReadonlyRecord || !selectedRecordChild) return;
    setYoungsterFirstName(selectedRecordChild.first_name || '');
    setYoungsterLastName(selectedRecordChild.last_name || '');
    setYoungsterGender((selectedRecordChild.gender || 'UNDISCLOSED').toUpperCase());
    setYoungsterDateOfBirth(selectedRecordChild.date_of_birth || '');
    setYoungsterSchoolId(selectedRecordChild.school_id || '');
    setYoungsterGrade(selectedRecordChild.school_grade || '');
    setYoungsterAllergies(selectedRecordChild.dietary_allergies || 'No Allergies');
    setParentLastName(selectedRecordChild.last_name || '');
  }, [isReadonlyRecord, selectedRecordChild]);

  const selectedSchoolLabel = useMemo(() => {
    const found = schools.find((s) => s.id === youngsterSchoolId);
    if (!found) return '';
    return found.city ? `${found.name} (${found.city})` : found.name;
  }, [schools, youngsterSchoolId]);
  const successMode = registrantType === 'YOUNGSTER' ? 'YOUNGSTER' : 'PARENT';

  useEffect(() => {
    if (!success) return;
    void clearBrowserSession();
  }, [success]);

  const goToPublicHome = async () => {
    await clearBrowserSession();
    router.replace('/');
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isReadonlyRecord) return;
    setError('');
    setSuccess(null);

    // ── Client-side validation with clear messages ─────────────────────────
    if (!registrantType) {
      setError('Please select who is registering: Youngster, Parent, or Teacher.');
      return;
    }
    if (registrantType === 'TEACHER' && !teacherName.trim()) {
      setError('Teacher name is required when registering as a Teacher.');
      return;
    }
    if (!youngsterFirstName.trim()) { setError('Youngster first name is required.'); return; }
    if (!youngsterLastName.trim()) { setError('Youngster last name is required.'); return; }
    if (!youngsterDateOfBirth) { setError('Youngster date of birth is required.'); return; }
    if (!youngsterSchoolId) { setError('Please select the youngster\'s school.'); return; }
    if (!youngsterPhone.trim()) { setError('Youngster phone number is required.'); return; }
    if (!youngsterAllergies.trim()) { setError('Youngster allergies field is required — type "No Allergies" if none.'); return; }
    if (!parentFirstName.trim()) { setError('Parent first name is required.'); return; }
    if (!parentLastName.trim()) { setError('Parent last name is required.'); return; }
    if (parentLastName.trim().toLowerCase() !== youngsterLastName.trim().toLowerCase()) {
      setError('Parent last name must match Youngster last name exactly.');
      return;
    }
    if (!parentMobileNumber.trim()) { setError('Parent mobile number is required.'); return; }
    if (!parentEmail.trim()) { setError('Parent email is required.'); return; }
    if (!parentEmail.includes('@')) { setError('Parent email must be a valid email address.'); return; }
    // ──────────────────────────────────────────────────────────────────────

    setSubmitting(true);
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/register/youngster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          registrantType,
          teacherName: registrantType === 'TEACHER' ? teacherName : '',
          youngsterFirstName,
          youngsterLastName,
          youngsterGender,
          youngsterDateOfBirth,
          youngsterSchoolId,
          youngsterGrade,
          youngsterPhone,
          youngsterEmail,
          youngsterAllergies,
          parentFirstName,
          parentLastName,
          parentMobileNumber,
          parentEmail,
          parentAddress,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string | string[]; error?: { message?: string; details?: string[] } };
        const raw = body.message ?? body.error?.message ?? body.error?.details?.join(', ');
        throw new Error(Array.isArray(raw) ? raw.join(', ') : (raw || 'Registration failed'));
      }
      const data = (await res.json()) as RegisterResponse;
      setSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen: replaces the entire form ───────────────────────────
  if (success) {
    return (
      <main className="page-auth">
        <section className="auth-panel">
          <h1>{successMode === 'YOUNGSTER' ? 'Youngster Registration Successful' : 'Parent Registration Successful'}</h1>
          <p className="auth-help reg-save-warning">
            ⚠️ Please take this information down and keep it safely for login.
          </p>
          <div className="reg-success-info">
            <div className="reg-info-row">
              <span className="reg-info-label">School</span>
              <span className="reg-info-value">{selectedSchoolLabel || '-'}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Youngster Last Name</span>
              <span className="reg-info-value">{success.youngster.lastName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Youngster First Name</span>
              <span className="reg-info-value">{youngsterFirstName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Parent First Name</span>
              <span className="reg-info-value">{parentFirstName}</span>
            </div>
            {successMode === 'YOUNGSTER' ? (
              <>
                <div className="reg-info-row">
                  <span className="reg-info-label">Youngster Username</span>
                  <code className="reg-info-code">{success.youngster.username}</code>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Youngster Password</span>
                  <code className="reg-info-code">{success.youngster.generatedPassword}</code>
                </div>
              </>
            ) : (
              <>
                <div className="reg-info-row">
                  <span className="reg-info-label">Parent Username</span>
                  <code className="reg-info-code">{success.parent.username}</code>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Parent Password</span>
                  <code className="reg-info-code">
                    {success.parent.generatedPassword || 'Existing password retained'}
                  </code>
                </div>
              </>
            )}
            {success.parent.existed ? (
              <p className="reg-info-note">
                ℹ️ Parent email already existed — linked to the existing parent account.
              </p>
            ) : null}
          </div>

          {!savedInfo ? (
            <button
              className="btn btn-primary reg-save-btn"
              type="button"
              onClick={() => setSavedInfo(true)}
            >
              Have You Saved Information?
            </button>
          ) : (
            <>
              <p className="auth-help reg-saved-confirm">✓ Great! You can now proceed to login.</p>
              <button
                className="btn btn-primary reg-go-login-btn"
                type="button"
                onClick={() => void goToPublicHome()}
              >
                Back To Homepage
              </button>
            </>
          )}
        <style jsx>{`
          .reg-save-warning {
            font-weight: 600;
            color: var(--amber, #b45309);
          }
          .reg-success-info {
            display: flex;
            flex-direction: column;
            gap: 0.55rem;
            background: var(--surface-2, #f8f8f8);
            border-radius: 0.65rem;
            padding: 1rem 1.1rem;
            margin: 1rem 0;
          }
          .reg-info-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 0.5rem;
            flex-wrap: wrap;
            border-bottom: 1px solid var(--border, #e5e5e5);
            padding-bottom: 0.45rem;
          }
          .reg-info-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }
          .reg-info-label {
            font-size: 0.82rem;
            color: var(--ink-soft, #666);
            font-weight: 500;
            flex-shrink: 0;
          }
          .reg-info-value {
            font-weight: 600;
            text-align: right;
          }
          .reg-info-code {
            background: var(--surface-3, #e8e8e8);
            padding: 0.15rem 0.45rem;
            border-radius: 0.3rem;
            font-size: 0.92rem;
            font-weight: 700;
            letter-spacing: 0.03em;
          }
          .reg-info-note {
            font-size: 0.82rem;
            color: var(--ink-soft, #666);
            margin: 0.25rem 0 0;
          }
          .reg-save-btn {
            width: 100%;
            margin-top: 0.5rem;
          }
          .reg-saved-confirm {
            color: var(--green, #15803d);
            font-weight: 600;
            margin-bottom: 0.5rem;
          }
          .reg-go-login-btn {
            width: 100%;
            padding: 0.65rem 1.25rem;
            margin-top: 0.25rem;
          }
        `}</style>
        </section>
    </main>
  );
  }
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Registration</h1>
        <p className="auth-help">One registration flow handles youngster, parent, and teacher registrations.</p>
        <form onSubmit={onSubmit} className="auth-form">
          {isReadonlyRecord ? (
            <p className="auth-help">
              Record view only. To edit registered youngster information, please request Admin.
            </p>
          ) : null}
          {isReadonlyRecord && recordRole === 'PARENT' && recordChildren.length > 1 ? (
            <label>
              Youngster Record
              <select value={recordChildId} onChange={(e) => setRecordChildId(e.target.value)}>
                {recordChildren.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.first_name} {child.last_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <fieldset disabled={isReadonlyRecord}>
          <fieldset className="registrant-type-fieldset">
            <legend>Are You the Youngster, Parent, Teacher? (required)</legend>
            <label className="registrant-type-option">
              <input
                type="radio"
                name="registrantType"
                value="YOUNGSTER"
                checked={registrantType === 'YOUNGSTER'}
                onChange={() => setRegistrantType('YOUNGSTER')}
                required
              />
              Youngster
            </label>
            <label className="registrant-type-option">
              <input
                type="radio"
                name="registrantType"
                value="PARENT"
                checked={registrantType === 'PARENT'}
                onChange={() => setRegistrantType('PARENT')}
                required
              />
              Parent
            </label>
            <label className="registrant-type-option">
              <input
                type="radio"
                name="registrantType"
                value="TEACHER"
                checked={registrantType === 'TEACHER'}
                onChange={() => setRegistrantType('TEACHER')}
                required
              />
              Teacher
            </label>
          </fieldset>
          {registrantType === 'TEACHER' ? (
            <label>
              Teacher Name (Max 50 Characters)
              <input
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value.slice(0, 50))}
                maxLength={50}
                required
              />
            </label>
          ) : null}
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
            <input value={youngsterPhone} onChange={(e) => setYoungsterPhone(e.target.value)} placeholder="+[country][area][number]" required />
            <small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small>
          </label>
          <label>
            Youngster Email (Optional)
            <input type="email" value={youngsterEmail} onChange={(e) => setYoungsterEmail(e.target.value)} />
          </label>
          <label>
            Youngster Allergies (Required)
            <input
              value={youngsterAllergies}
              onChange={(e) => setYoungsterAllergies(e.target.value)}
              placeholder="Type No Allergies if none"
              required
            />
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
            <input value={parentMobileNumber} onChange={(e) => setParentMobileNumber(e.target.value)} placeholder="+[country][area][number]" required />
            <small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small>
          </label>
          <label>
            Parent Email
            <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
          </label>
          <label>
            Parent Address (Optional)
            <input value={parentAddress} onChange={(e) => setParentAddress(e.target.value)} />
          </label>
          </fieldset>
          {error ? <p className="auth-error">{error}</p> : null}
          {!isReadonlyRecord ? (
            <button className="btn btn-primary" type="submit" disabled={submitting || loadingSchools || schools.length === 0}>
              {submitting ? 'Creating Accounts...' : 'Register'}
            </button>
          ) : null}
        </form>
      </section>
      <style jsx>{`
        .registrant-type-fieldset {
          margin: 0;
          padding: 0.45rem 0.55rem;
          border-radius: 0.55rem;
          display: grid;
          gap: 0.35rem;
        }
        .registrant-type-option {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          margin: 0;
          font-size: 0.88rem;
        }
        .registrant-type-option input[type='radio'] {
          width: 1rem;
          height: 1rem;
          min-height: 0;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </main>
  );
}
