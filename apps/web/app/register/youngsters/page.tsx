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
const NO_ALLERGIES_LABEL = 'No Allergies';

export default function YoungsterRegisterPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [registrantType, setRegistrantType] = useState<'' | 'YOUNGSTER' | 'PARENT' | 'TEACHER'>('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [youngsterFirstName, setYoungsterFirstName] = useState('');
  const [youngsterDateOfBirth, setYoungsterDateOfBirth] = useState('');
  const [youngsterSchoolId, setYoungsterSchoolId] = useState('');
  const [youngsterGrade, setYoungsterGrade] = useState(GRADES[0]);
  const [youngsterPhone, setYoungsterPhone] = useState('');
  const [youngsterEmail, setYoungsterEmail] = useState('');
  const [youngsterAllergySelection, setYoungsterAllergySelection] = useState<'NO_ALLERGIES' | 'HAS_ALLERGIES'>('NO_ALLERGIES');
  const [youngsterAllergies, setYoungsterAllergies] = useState('');
  const [parentFirstName, setParentFirstName] = useState('');
  const [parentLastName, setParentLastName] = useState('');
  const [parentMobileNumber, setParentMobileNumber] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentAddress, setParentAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
        setError(err instanceof Error ? err.message : 'Failed to load student record');
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
    setYoungsterDateOfBirth(selectedRecordChild.date_of_birth || '');
    setYoungsterSchoolId(selectedRecordChild.school_id || '');
    setYoungsterGrade(selectedRecordChild.school_grade || '');
    const existingAllergies = (selectedRecordChild.dietary_allergies || '').trim();
    const hasRecordedAllergies = existingAllergies.length > 0 && existingAllergies.toLowerCase() !== NO_ALLERGIES_LABEL.toLowerCase();
    setYoungsterAllergySelection(hasRecordedAllergies ? 'HAS_ALLERGIES' : 'NO_ALLERGIES');
    setYoungsterAllergies(hasRecordedAllergies ? existingAllergies : '');
    setParentLastName(selectedRecordChild.last_name || '');
  }, [isReadonlyRecord, selectedRecordChild]);

  const selectedSchoolLabel = useMemo(() => {
    const found = schools.find((s) => s.id === youngsterSchoolId);
    if (!found) return '';
    return found.city ? `${found.name} (${found.city})` : found.name;
  }, [schools, youngsterSchoolId]);
  const successMode = registrantType === 'YOUNGSTER' ? 'YOUNGSTER' : 'PARENT';
  const normalizedYoungsterAllergies = youngsterAllergySelection === 'HAS_ALLERGIES'
    ? youngsterAllergies.trim().replace(/\s+/g, ' ')
    : NO_ALLERGIES_LABEL;

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
      setError('Please select a Registrant User.');
      return;
    }
    if (registrantType === 'TEACHER' && !teacherName.trim()) {
      setError('Guardian/Teacher name is required.');
      return;
    }
    if (registrantType === 'TEACHER' && !teacherPhone.trim()) {
      setError('Guardian/Teacher phone number is required.');
      return;
    }
    if (!youngsterFirstName.trim()) { setError('Student first name is required.'); return; }
    if (!youngsterDateOfBirth) { setError('Student date of birth is required.'); return; }
    if (!youngsterGrade.trim()) { setError('Student grade on registration date is required.'); return; }
    if (!youngsterSchoolId) { setError('Please select the student school.'); return; }
    if (!youngsterPhone.trim()) { setError('Student phone is required.'); return; }
    if (youngsterAllergySelection === 'HAS_ALLERGIES' && !normalizedYoungsterAllergies) {
      setError('Please enter the student allergies.');
      return;
    }
    if (normalizedYoungsterAllergies.length > 50) {
      setError('Student allergies must be 50 characters or less.');
      return;
    }
    if (!parentFirstName.trim()) { setError('Parent/Guardian name is required.'); return; }
    if (!parentLastName.trim()) { setError('Family Group is required.'); return; }
    if (!parentMobileNumber.trim()) { setError('Parent/Guardian mobile number is required.'); return; }
    if (!parentEmail.trim()) { setError('Parent/Guardian email is required.'); return; }
    if (!parentEmail.includes('@')) { setError('Parent/Guardian email must be a valid email address.'); return; }
    if (!password.trim()) { setError('Password is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (!/[A-Z]/.test(password)) { setError('Password must include at least 1 uppercase letter.'); return; }
    if (!/[0-9]/.test(password)) { setError('Password must include at least 1 number.'); return; }
    if (!/[^A-Za-z0-9]/.test(password)) { setError('Password must include at least 1 symbol.'); return; }
    if (password !== confirmPassword) { setError('Password and Confirm Password must match.'); return; }
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
          teacherPhone: registrantType === 'TEACHER' ? teacherPhone : '',
          youngsterFirstName,
          youngsterDateOfBirth,
          youngsterSchoolId,
          youngsterGrade,
          youngsterPhone,
          youngsterEmail,
          youngsterAllergies: normalizedYoungsterAllergies,
          parentFirstName,
          parentLastName,
          parentMobileNumber,
          parentEmail,
          parentAddress,
          password,
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
          <h1>{successMode === 'YOUNGSTER' ? 'Student Registration Successful' : 'Family Registration Successful'}</h1>
          <p className="auth-help reg-save-warning">
            ⚠️ Please take this information down and keep it safely for login.
          </p>
          <div className="reg-success-info">
            <div className="reg-info-row">
              <span className="reg-info-label">School</span>
              <span className="reg-info-value">{selectedSchoolLabel || '-'}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Family Group</span>
              <span className="reg-info-value">{parentLastName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Student First Name</span>
              <span className="reg-info-value">{youngsterFirstName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Parent First Name</span>
              <span className="reg-info-value">{parentFirstName}</span>
            </div>
            {successMode === 'YOUNGSTER' ? (
              <>
                <div className="reg-info-row">
                  <span className="reg-info-label">Student Username</span>
                  <code className="reg-info-code">{success.youngster.username}</code>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Student Password</span>
                  <code className="reg-info-code">{success.youngster.generatedPassword}</code>
                </div>
              </>
            ) : (
              <>
                <div className="reg-info-row">
                  <span className="reg-info-label">Family Username</span>
                  <code className="reg-info-code">{success.parent.username}</code>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Family Password</span>
                  <code className="reg-info-code">
                    {success.parent.generatedPassword || 'Existing password retained'}
                  </code>
                </div>
              </>
            )}
            {success.parent.existed ? (
              <p className="reg-info-note">
                Existing Family Group email found and linked to the existing family account.
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
                Back To Login
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
        <p className="auth-help">One registration flow handles student, family, and Guardian/Teacher registrations.</p>
        <form onSubmit={onSubmit} className="auth-form">
          {isReadonlyRecord ? (
            <p className="auth-help">
              Record view only. To edit registered student information, please request Admin.
            </p>
          ) : null}
          {isReadonlyRecord && recordRole === 'PARENT' && recordChildren.length > 1 ? (
            <label>
              Student Record
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
            <legend>Registrant User</legend>
            <label className="registrant-type-option">
              <input
                type="radio"
                name="registrantType"
                value="PARENT"
                checked={registrantType === 'PARENT'}
                onChange={() => setRegistrantType('PARENT')}
                required
              />
              Family
            </label>
            <label className="registrant-type-option">
              <input
                type="radio"
                name="registrantType"
                value="YOUNGSTER"
                checked={registrantType === 'YOUNGSTER'}
                onChange={() => setRegistrantType('YOUNGSTER')}
                required
              />
              Student
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
              Guardian/Teacher
            </label>
          </fieldset>
          {registrantType === 'TEACHER' ? (
            <>
            <label>
              Guardian/Teacher Name
              <input
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value.slice(0, 50))}
                maxLength={50}
                required
              />
            </label>
            <label>
              Guardian/Teacher Phone Number
              <input
                value={teacherPhone}
                onChange={(e) => setTeacherPhone(e.target.value)}
                placeholder="+[country][area][number]"
                required
              />
            </label>
            </>
          ) : null}
          <label>
            Family Group Name
            <input value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} required />
          </label>
          <label>
            Student First Name
            <input value={youngsterFirstName} onChange={(e) => setYoungsterFirstName(e.target.value)} required />
          </label>
          <label>
            Student Date Of Birth
            <input type="date" value={youngsterDateOfBirth} onChange={(e) => setYoungsterDateOfBirth(e.target.value)} required />
          </label>
          <label>
            Student Grade on Registration Date
            <select value={youngsterGrade} onChange={(e) => setYoungsterGrade(e.target.value)} required>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label>
            Student School
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
            Student Phone
            <input
              value={youngsterPhone}
              onChange={(e) => setYoungsterPhone(e.target.value)}
              placeholder="+[country][area][number]"
              required
            />
            <small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small>
          </label>
          <label>
            Student Email (Optional)
            <input type="email" value={youngsterEmail} onChange={(e) => setYoungsterEmail(e.target.value)} />
          </label>
          <fieldset className="allergy-fieldset">
            <div className="allergy-title">Student Allergies (Required)</div>
            <label className="allergy-option">
              <input
                type="radio"
                name="youngsterAllergiesChoice"
                value="NO_ALLERGIES"
                checked={youngsterAllergySelection === 'NO_ALLERGIES'}
                onChange={() => {
                  setYoungsterAllergySelection('NO_ALLERGIES');
                  setYoungsterAllergies('');
                }}
              />
              <span>No Allergies</span>
            </label>
            <label className="allergy-option">
              <input
                type="radio"
                name="youngsterAllergiesChoice"
                value="HAS_ALLERGIES"
                checked={youngsterAllergySelection === 'HAS_ALLERGIES'}
                onChange={() => setYoungsterAllergySelection('HAS_ALLERGIES')}
              />
              <span>Has Allergies</span>
            </label>
            {youngsterAllergySelection === 'HAS_ALLERGIES' ? (
              <input
                value={youngsterAllergies}
                onChange={(e) => setYoungsterAllergies(e.target.value.slice(0, 50))}
                placeholder="Enter allergies"
                maxLength={50}
                required
              />
            ) : null}
          </fieldset>
          <label>
            Parent First Name
            <input value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} required />
          </label>
          <label>
            Parent Phone Number (also Emergency Contact)
            <input value={parentMobileNumber} onChange={(e) => setParentMobileNumber(e.target.value)} placeholder="+[country][area][number]" required />
            <small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small>
          </label>
          <label>
            Parent Email
            <input type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required />
          </label>
          <label>
            Parent/Guardian Address (Optional)
            <input value={parentAddress} onChange={(e) => setParentAddress(e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <small className="field-hint">Minimum 6 characters, 1 uppercase, 1 number, 1 symbol.</small>
          </label>
          <label>
            Confirm Password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
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
          padding: 0.35rem 0.45rem;
          border-radius: 0.55rem;
          display: grid;
          gap: 0.25rem;
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
        .allergy-fieldset {
          margin: 0;
          padding: 0.45rem 0.55rem;
          border: 1px solid #d9ccb8;
          border-radius: 0.65rem;
          display: grid;
          gap: 0.25rem;
          background: #fffdf9;
        }
        .allergy-title {
          font-weight: 700;
          font-size: 0.92rem;
          line-height: 1.2;
          margin: 0 0 0.1rem;
        }
        .allergy-option {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          margin: 0;
          font-size: 0.88rem;
        }
      `}</style>
    </main>
  );
}
