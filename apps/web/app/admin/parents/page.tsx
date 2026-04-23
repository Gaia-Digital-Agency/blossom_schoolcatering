'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type ParentYoungster = { id: string; name: string; school_name?: string | null };
type ParentTeacherGuardian = {
  student_name?: string | null;
  teacher_name?: string | null;
  teacher_phone?: string | null;
};
type ParentRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone_number?: string | null;
  address?: string | null;
  linked_children_count: number;
  billing_count: number;
  youngsters: ParentYoungster[];
  teacher_guardians: ParentTeacherGuardian[];
  schools: string[];
  parent2_first_name?: string | null;
  parent2_phone?: string | null;
  parent2_email?: string | null;
};

type ShowPassInfo = {
  parentFirstName: string;
  parentLastName: string;
  parentUsername: string;
  parentPassword: string;
  youngsters: { name: string; school: string }[];
};

type ShowIdInfo = {
  parentName: string;
  parentId: string;
  parentUsername: string;
  parentPassword: string;
};

type ShowTeacherGuardianInfo = {
  familyGroup: string;
  entries: Array<{
    studentName: string;
    teacherName: string;
    teacherPhone: string;
  }>;
};

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassInfo, setShowPassInfo] = useState<ShowPassInfo | null>(null);
  const [showIdInfo, setShowIdInfo] = useState<ShowIdInfo | null>(null);
  const [showTeacherGuardianInfo, setShowTeacherGuardianInfo] = useState<ShowTeacherGuardianInfo | null>(null);
  const [showParent2Info, setShowParent2Info] = useState<{ familyGroup: string; firstName: string; phone?: string | null; email?: string | null } | null>(null);

  // Edit modal state
  const [editParent, setEditParent] = useState<ParentRow | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editP2FirstName, setEditP2FirstName] = useState('');
  const [editP2Phone, setEditP2Phone] = useState('');
  const [editP2Email, setEditP2Email] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  const load = async () => {
    const p = await apiFetch('/admin/parent') as ParentRow[];
    setParents(p || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  const onShowPassword = async (p: ParentRow) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(
        `/admin/users/${p.user_id}/password`,
        { method: 'GET' },
        { skipAutoReload: true },
      ) as { ok: boolean; password: string; username: string };
      setShowPassInfo({
        parentFirstName: p.first_name,
        parentLastName: p.last_name,
        parentUsername: res.username,
        parentPassword: res.password,
        youngsters: (p.youngsters || []).map((y) => ({
          name: y.name,
          school: y.school_name || '—',
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading password');
    }
  };

  const onResetPassword = async (p: ParentRow) => {
    const newPassword = window.prompt(`Set new password for parent "${p.first_name} ${p.last_name}"`, '');
    if (newPassword === null) return;
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(
        `/admin/users/${p.user_id}/reset-password`,
        { method: 'PATCH', body: JSON.stringify({ newPassword }) },
        { skipAutoReload: true },
      ) as { ok: boolean; newPassword: string; username: string };
      setShowPassInfo({
        parentFirstName: p.first_name,
        parentLastName: p.last_name,
        parentUsername: res.username,
        parentPassword: res.newPassword,
        youngsters: (p.youngsters || []).map((y) => ({
          name: y.name,
          school: y.school_name || '—',
        })),
      });
      setMessage(`New password set for ${p.first_name} ${p.last_name}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed resetting password');
    }
  };

  const onDeleteParent = async (p: ParentRow) => {
    if (p.linked_children_count > 0) {
      setError('Cannot delete parent with associated youngster(s).');
      return;
    }
    if (p.billing_count > 0) {
      setError('Cannot delete parent with attached billing. Resolve or remove billing first.');
      return;
    }
    if (!window.confirm(`Delete parent "${p.first_name} ${p.last_name}"? This cannot be undone.`)) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/admin/parent/${p.id}`, { method: 'DELETE' }, { skipAutoReload: true });
      setMessage(`Parent deleted: ${p.first_name} ${p.last_name}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed deleting parent');
    }
  };

  const deleteDisabled = (p: ParentRow) => p.linked_children_count > 0 || p.billing_count > 0;
  const deleteTitle = (p: ParentRow) => {
    if (p.linked_children_count > 0 && p.billing_count > 0) {
      return 'Cannot delete while parent still has linked youngster(s) and attached billing.';
    }
    if (p.linked_children_count > 0) {
      return 'Cannot delete while parent still has linked youngster(s).';
    }
    if (p.billing_count > 0) {
      return 'Cannot delete while parent still has attached billing.';
    }
    return 'Delete parent';
  };

  const onShowId = async (p: ParentRow) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(
        `/admin/users/${p.user_id}/password`,
        { method: 'GET' },
        { skipAutoReload: true },
      ) as { ok: boolean; password: string; username: string };
      setShowIdInfo({
        parentName: `${p.first_name} ${p.last_name}`,
        parentId: p.id,
        parentUsername: res.username,
        parentPassword: res.password,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed loading ID');
    }
  };

  const onOpenEdit = (p: ParentRow) => {
    setEditParent(p);
    setEditFirstName(p.first_name || '');
    setEditLastName(p.last_name || '');
    setEditPhone(p.phone_number || '');
    setEditEmail(p.email || '');
    setEditAddress(p.address || '');
    setEditP2FirstName(p.parent2_first_name || '');
    setEditP2Phone(p.parent2_phone || '');
    setEditP2Email(p.parent2_email || '');
    setEditError('');
  };

  const onEditSave = async () => {
    if (!editParent) return;
    if (!editFirstName.trim()) { setEditError('First Name is required.'); return; }
    if (!editLastName.trim()) { setEditError('Parent Last Name is required.'); return; }
    if (!editPhone.trim()) { setEditError('Phone Number is required.'); return; }
    if (!editEmail.trim()) { setEditError('Email is required.'); return; }
    if (!editEmail.includes('@')) { setEditError('Email must be valid.'); return; }
    setEditBusy(true);
    setEditError('');
    try {
      await apiFetch(`/admin/parent/${editParent.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: editFirstName.trim(),
          lastName: editLastName.trim(),
          phoneNumber: editPhone.trim(),
          email: editEmail.trim(),
          address: editAddress.trim() || undefined,
          parent2FirstName: editP2FirstName.trim() || undefined,
          parent2Phone: editP2Phone.trim() || undefined,
          parent2Email: editP2Email.trim() || undefined,
        }),
      });
      setMessage(`Family "${editLastName.trim()}" updated successfully.`);
      setEditParent(null);
      await load();
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setEditBusy(false);
    }
  };

  const teacherGuardianEntries = (p: ParentRow) => (p.teacher_guardians || [])
    .map((entry) => ({
      studentName: String(entry.student_name || '').trim(),
      teacherName: String(entry.teacher_name || '').trim(),
      teacherPhone: String(entry.teacher_phone || '').trim(),
    }))
    .filter((entry) => entry.teacherName);

  const onShowTeacherGuardian = (p: ParentRow) => {
    const entries = teacherGuardianEntries(p);
    if (entries.length === 0) return;
    setShowTeacherGuardianInfo({
      familyGroup: p.last_name,
      entries,
    });
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Family</h1>
        <AdminNav />
        <div className="module-guide-card">
          Review Family records, linked students, teacher or guardian details, and billing counts. Student edits are managed in Admin Student.
        </div>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>Existing Family</h2>
        <div className="kitchen-table-wrap">
          <table className="kitchen-table admin-parents-table">
            <thead>
              <tr>
                <th>Family Group</th>
                <th>Parent #1</th>
                <th>Parent #2 / Guardian</th>
                <th>Username</th>
                <th>Student</th>
                <th>School</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parents.map((p) => {
                const tgEntries = teacherGuardianEntries(p);
                return (
                <tr key={p.id}>
                  <td>{p.last_name}</td>
                  <td>{p.first_name}</td>
                  <td>
                    {p.parent2_first_name ? (
                      <div className="guardian-info">
                        <span className="guardian-badge">Parent #2</span>
                        <span className="guardian-name">{p.parent2_first_name}</span>
                        {p.parent2_phone ? <span className="guardian-detail">{p.parent2_phone}</span> : null}
                        {p.parent2_email ? <span className="guardian-detail">{p.parent2_email}</span> : null}
                      </div>
                    ) : null}
                    {tgEntries.length > 0 ? (
                      <div className="guardian-info">
                        <span className="guardian-badge guardian-badge-teacher">Teacher/Guardian</span>
                        {tgEntries.map((entry, i) => (
                          <span key={i} className="guardian-name">
                            {entry.teacherName}{entry.teacherPhone ? ` · ${entry.teacherPhone}` : ''}
                            {entry.studentName ? <span className="guardian-for"> for {entry.studentName}</span> : null}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {!p.parent2_first_name && tgEntries.length === 0 ? <span className="text-muted">—</span> : null}
                  </td>
                  <td>{p.username}</td>
                  <td>
                    {(p.youngsters || []).length === 0
                      ? '-'
                      : (p.youngsters || []).map((y) => String(y.name || '').trim().split(/\s+/)[0] || '-').join(', ')}
                  </td>
                  <td>{(p.schools || []).join(', ') || '-'}</td>
                  <td>
                    <div className="action-row">
                      <button className="btn btn-primary" type="button" onClick={() => onOpenEdit(p)}>
                        Edit
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => onShowId(p)}>
                        Show ID
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => onShowPassword(p)}>
                        Show PW
                      </button>
                      <button className="btn btn-outline" type="button" onClick={() => onResetPassword(p)}>
                        Set new Password
                      </button>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => onDeleteParent(p)}
                        disabled={deleteDisabled(p)}
                        title={deleteTitle(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
              {parents.length === 0 ? (
                <tr><td colSpan={7}>No family found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminReturnButton />
      </section>

      {showIdInfo ? (
        <div className="pass-modal-overlay" onClick={() => setShowIdInfo(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Family ID</h2>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">Family Name</span>
                <span className="reg-info-val">{showIdInfo.parentName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Family ID</span>
                <code className="reg-info-code">{showIdInfo.parentId}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Family Username</span>
                <code className="reg-info-code">{showIdInfo.parentUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Set Password</span>
                <code className="reg-info-code">{showIdInfo.parentPassword}</code>
              </div>
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setShowIdInfo(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showTeacherGuardianInfo ? (
        <div className="pass-modal-overlay" onClick={() => setShowTeacherGuardianInfo(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Teacher / Guardian</h2>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">Family Group</span>
                <span className="reg-info-val">{showTeacherGuardianInfo.familyGroup}</span>
              </div>
              {showTeacherGuardianInfo.entries.map((entry) => (
                <div className="reg-info-row" key={`${entry.studentName}-${entry.teacherName}-${entry.teacherPhone}`}>
                  <span className="reg-info-label">{entry.studentName || 'Student'}</span>
                  <div className="reg-info-youngsters">
                    <span className="reg-info-val">{entry.teacherName}</span>
                    <span className="reg-info-val">{entry.teacherPhone || '-'}</span>
                  </div>
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary pass-modal-close"
              type="button"
              onClick={() => setShowTeacherGuardianInfo(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {showParent2Info ? (
        <div className="pass-modal-overlay" onClick={() => setShowParent2Info(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Parent / Guardian #2</h2>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">Family Group</span>
                <span className="reg-info-val">{showParent2Info.familyGroup}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">First Name</span>
                <span className="reg-info-val">{showParent2Info.firstName}</span>
              </div>
              {showParent2Info.phone ? (
                <div className="reg-info-row">
                  <span className="reg-info-label">Phone</span>
                  <span className="reg-info-val">{showParent2Info.phone}</span>
                </div>
              ) : null}
              {showParent2Info.email ? (
                <div className="reg-info-row">
                  <span className="reg-info-label">Email</span>
                  <span className="reg-info-val">{showParent2Info.email}</span>
                </div>
              ) : null}
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setShowParent2Info(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

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
                <span className="reg-info-label">Family Name</span>
                <span className="reg-info-val">{showPassInfo.parentFirstName} {showPassInfo.parentLastName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Family Username</span>
                <code className="reg-info-code">{showPassInfo.parentUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Family Password</span>
                <code className="reg-info-code">{showPassInfo.parentPassword}</code>
              </div>
              {showPassInfo.youngsters.length > 0 ? (
                <div className="reg-info-row">
                  <span className="reg-info-label">Student(s)</span>
                  <span className="reg-info-val reg-info-youngsters">
                    {showPassInfo.youngsters.map((y, i) => (
                      <span key={i}>{y.name} — {y.school}</span>
                    ))}
                  </span>
                </div>
              ) : null}
              <div className="reg-info-row">
                <span className="reg-info-label">Student Password</span>
                <span className="reg-info-muted">Not changed — use Check Password on Admin Student page</span>
              </div>
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setShowPassInfo(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Edit Family Modal ─────────────────────────────── */}
      {editParent ? (
        <div className="pass-modal-overlay" onClick={() => !editBusy && setEditParent(null)}>
          <div className="pass-modal-card edit-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Edit Family — {editParent.last_name}</h2>

            <div className="edit-section-label">Parent / Guardian #1</div>
            <div className="edit-field-grid">
              <label className="edit-label">
                First Name <span className="edit-req">*</span>
                <input className="edit-input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} disabled={editBusy} />
              </label>
              <label className="edit-label">
                Parent Last Name <span className="edit-req">*</span>
                <input className="edit-input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} disabled={editBusy} />
              </label>
              <label className="edit-label">
                Phone <span className="edit-req">*</span>
                <input className="edit-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+628..." disabled={editBusy} />
              </label>
              <label className="edit-label">
                Email <span className="edit-req">*</span>
                <input className="edit-input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} disabled={editBusy} />
              </label>
              <label className="edit-label edit-full">
                Address
                <input className="edit-input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} disabled={editBusy} />
              </label>
            </div>

            <div className="edit-section-label">Parent / Guardian #2 <span className="edit-optional">(Optional)</span></div>
            <div className="edit-field-grid">
              <label className="edit-label">
                First Name
                <input className="edit-input" value={editP2FirstName} onChange={(e) => setEditP2FirstName(e.target.value)} disabled={editBusy} />
              </label>
              <label className="edit-label">
                Phone
                <input className="edit-input" value={editP2Phone} onChange={(e) => setEditP2Phone(e.target.value)} placeholder="+628..." disabled={editBusy} />
              </label>
              <label className="edit-label edit-full">
                Email
                <input className="edit-input" type="email" value={editP2Email} onChange={(e) => setEditP2Email(e.target.value)} disabled={editBusy} />
              </label>
            </div>

            {editError ? <p className="edit-error">{editError}</p> : null}

            <div className="edit-actions">
              <button className="btn btn-primary" type="button" onClick={() => void onEditSave()} disabled={editBusy}>
                {editBusy ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-outline" type="button" onClick={() => setEditParent(null)} disabled={editBusy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx>{`
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
        .admin-parents-table th {
          white-space: nowrap;
        }
        .admin-parents-table code {
          font-size: 0.78rem;
          word-break: break-all;
        }
        .admin-parents-table :global(.btn) {
          min-width: 120px;
        }
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0.35rem;
        }
        .guardian-info {
          display: flex;
          flex-direction: column;
          gap: 0.18rem;
          margin-bottom: 0.35rem;
        }
        .guardian-info:last-child { margin-bottom: 0; }
        .guardian-badge {
          display: inline-block;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: #e8f0fc;
          color: #2a52be;
          border-radius: 0.25rem;
          padding: 0.08rem 0.35rem;
          width: fit-content;
        }
        .guardian-badge-teacher {
          background: #fef3e2;
          color: #92400e;
        }
        .guardian-name {
          font-size: 0.88rem;
          font-weight: 600;
          color: #1a1a1a;
        }
        .guardian-detail {
          font-size: 0.8rem;
          color: #555;
        }
        .guardian-for {
          font-weight: 400;
          color: #777;
          font-size: 0.8rem;
        }
        .text-muted {
          color: #aaa;
        }
        /* Mobile */
        @media (max-width: 680px) {
          .kitchen-table-wrap {
            overflow-x: hidden;
          }
          .admin-parents-table th:nth-child(5),
          .admin-parents-table td:nth-child(5),
          .admin-parents-table th:nth-child(6),
          .admin-parents-table td:nth-child(6) {
            display: none;
          }
          .kitchen-table {
            table-layout: fixed;
            width: 100%;
          }
          .kitchen-table th,
          .kitchen-table td {
            font-size: 0.82rem;
            padding: 0.45rem 0.5rem;
          }
          .kitchen-table th {
            white-space: nowrap;
          }
          .kitchen-table td {
            word-break: break-word;
            overflow-wrap: break-word;
          }
          .admin-parents-table :global(.btn) {
            min-width: 0;
            width: 100%;
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
        .reg-info-youngsters {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.2rem;
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

        /* ── Edit modal ── */
        .edit-modal-card {
          max-width: 560px;
          max-height: 90vh;
          overflow-y: auto;
        }
        .edit-section-label {
          font-size: 0.78rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #5a4a3a;
          border-bottom: 1.5px solid #e2d6c2;
          padding-bottom: 0.25rem;
          margin: 1rem 0 0.55rem;
        }
        .edit-section-label:first-of-type { margin-top: 0.25rem; }
        .edit-optional {
          font-weight: 400;
          color: #999;
          text-transform: none;
          letter-spacing: 0;
          font-size: 0.78rem;
        }
        .edit-field-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.55rem 0.7rem;
        }
        .edit-label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.82rem;
          font-weight: 500;
          color: #444;
        }
        .edit-full { grid-column: 1 / -1; }
        .edit-req { color: #c0392b; }
        .edit-input {
          padding: 0.38rem 0.55rem;
          border: 1px solid #d0c4b0;
          border-radius: 0.4rem;
          font-size: 0.9rem;
          background: #fff;
          width: 100%;
          box-sizing: border-box;
        }
        .edit-input:focus { outline: 2px solid #c3a96a; border-color: transparent; }
        .edit-input:disabled { background: #f5f0e8; color: #999; }
        .edit-error {
          color: #c0392b;
          font-size: 0.84rem;
          margin: 0.5rem 0 0;
        }
        .edit-actions {
          display: flex;
          gap: 0.55rem;
          margin-top: 1.1rem;
        }
        .edit-actions .btn { flex: 1; }
        @media (max-width: 480px) {
          .edit-field-grid { grid-template-columns: 1fr; }
          .edit-full { grid-column: 1; }
        }
      `}</style>
    </main>
  );
}
