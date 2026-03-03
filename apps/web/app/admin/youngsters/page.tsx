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

type CheckPassInfo = {
  school: string;
  lastName: string;
  youngsterUsername: string;
  youngsterPassword: string;
  parentUsername: string;
};

const GRADES = Array.from({ length: 12 }, (_v, i) => `Grade ${i + 1}`);

export default function AdminYoungstersPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [editingYoungsterId, setEditingYoungsterId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkPassInfo, setCheckPassInfo] = useState<CheckPassInfo | null>(null);

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
  const firstNameInputRef = useRef<HTMLInputElement | null>(null);

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
    setGender((child.gender || 'UNDISCLOSED').toUpperCase());
    setSchoolId(child.school_id || '');
    // Normalise: "5" → "Grade 5", "Grade 5" stays
    const raw = child.school_grade || '';
    setSchoolGrade(/^[Gg]rade\s/.test(raw) ? raw : raw ? `Grade ${raw}` : GRADES[0]);
    setAllergies(child.dietary_allergies || '');
    setRegistrationNote(
      child.registration_actor_teacher_name
        ? `Registered by Teacher: ${child.registration_actor_teacher_name}`
        : ''
    );
    if ((child.parent_ids || []).length > 0) {
      setSelectedParentId(child.parent_ids[0]);
    }
    window.setTimeout(() => {
      const formEl = document.getElementById('youngster-edit-form');
      formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      firstNameInputRef.current?.focus();
      firstNameInputRef.current?.select();
    }, 0);
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
        }, { skipAutoReload: true });
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
        }, { skipAutoReload: true }) as { username: string; generatedPassword: string };
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
      await apiFetch(`/admin/youngsters/${youngsterId}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage('Youngster deleted.');
      if (editingYoungsterId === youngsterId) resetForm();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting youngster');
    }
  };

  const onCheckPassword = async (c: ChildRow) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(
        `/admin/users/${c.user_id}/reset-password`,
        { method: 'PATCH', body: JSON.stringify({}) },
        { skipAutoReload: true },
      ) as { ok: boolean; newPassword: string; username: string };
      const parentId = (c.parent_ids || [])[0] || '';
      const parent = parents.find((p) => p.id === parentId);
      setCheckPassInfo({
        school: c.school_name || '—',
        lastName: c.last_name || '—',
        youngsterUsername: res.username,
        youngsterPassword: res.newPassword,
        parentUsername: parent?.username || '—',
      });
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

        <form id="youngster-edit-form" className="auth-form" onSubmit={onSubmit}>
          <h2 className="form-section-title">{editingYoungsterId ? 'Edit Youngster' : 'Create Youngster'}</h2>

          {/* ── Youngster Details ─────────────────────────────── */}
          <label>
            Youngster First Name *
            <input ref={firstNameInputRef} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Youngster Last Name *
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Youngster Gender *
            <select value={gender} onChange={(e) => setGender(e.target.value)} required>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
              <option value="UNDISCLOSED">Undisclosed</option>
            </select>
          </label>
          <label>
            Youngster Date Of Birth *
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required />
          </label>
          <label>
            Youngster School *
            <select value={schoolId} onChange={(e) => setSchoolId(e.target.value)} required>
              <option value="">Select school...</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}{s.city ? ` (${s.city})` : ''}</option>
              ))}
            </select>
          </label>
          <label>
            Youngster Grade on Registration Date *
            <select value={schoolGrade} onChange={(e) => setSchoolGrade(e.target.value)} required>
              {GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </label>
          <label>
            Youngster Phone *
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+[country][area][number]"
              required
            />
            <small className="field-hint">Format: + country code + area code + number &nbsp;e.g. +628123456789</small>
          </label>
          <label>
            Youngster Email (Optional)
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            Youngster Allergies
            <input
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              placeholder="Type No Allergies if none"
            />
          </label>

          {/* ── Parent Link ───────────────────────────────────── */}
          <label>
            Linked Parent (Required) *
            <select value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)} required>
              <option value="">Select parent...</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.username})</option>
              ))}
            </select>
          </label>

          {registrationNote ? (
            <label>
              Registration Note
              <input value={registrationNote} readOnly className="registration-note-field" />
            </label>
          ) : null}

          <div className="menu-actions-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Saving...' : editingYoungsterId ? 'Update Youngster' : 'Create Youngster'}
            </button>
            {editingYoungsterId ? (
              <button className="btn btn-outline" type="button" onClick={resetForm}>Cancel Edit</button>
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
                  <td>{c.first_name} {c.last_name}<br /><small>{c.username}</small></td>
                  <td><code>{c.user_id}</code></td>
                  <td>{(c.parent_ids || []).map((id) => parentLabelById.get(id) || id).join(', ') || '-'}</td>
                  <td>{c.school_name}</td>
                  <td>{String(c.school_grade || '').replace(/^[Gg]rade\s*/, '')}</td>
                  <td>
                    <div className="action-col">
                      <div className="action-row">
                        <button className="btn btn-outline" type="button" onClick={() => onEdit(c)}>Edit</button>
                        <button className="btn btn-outline" type="button" onClick={() => onDelete(c.id)}>Delete</button>
                      </div>
                      <button className="btn btn-outline" type="button" onClick={() => onCheckPassword(c)}>
                        Check Password
                      </button>
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

      {/* ── Check Password Modal ─────────────────────────────── */}
      {checkPassInfo ? (
        <div className="pass-modal-overlay" onClick={() => setCheckPassInfo(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Registration Successful Information</h2>
            <p className="pass-modal-warning">
              ⚠️ Please take this information down and keep it safely for login.
            </p>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">School</span>
                <span className="reg-info-val">{checkPassInfo.school}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster Full Last Name</span>
                <span className="reg-info-val">{checkPassInfo.lastName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster Username</span>
                <code className="reg-info-code">{checkPassInfo.youngsterUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster New Password</span>
                <code className="reg-info-code">{checkPassInfo.youngsterPassword}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent Username</span>
                <code className="reg-info-code">{checkPassInfo.parentUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent Password</span>
                <span className="reg-info-muted">Not changed — use Show Password on Parents page</span>
              </div>
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setCheckPassInfo(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .form-section-title {
          font-size: 1rem;
          font-weight: 700;
          margin: 0.5rem 0 0.1rem;
          color: var(--ink-soft, #555);
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
          font-size: 0.9rem;
          line-height: 1.35;
          overflow-wrap: anywhere;
          word-break: break-word;
        }
        .kitchen-table tbody tr:last-child td {
          border-bottom: none;
        }
        .menu-actions-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
        }
        .action-col {
          display: grid;
          gap: 0.35rem;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        :global(.registration-note-field) {
          background: #f7f3ec !important;
          color: #7a6a58 !important;
          border-color: #d8cab1 !important;
          cursor: default;
          font-style: italic;
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
        }
        /* ── Modal ── */
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
          align-items: center;
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
        .reg-info-muted {
          color: #888;
          font-style: italic;
          font-size: 0.82rem;
          text-align: right;
        }
        .pass-modal-close {
          width: 100%;
          padding: 0.6rem 1.25rem;
        }
      `}</style>
    </main>
  );
}
