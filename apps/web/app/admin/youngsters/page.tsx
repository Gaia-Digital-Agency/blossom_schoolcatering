'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type School = { id: string; name: string; city?: string | null };
type ParentRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
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

type CreateResult = {
  username: string;
  generatedPassword: string;
  linkedParentId: string | null;
  schoolId: string;
  lastName: string;
};

type ShowPassInfo = {
  youngsterFirstName: string;
  youngsterLastName: string;
  youngsterUsername: string;
  youngsterNewPassword: string;
  schoolName: string;
  parentLabel: string;
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
  const [createResult, setCreateResult] = useState<CreateResult | null>(null);
  const [showPassInfo, setShowPassInfo] = useState<ShowPassInfo | null>(null);

  // Youngster fields
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

  // Parent edit fields (shown when editing)
  const [pFirstName, setPFirstName] = useState('');
  const [pLastName, setPLastName] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pAddress, setPAddress] = useState('');

  const firstNameInputRef = useRef<HTMLInputElement | null>(null);

  const parentById = useMemo(() => {
    const map = new Map<string, ParentRow>();
    for (const p of parents) map.set(p.id, p);
    return map;
  }, [parents]);

  const parentLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of parents) map.set(p.id, `${p.first_name} ${p.last_name} (${p.username})`);
    return map;
  }, [parents]);

  const editingChild = useMemo(
    () => children.find((c) => c.id === editingYoungsterId) || null,
    [children, editingYoungsterId],
  );

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

  const fillParentFields = (parentId: string) => {
    const parent = parentById.get(parentId);
    if (parent) {
      setPFirstName(parent.first_name || '');
      setPLastName(parent.last_name || '');
      setPPhone(parent.phone_number || '');
      setPEmail(parent.email || '');
      setPAddress(parent.address || '');
    } else {
      setPFirstName('');
      setPLastName('');
      setPPhone('');
      setPEmail('');
      setPAddress('');
    }
  };

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
    setPFirstName('');
    setPLastName('');
    setPPhone('');
    setPEmail('');
    setPAddress('');
    setCreateResult(null);
    if (parents.length > 0) setSelectedParentId(parents[0].id);
  };

  const onEdit = (child: ChildRow) => {
    setCreateResult(null);
    setMessage('');
    setError('');
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
        : '',
    );
    const primaryParentId = (child.parent_ids || [])[0] || '';
    if (primaryParentId) {
      setSelectedParentId(primaryParentId);
      fillParentFields(primaryParentId);
    }
    window.setTimeout(() => {
      const formEl = document.getElementById('youngster-edit-form');
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      firstNameInputRef.current?.focus();
      firstNameInputRef.current?.select();
    }, 0);
  };

  const onParentChange = (newParentId: string) => {
    setSelectedParentId(newParentId);
    if (editingYoungsterId && newParentId) {
      fillParentFields(newParentId);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setCreateResult(null);
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
        // Update linked parent profile fields if any are filled
        if (selectedParentId && (pFirstName || pLastName || pPhone || pEmail || pAddress)) {
          await apiFetch(`/admin/parents/${selectedParentId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              firstName: pFirstName || undefined,
              lastName: pLastName || undefined,
              phoneNumber: pPhone || undefined,
              email: pEmail || undefined,
              address: pAddress || undefined,
            }),
          });
        }
        resetForm();
        setMessage('Youngster updated successfully.');
        await load();
      } else {
        const created = (await apiFetch('/children/register', {
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
        })) as { username: string; generatedPassword: string; linkedParentId: string | null };
        setCreateResult({
          username: created.username,
          generatedPassword: created.generatedPassword,
          linkedParentId: created.linkedParentId,
          schoolId,
          lastName,
        });
        resetForm();
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const onShowPassword = async (child: ChildRow) => {
    setError('');
    setMessage('');
    try {
      const res = (await apiFetch(
        `/admin/users/${child.user_id}/reset-password`,
        { method: 'PATCH', body: JSON.stringify({}) },
        { skipAutoReload: true },
      )) as { ok: boolean; newPassword: string; username: string };
      const parentId = (child.parent_ids || [])[0] || '';
      const parent = parentById.get(parentId);
      const parentLabel = parent
        ? `${parent.first_name} ${parent.last_name} (${parent.username})`
        : '—';
      setShowPassInfo({
        youngsterFirstName: child.first_name,
        youngsterLastName: child.last_name,
        youngsterUsername: res.username,
        youngsterNewPassword: res.newPassword,
        schoolName: child.school_name,
        parentLabel,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed resetting password');
    }
  };

  const onDelete = async (youngsterId: string) => {
    setError('');
    setMessage('');
    setCreateResult(null);
    try {
      await apiFetch(`/admin/youngsters/${youngsterId}`, { method: 'DELETE' });
      if (editingYoungsterId === youngsterId) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting youngster');
    }
  };

  const createSchoolLabel = useMemo(() => {
    if (!createResult) return '';
    const school = schools.find((s) => s.id === createResult.schoolId);
    if (!school) return '';
    return school.city ? `${school.name} (${school.city})` : school.name;
  }, [createResult, schools]);

  const createParent = useMemo(() => {
    if (!createResult?.linkedParentId) return null;
    return parentById.get(createResult.linkedParentId) || null;
  }, [createResult, parentById]);

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Youngsters</h1>
        <AdminNav />

        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        {createResult ? (
          <div className="create-result-card">
            <strong>✓ Youngster Created Successfully</strong>
            <div className="crc-grid">
              <span className="crc-label">School</span>
              <span className="crc-value">{createSchoolLabel || '—'}</span>
              <span className="crc-label">Youngster Last Name</span>
              <span className="crc-value">{createResult.lastName}</span>
              <span className="crc-label">Youngster Username</span>
              <code className="crc-value">{createResult.username}</code>
              <span className="crc-label">Youngster Password</span>
              <code className="crc-value">{createResult.generatedPassword}</code>
              {createParent ? (
                <>
                  <span className="crc-label">Parent Username</span>
                  <code className="crc-value">{createParent.username}</code>
                </>
              ) : null}
            </div>
            <button className="btn btn-outline crc-dismiss" type="button" onClick={() => setCreateResult(null)}>
              Dismiss
            </button>
          </div>
        ) : null}

        <form id="youngster-edit-form" className="auth-form" onSubmit={onSubmit}>
          <div className="form-section-title">Youngster Details</div>

          <label>
            Linked Parent (Required)
            <select
              value={selectedParentId}
              onChange={(e) => onParentChange(e.target.value)}
              required
            >
              <option value="">Select...</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({p.username})
                </option>
              ))}
            </select>
          </label>

          {editingChild ? (
            <label>
              Youngster Username
              <input value={editingChild.username} readOnly className="readonly-field" />
            </label>
          ) : null}

          <label>
            Youngster First Name
            <input
              ref={firstNameInputRef}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </label>
          <label>
            Youngster Last Name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Youngster Gender
            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNDISCLOSED">Undisclosed</option>
            </select>
          </label>
          <label>
            Youngster Date Of Birth
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              required
            />
          </label>
          <label>
            Youngster School
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select...</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.city ? ` (${s.city})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Youngster Grade on Registration Date
            <select value={schoolGrade} onChange={(e) => setSchoolGrade(e.target.value)} required>
              {GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label>
            Youngster Phone
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
          </label>
          <label>
            Youngster Email (Optional)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Youngster Allergies (Optional)
            <input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="No input = No allergies"
            />
          </label>
          {registrationNote ? (
            <label>
              Registration Note
              <input value={registrationNote} readOnly className="readonly-field registration-note-field" />
            </label>
          ) : null}

          {editingYoungsterId ? (
            <>
              <div className="form-section-title">Parent Details</div>
              {parentById.get(selectedParentId)?.username ? (
                <label>
                  Parent Username
                  <input
                    value={parentById.get(selectedParentId)?.username || ''}
                    readOnly
                    className="readonly-field"
                  />
                </label>
              ) : null}
              <label>
                Parent First Name
                <input value={pFirstName} onChange={(e) => setPFirstName(e.target.value)} />
              </label>
              <label>
                Parent Last Name
                <input value={pLastName} onChange={(e) => setPLastName(e.target.value)} />
              </label>
              <label>
                Parent Mobile Number
                <input value={pPhone} onChange={(e) => setPPhone(e.target.value)} />
              </label>
              <label>
                Parent Email
                <input type="email" value={pEmail} onChange={(e) => setPEmail(e.target.value)} />
              </label>
              <label className="span-full">
                Parent Address
                <input value={pAddress} onChange={(e) => setPAddress(e.target.value)} />
              </label>
            </>
          ) : null}

          <div className="menu-actions-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving...' : editingYoungsterId ? 'Update Youngster' : 'Create Youngster'}
            </button>
            {editingYoungsterId ? (
              <button className="btn btn-outline" type="button" onClick={resetForm}>
                Cancel Edit
              </button>
            ) : null}
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
                  <td>
                    {c.first_name} {c.last_name}
                    <br />
                    <small>{c.username}</small>
                  </td>
                  <td>
                    <code>{c.user_id}</code>
                  </td>
                  <td>
                    {(c.parent_ids || []).map((id) => parentLabelById.get(id) || id).join(', ') || '-'}
                  </td>
                  <td>{c.school_name}</td>
                  <td>{String(c.school_grade || '').replace(/^[Gg]rade\s*/, '')}</td>
                  <td>
                    <div className="action-row">
                      <button className="btn btn-outline" type="button" onClick={() => onEdit(c)}>
                        Edit
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => onDelete(c.id)}>
                        Delete
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => onShowPassword(c)}>
                        Show Password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {children.length === 0 ? (
                <tr>
                  <td colSpan={6}>No youngsters found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Show Password Modal ─────────────────────────────── */}
      {showPassInfo ? (
        <div className="pass-modal-overlay" onClick={() => setShowPassInfo(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Registration Successful Information</h2>
            <p className="pass-modal-warning">
              ⚠️ Please take this information down and keep it safely for login.
            </p>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster Name</span>
                <span className="reg-info-val">
                  {showPassInfo.youngsterFirstName} {showPassInfo.youngsterLastName}
                </span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster Username</span>
                <code className="reg-info-code">{showPassInfo.youngsterUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster New Password</span>
                <code className="reg-info-code">{showPassInfo.youngsterNewPassword}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">School</span>
                <span className="reg-info-val">{showPassInfo.schoolName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Linked Parent</span>
                <span className="reg-info-val">{showPassInfo.parentLabel}</span>
              </div>
            </div>
            <button
              className="btn btn-primary pass-modal-close"
              type="button"
              onClick={() => setShowPassInfo(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        /* ── Create-result card ────────────────────────────────── */
        .create-result-card {
          background: #f2f9f2;
          border: 1.5px solid #7ab87a;
          border-radius: 0.75rem;
          padding: 1rem 1.1rem 0.9rem;
          margin-bottom: 1.1rem;
          display: grid;
          gap: 0.55rem;
        }
        .create-result-card strong {
          color: #2a6a2a;
          font-size: 1rem;
        }
        .crc-grid {
          display: grid;
          grid-template-columns: 10rem 1fr;
          gap: 0.3rem 0.6rem;
          align-items: baseline;
        }
        .crc-label {
          font-weight: 600;
          color: #3b4a3b;
          font-size: 0.88rem;
        }
        .crc-value {
          font-size: 0.9rem;
          word-break: break-all;
        }
        code.crc-value {
          background: #e4f2e4;
          border: 1px solid #b2d8b2;
          border-radius: 0.3rem;
          padding: 0.1rem 0.45rem;
          font-family: monospace;
          font-size: 0.88rem;
        }
        .crc-dismiss {
          margin-top: 0.2rem;
          justify-self: start;
        }

        /* ── Form section titles ───────────────────────────────── */
        .form-section-title {
          font-weight: 700;
          font-size: 0.88rem;
          color: #5a4a3a;
          border-bottom: 2px solid #d8cab1;
          padding-bottom: 0.3rem;
          margin-top: 0.4rem;
          grid-column: 1 / -1;
        }
        :global(.span-full) {
          grid-column: 1 / -1 !important;
        }

        /* ── Read-only fields ──────────────────────────────────── */
        :global(.readonly-field) {
          background: #f7f3ec !important;
          color: #7a6a58 !important;
          border-color: #d8cab1 !important;
          cursor: default;
        }
        :global(.registration-note-field) {
          font-style: italic;
        }

        /* ── Table ─────────────────────────────────────────────── */
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
          font-size: 0.9rem;
          line-height: 1.35;
        }
        .kitchen-table th {
          white-space: nowrap;
        }
        .kitchen-table td {
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .kitchen-table tbody tr:last-child td {
          border-bottom: none;
        }

        /* ── Action row ────────────────────────────────────────── */
        .menu-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
          grid-column: 1 / -1;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }

        /* Mobile: hide User ID column */
        @media (max-width: 680px) {
          .kitchen-table th:nth-child(2),
          .kitchen-table td:nth-child(2) {
            display: none;
          }
          .kitchen-table th,
          .kitchen-table td {
            font-size: 0.8rem;
            padding: 0.4rem 0.45rem;
          }
          .kitchen-table th {
            white-space: nowrap;
          }
          .crc-grid {
            grid-template-columns: 8rem 1fr;
          }
        }

        /* ── Show Password Modal ─── */
        .pass-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }
        .pass-modal-card {
          background: #fff;
          border-radius: 1rem;
          padding: 1.5rem 1.6rem;
          max-width: 480px;
          width: 100%;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.22);
        }
        .pass-modal-title {
          font-size: 1.1rem;
          font-weight: 700;
          margin: 0 0 0.5rem;
        }
        .pass-modal-warning {
          font-weight: 600;
          color: #b45309;
          font-size: 0.88rem;
          margin-bottom: 0.9rem;
        }
        .reg-info-list {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          background: #f8f8f8;
          border-radius: 0.65rem;
          padding: 0.85rem 1rem;
          margin-bottom: 1.1rem;
        }
        .reg-info-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 0.4rem;
          border-bottom: 1px solid #e5e5e5;
          padding-bottom: 0.4rem;
          font-size: 0.86rem;
        }
        .reg-info-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .reg-info-label {
          color: #666;
          font-weight: 500;
          flex-shrink: 0;
        }
        .reg-info-val {
          font-weight: 600;
          text-align: right;
        }
        .reg-info-code {
          background: #e8e8e8;
          padding: 0.12rem 0.42rem;
          border-radius: 0.3rem;
          font-weight: 700;
          font-size: 0.9rem;
          letter-spacing: 0.03em;
        }
        .pass-modal-close {
          width: 100%;
          padding: 0.6rem 1.25rem;
        }
      `}</style>
    </main>
  );
}
