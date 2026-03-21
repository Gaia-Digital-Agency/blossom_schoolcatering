'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearBrowserSession, fetchWithTimeout, getApiBase, ROLE_KEY, type Role } from '../../../lib/auth';
import { GRADE_OPTIONS } from '../../../lib/grades';

type School = {
  id: string;
  name: string;
  city?: string | null;
};

type StudentForm = {
  youngsterFirstName: string;
  youngsterDateOfBirth: string;
  youngsterSchoolId: string;
  youngsterGrade: string;
  youngsterPhone: string;
  youngsterEmail: string;
  youngsterAllergies: string;
  youngsterAllergySelection: 'NO_ALLERGIES' | 'HAS_ALLERGIES';
};

type RegisterResponse = {
  parent: {
    username: string;
    generatedPassword: string;
    firstName: string;
    lastName: string;
  };
  students: Array<{
    username: string;
    generatedPassword: string;
    firstName: string;
    schoolId: string;
  }>;
};

type RecordChild = {
  id: string;
  first_name: string;
  last_name: string;
  school_id: string;
  school_grade: string;
  date_of_birth: string;
  dietary_allergies?: string;
};

const GRADES: string[] = [...GRADE_OPTIONS];
const NO_ALLERGIES_LABEL = 'No Allergies';

function buildEmptyStudent(defaultSchoolId = ''): StudentForm {
  return {
    youngsterFirstName: '',
    youngsterDateOfBirth: '',
    youngsterSchoolId: defaultSchoolId,
    youngsterGrade: GRADES[0],
    youngsterPhone: '',
    youngsterEmail: '',
    youngsterAllergies: '',
    youngsterAllergySelection: 'NO_ALLERGIES',
  };
}

