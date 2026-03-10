'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type ParentYoungster = { id: string; name: string; school_name?: string | null };
type ParentRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  linked_children_count: number;
  youngsters: ParentYoungster[];
  schools: string[];
};

type ShowPassInfo = {
  parentFirstName: string;
  parentLastName: string;
  parentUsername: string;
  parentNewPassword: string;
  youngsters: { name: string; school: string }[];
};

type ConfirmDeleteInfo = {
  parentId: string;
  parentName: string;
};

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassInfo, setShowPassInfo] = useState<ShowPassInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    const p = await apiFetch('/admin/parents') as ParentRow[];
    setParents(p || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  const onDeleteClick = (p: ParentRow) => {
    setError('');
    setMessage('');
    if ((p.youngsters || []).length > 0) {
      setError(`Cannot delete "${p.first_name} ${p.last_name}" — delete all linked youngsters first.`);
      return;
    }
    setConfirmDelete({ parentId: p.id, parentName: `${p.first_name} ${p.last_name} (${p.username})` });
  };

  const onDeleteConfirm = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setError('');
    try {
      await apiFetch(`/admin/parents/${confirmDelete.parentId}`, { method: 'DELETE' });
      setMessage(`Parent "${confirmDelete.parentName}" deleted successfully.`);
      setConfirmDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete parent');
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const onShowPassword = async (p: ParentRow) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(
        `/admin/users/${p.user_id}/reset-password`,
        { method: 'PATCH', body: JSON.stringify({}) },
        { skipAutoReload: true },
      ) as { ok: boolean; newPassword: string; username: string };
      setShowPassInfo({
        parentFirstName: p.first_name,
        parentLastName: p.last_name,
        parentUsername: res.username,
        parentNewPassword: res.newPassword,
        youngsters: (p.youngsters || []).map((y) => ({
          name: y.name,
          school: y.school_name || '—',
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed resetting password');
    }
  };

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Parents</h1>
        <AdminNav />
        <p className="auth-help">Parent records are view-only here. Youngster edits are managed in Admin Youngsters.</p>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <div className="kitchen-table-wrap">
          <table className="kitchen-table admin-parents-table">
            <thead>
              <tr>
                <th>Parent</th>
                <th>Parent ID</th>
                <th>Youngsters Linked</th>
                <th>Schools</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parents.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.first_name} {p.last_name}
                    <br />
                    <small>{p.username}</small>
                  </td>
                  <td><code>{p.id}</code></td>
                  <td>
                    {(p.youngsters || []).length === 0
                      ? '-'
                      : (p.youngsters || []).map((y) => `${y.name} (${y.id})`).join(', ')}
                  </td>
                  <td>{(p.schools || []).join(', ') || '-'}</td>
                  <td>
                    <div className="action-btns">
                      <button className="btn btn-outline" type="button" onClick={() => onShowPassword(p)}>
                        Show Password
                      </button>
                      <button
                        className="btn btn-danger"
                        type="button"
                        disabled={(p.youngsters || []).length > 0}
                        title={(p.youngsters || []).length > 0 ? 'Delete all linked youngsters first' : 'Delete parent'}
                        onClick={() => onDeleteClick(p)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {parents.length === 0 ? (
                <tr><td colSpan={5}>No parents found.</td></tr>
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
                <span className="reg-info-label">Parent Name</span>
                <span className="reg-info-val">{showPassInfo.parentFirstName} {showPassInfo.parentLastName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent Username</span>
                <code className="reg-info-code">{showPassInfo.parentUsername}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent New Password</span>
                <code className="reg-info-code">{showPassInfo.parentNewPassword}</code>
              </div>
              {showPassInfo.youngsters.length > 0 ? (
                <div className="reg-info-row">
                  <span className="reg-info-label">Youngster(s)</span>
                  <span className="reg-info-val reg-info-youngsters">
                    {showPassInfo.youngsters.map((y, i) => (
                      <span key={i}>{y.name} — {y.school}</span>
                    ))}
                  </span>
                </div>
              ) : null}
              <div className="reg-info-row">
                <span className="reg-info-label">Youngster Password</span>
                <span className="reg-info-muted">Not changed — use Check Password on Youngsters page</span>
              </div>
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setShowPassInfo(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Confirm Delete Modal ─────────────────────────────── */}
      {confirmDelete ? (
        <div className="pass-modal-overlay" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Delete Parent?</h2>
            <p className="pass-modal-warning">⚠️ This action cannot be undone.</p>
            <p style={{ fontSize: '0.9rem', marginBottom: '1.1rem' }}>
              You are about to permanently delete:<br />
              <strong>{confirmDelete.parentName}</strong>
            </p>
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              <button className="btn btn-outline" type="button" style={{ flex: 1 }} disabled={deleting} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" style={{ flex: 1 }} disabled={deleting} onClick={onDeleteConfirm}>
                {deleting ? 'Deleting...' : 'Yes, Delete'}
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
        .action-btns {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .admin-parents-table :global(.btn) {
          min-width: 120px;
        }
        :global(.btn-danger) {
          background: #dc2626;
          color: #fff;
          border: 1px solid #dc2626;
          border-radius: 0.45rem;
          padding: 0.38rem 0.85rem;
          font: inherit;
          font-size: 0.85rem;
          cursor: pointer;
          transition: background 0.12s, border-color 0.12s;
        }
        :global(.btn-danger:hover:not(:disabled)) {
          background: #b91c1c;
          border-color: #b91c1c;
        }
        :global(.btn-danger:disabled) {
          opacity: 0.4;
          cursor: not-allowed;
        }
        /* Mobile */
        @media (max-width: 680px) {
          .kitchen-table-wrap {
            overflow-x: hidden;
          }
          .admin-parents-table th:nth-child(2),
          .admin-parents-table td:nth-child(2),
          .admin-parents-table th:nth-child(3),
          .admin-parents-table td:nth-child(3),
          .admin-parents-table th:nth-child(4),
          .admin-parents-table td:nth-child(4) {
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
      `}</style>
    </main>
  );
}