export default function YoungsterRegisterPage() {
  const router = useRouter();
  const [schools, setSchools] = useState<School[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [registrantType, setRegistrantType] = useState<'' | 'YOUNGSTER' | 'PARENT' | 'TEACHER'>('');
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [studentCount, setStudentCount] = useState(1);
  const [students, setStudents] = useState<StudentForm[]>([buildEmptyStudent()]);
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
        const defaultSchoolId = data[0]?.id || '';
        setStudents((prev) => prev.map((student) => ({
          ...student,
          youngsterSchoolId: student.youngsterSchoolId || defaultSchoolId,
        })));
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
    if (stored) setRecordRole(stored);
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
          setRegistrantType('YOUNGSTER');
        } else if (recordRole === 'PARENT') {
          const data = await apiFetch('/parent/me/children/pages') as { children?: RecordChild[] };
          const children = Array.isArray(data.children) ? data.children : [];
          if (!active) return;
          setRecordChildren(children);
          setRegistrantType('PARENT');
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
    return () => {
      active = false;
    };
  }, [isReadonlyRecord, recordRole]);

  useEffect(() => {
    if (!isReadonlyRecord) return;
    const defaultSchoolId = schools[0]?.id || '';
    const nextStudents = recordChildren.length > 0
      ? recordChildren.map((child) => {
          const allergies = (child.dietary_allergies || '').trim();
          const hasAllergies = allergies.length > 0 && allergies.toLowerCase() !== NO_ALLERGIES_LABEL.toLowerCase();
          return {
            youngsterFirstName: child.first_name || '',
            youngsterDateOfBirth: child.date_of_birth || '',
            youngsterSchoolId: child.school_id || defaultSchoolId,
            youngsterGrade: child.school_grade || GRADES[0],
            youngsterPhone: '',
            youngsterEmail: '',
            youngsterAllergies: hasAllergies ? allergies : '',
            youngsterAllergySelection: hasAllergies ? 'HAS_ALLERGIES' : 'NO_ALLERGIES',
          } as StudentForm;
        })
      : [buildEmptyStudent(defaultSchoolId)];
    setStudentCount(nextStudents.length);
    setStudents(nextStudents);
  }, [isReadonlyRecord, recordChildren, schools]);

  useEffect(() => {
    if (success) void clearBrowserSession();
  }, [success]);

  useEffect(() => {
    if (isReadonlyRecord) return;
    const defaultSchoolId = schools[0]?.id || '';
    setStudents((prev) => {
      const next = [...prev];
      while (next.length < studentCount) next.push(buildEmptyStudent(defaultSchoolId));
      return next.slice(0, studentCount).map((student) => ({
        ...student,
        youngsterSchoolId: student.youngsterSchoolId || defaultSchoolId,
      }));
    });
  }, [studentCount, schools, isReadonlyRecord]);

  const schoolLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const school of schools) {
      map.set(school.id, school.city ? `${school.name} (${school.city})` : school.name);
    }
    return map;
  }, [schools]);

  const goToPublicHome = async () => {
    await clearBrowserSession();
    router.replace('/');
  };

  const setStudentField = <K extends keyof StudentForm>(index: number, field: K, value: StudentForm[K]) => {
    setStudents((prev) => prev.map((student, studentIndex) => (
      studentIndex === index ? { ...student, [field]: value } : student
    )));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isReadonlyRecord) return;
    setError('');
    setSuccess(null);

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
    if (!parentFirstName.trim()) {
      setError('Parent First Name is required.');
      return;
    }
    if (!parentLastName.trim()) {
      setError('Family Group Name is required.');
      return;
    }
    if (!parentMobileNumber.trim()) {
      setError('Parent Phone Number is required.');
      return;
    }
    if (!parentEmail.trim()) {
      setError('Parent Email is required.');
      return;
    }
    if (!parentEmail.includes('@')) {
      setError('Parent Email must be a valid email address.');
      return;
    }
    if (!password.trim()) {
      setError('Parent Password is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError('Password must include at least 1 uppercase letter.');
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError('Password must include at least 1 number.');
      return;
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      setError('Password must include at least 1 symbol.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Parent Password and Confirm Password must match.');
      return;
    }

    const seenEmails = new Set<string>([parentEmail.trim().toLowerCase()]);
    const seenPhones = new Set<string>([parentMobileNumber.replace(/\D/g, '') || parentMobileNumber.trim()]);
    for (let index = 0; index < students.length; index += 1) {
      const student = students[index];
      const number = index + 1;
      const normalizedAllergies = student.youngsterAllergySelection === 'HAS_ALLERGIES'
        ? student.youngsterAllergies.trim().replace(/\s+/g, ' ')
        : NO_ALLERGIES_LABEL;
      if (!student.youngsterFirstName.trim()) {
        setError(`Student ${number} First Name is required.`);
        return;
      }
      if (!student.youngsterDateOfBirth) {
        setError(`Student ${number} Date Of Birth is required.`);
        return;
      }
      if (!student.youngsterGrade.trim()) {
        setError(`Student ${number} Grade at Registration Date is required.`);
        return;
      }
      if (!student.youngsterSchoolId) {
        setError(`Student ${number} School is required.`);
        return;
      }
      if (!student.youngsterPhone.trim()) {
        setError(`Student ${number} Phone Number is required.`);
        return;
      }
      const studentEmail = student.youngsterEmail.trim().toLowerCase();
      if (studentEmail && !studentEmail.includes('@')) {
        setError(`Student ${number} Email must be valid.`);
        return;
      }
      if (studentEmail && studentEmail === parentEmail.trim().toLowerCase()) {
        setError(`Student ${number} Email cannot be the same as Parent Email.`);
        return;
      }
      const phoneKey = student.youngsterPhone.replace(/\D/g, '') || student.youngsterPhone.trim();
      const parentPhoneKey = parentMobileNumber.replace(/\D/g, '') || parentMobileNumber.trim();
      if (phoneKey === parentPhoneKey) {
        setError(`Student ${number} Phone Number cannot be the same as Parent Phone Number.`);
        return;
      }
      if (studentEmail && seenEmails.has(studentEmail)) {
        setError(`Student ${number} Email must be unique.`);
        return;
      }
      if (seenPhones.has(phoneKey)) {
        setError(`Student ${number} Phone Number must be unique.`);
        return;
      }
      if (studentEmail) seenEmails.add(studentEmail);
      seenPhones.add(phoneKey);
      if (student.youngsterAllergySelection === 'HAS_ALLERGIES' && !normalizedAllergies) {
        setError(`Please enter Student ${number} allergies.`);
        return;
      }
      if (normalizedAllergies.length > 50) {
        setError(`Student ${number} allergies must be 50 characters or less.`);
        return;
      }
    }

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
          parentFirstName,
          parentLastName,
          parentMobileNumber,
          parentEmail,
          parentAddress,
          password,
          students: students.map((student) => ({
            youngsterFirstName: student.youngsterFirstName,
            youngsterDateOfBirth: student.youngsterDateOfBirth,
            youngsterSchoolId: student.youngsterSchoolId,
            youngsterGrade: student.youngsterGrade,
            youngsterPhone: student.youngsterPhone,
            youngsterEmail: student.youngsterEmail,
            youngsterAllergies: student.youngsterAllergySelection === 'HAS_ALLERGIES'
              ? student.youngsterAllergies.trim().replace(/\s+/g, ' ')
              : NO_ALLERGIES_LABEL,
          })),
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

  if (success) {
    return (
      <main className="page-auth">
        <section className="auth-panel">
          <h1>Registration Successful</h1>
          <p className="auth-help reg-save-warning">Please take this information down and keep it safely for login.</p>
          <div className="reg-success-info">
            <div className="reg-info-row">
              <span className="reg-info-label">Family Group Name</span>
              <span className="reg-info-value">{parentLastName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Parent First Name</span>
              <span className="reg-info-value">{success.parent.firstName}</span>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Family Username</span>
              <code className="reg-info-code">{success.parent.username}</code>
            </div>
            <div className="reg-info-row">
              <span className="reg-info-label">Family Password</span>
              <code className="reg-info-code">{success.parent.generatedPassword}</code>
            </div>
            {success.students.map((student, index) => (
              <div key={`${student.username}-${index}`} className="reg-student-block">
                <div className="reg-info-row">
                  <span className="reg-info-label">Student {index + 1} First Name</span>
                  <span className="reg-info-value">{student.firstName}</span>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Student {index + 1} School</span>
                  <span className="reg-info-value">{schoolLabelById.get(student.schoolId) || '-'}</span>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Student {index + 1} Username</span>
                  <code className="reg-info-code">{student.username}</code>
                </div>
                <div className="reg-info-row">
                  <span className="reg-info-label">Student {index + 1} Password</span>
                  <code className="reg-info-code">{student.generatedPassword}</code>
                </div>
              </div>
            ))}
          </div>
          {!savedInfo ? (
            <button className="btn btn-primary reg-save-btn" type="button" onClick={() => setSavedInfo(true)}>
              Have You Saved Information?
            </button>
          ) : (
            <>
              <p className="auth-help reg-saved-confirm">Saved. You can now proceed to login.</p>
              <button className="btn btn-primary reg-go-login-btn" type="button" onClick={() => void goToPublicHome()}>
                Back To Login
              </button>
            </>
          )}
          <style jsx>{`
            .reg-save-warning { font-weight: 600; color: var(--amber, #b45309); }
            .reg-success-info {
              display: flex;
              flex-direction: column;
              gap: 0.7rem;
              background: var(--surface-2, #f8f8f8);
              border-radius: 0.65rem;
              padding: 1rem 1.1rem;
              margin: 1rem 0;
            }
            .reg-student-block {
              display: grid;
              gap: 0.45rem;
              padding-top: 0.7rem;
              border-top: 1px solid var(--border, #e5e5e5);
            }
            .reg-info-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 0.5rem;
              flex-wrap: wrap;
            }
            .reg-info-label { font-size: 0.82rem; color: var(--ink-soft, #666); font-weight: 500; }
            .reg-info-value { font-weight: 600; text-align: right; }
            .reg-info-code {
              background: var(--surface-3, #e8e8e8);
              padding: 0.15rem 0.45rem;
              border-radius: 0.3rem;
              font-size: 0.92rem;
              font-weight: 700;
              letter-spacing: 0.03em;
            }
            .reg-save-btn, .reg-go-login-btn { width: 100%; }
            .reg-saved-confirm { color: var(--green, #15803d); font-weight: 600; margin-bottom: 0.5rem; }
          `}</style>
        </section>
      </main>
    );
  }

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Registration</h1>
        <div className="module-guide-card">
          Register one family together with 1 to 5 linked students.
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          {isReadonlyRecord ? (
            <p className="auth-help">Record view only. To edit registered family or student information, please request Admin.</p>
          ) : null}
          <fieldset disabled={isReadonlyRecord}>
            <fieldset className="registrant-type-fieldset">
              <legend>Registrant User</legend>
              <label className="registrant-type-option">
                <input type="radio" name="registrantType" value="PARENT" checked={registrantType === 'PARENT'} onChange={() => setRegistrantType('PARENT')} required />
                Parent
              </label>
              <label className="registrant-type-option">
                <input type="radio" name="registrantType" value="YOUNGSTER" checked={registrantType === 'YOUNGSTER'} onChange={() => setRegistrantType('YOUNGSTER')} required />
                Student
              </label>
              <label className="registrant-type-option">
                <input type="radio" name="registrantType" value="TEACHER" checked={registrantType === 'TEACHER'} onChange={() => setRegistrantType('TEACHER')} required />
                Guardian/Teacher
              </label>
            </fieldset>

            {registrantType === 'TEACHER' ? (
              <>
                <label>
                  Guardian/Teacher Name
                  <input value={teacherName} onChange={(e) => setTeacherName(e.target.value.slice(0, 50))} maxLength={50} required />
                </label>
                <label>
                  Guardian/Teacher Phone Number
                  <input value={teacherPhone} onChange={(e) => setTeacherPhone(e.target.value)} placeholder="+[country][area][number]" required />
                </label>
              </>
            ) : null}

            <label>
              Family Group Name
              <input value={parentLastName} onChange={(e) => setParentLastName(e.target.value)} required />
            </label>
            <label>
              Parent First Name
              <input value={parentFirstName} onChange={(e) => setParentFirstName(e.target.value)} required />
            </label>
            <label>
              Parent Phone Number (also Emergency Contact)
              <input value={parentMobileNumber} onChange={(e) => setParentMobileNumber(e.target.value)} placeholder="+[country][area][number]" required />
              <small className="field-hint">Format: + country code + area code + number e.g. +628123456789</small>
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
              Number Of Student
              <select value={studentCount} onChange={(e) => setStudentCount(Number(e.target.value))} disabled={isReadonlyRecord}>
                {[1, 2, 3, 4, 5].map((count) => (
                  <option key={count} value={count}>{count}</option>
                ))}
              </select>
            </label>

            {students.map((student, index) => (
              <fieldset key={index} className="student-group-fieldset">
                <legend>Student {index + 1}</legend>
                <label>
                  Student First Name
                  <input value={student.youngsterFirstName} onChange={(e) => setStudentField(index, 'youngsterFirstName', e.target.value)} required />
                </label>
                <label>
                  Date Of Birth
                  <input type="date" value={student.youngsterDateOfBirth} onChange={(e) => setStudentField(index, 'youngsterDateOfBirth', e.target.value)} required />
                </label>
                <label>
                  Grade at Registration Date
                  <select value={student.youngsterGrade} onChange={(e) => setStudentField(index, 'youngsterGrade', e.target.value)} required>
                    {GRADES.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </label>
                <label>
                  School
                  <select
                    value={student.youngsterSchoolId}
                    onChange={(e) => setStudentField(index, 'youngsterSchoolId', e.target.value)}
                    disabled={loadingSchools || schools.length === 0}
                    required
                  >
                    {schools.length === 0 ? <option value="">No active schools available</option> : null}
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}{school.city ? ` (${school.city})` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Student Phone Number
                  <input value={student.youngsterPhone} onChange={(e) => setStudentField(index, 'youngsterPhone', e.target.value)} placeholder="+[country][area][number]" required />
                </label>
                <label>
                  Student Email
                  <input type="email" value={student.youngsterEmail} onChange={(e) => setStudentField(index, 'youngsterEmail', e.target.value)} />
                </label>
                <fieldset className="allergy-fieldset">
                  <div className="allergy-title">Student Allergies (Required)</div>
                  <label className="allergy-option">
                    <input
                      type="radio"
                      name={`youngsterAllergiesChoice-${index}`}
                      value="NO_ALLERGIES"
                      checked={student.youngsterAllergySelection === 'NO_ALLERGIES'}
                      onChange={() => {
                        setStudentField(index, 'youngsterAllergySelection', 'NO_ALLERGIES');
                        setStudentField(index, 'youngsterAllergies', '');
                      }}
                    />
                    <span>No Allergies</span>
                  </label>
                  <label className="allergy-option">
                    <input
                      type="radio"
                      name={`youngsterAllergiesChoice-${index}`}
                      value="HAS_ALLERGIES"
                      checked={student.youngsterAllergySelection === 'HAS_ALLERGIES'}
                      onChange={() => setStudentField(index, 'youngsterAllergySelection', 'HAS_ALLERGIES')}
                    />
                    <span>Has Allergies</span>
                  </label>
                  {student.youngsterAllergySelection === 'HAS_ALLERGIES' ? (
                    <input
                      value={student.youngsterAllergies}
                      onChange={(e) => setStudentField(index, 'youngsterAllergies', e.target.value.slice(0, 50))}
                      placeholder="Enter allergies"
                      maxLength={50}
                      required
                    />
                  ) : null}
                </fieldset>
              </fieldset>
            ))}

            <label>
              Parent Password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <small className="field-hint">Minimum 6 characters, 1 uppercase, 1 number, 1 symbol.</small>
            </label>
            <label>
              Confirm Parent Password
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
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
        .registrant-type-fieldset,
        .student-group-fieldset,
        .allergy-fieldset {
          margin: 0;
          padding: 0.45rem 0.55rem;
          border-radius: 0.65rem;
          display: grid;
          gap: 0.45rem;
        }
        .student-group-fieldset,
        .allergy-fieldset {
          border: 1px solid #d9ccb8;
          background: #fffdf9;
        }
        .registrant-type-option,
        .allergy-option {
          display: inline-flex;
          align-items: center;
          gap: 0.42rem;
          margin: 0;
          font-size: 0.88rem;
        }
        .allergy-title {
          font-weight: 700;
          font-size: 0.92rem;
          line-height: 1.2;
        }
      `}</style>
    </main>
  );
}
