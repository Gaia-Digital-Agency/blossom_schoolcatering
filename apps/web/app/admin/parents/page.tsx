'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';
import AdminReturnButton from '../_components/admin-return-button';

type ParentYoungster = { id: string; name: string; school_name?: string | null };
type ParentRow = {
  id: string;
  user_id: string;
  username: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  linked_children_count: number;
  billing_count: number;
  youngsters: ParentYoungster[];
  schools: string[];
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

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showPassInfo, setShowPassInfo] = useState<ShowPassInfo | null>(null);
  const [showIdInfo, setShowIdInfo] = useState<ShowIdInfo | null>(null);

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

  return (
    <main className="page-auth page-auth-desktop">
      <section className="auth-panel">
        <h1>Admin Parent</h1>
        <AdminNav />
        <p className="auth-help">Parent records are view-only here. Youngster edits are managed in Admin Youngster.</p>
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <h2>Existing Parents</h2>
        <div className="kitchen-table-wrap">
          <table className="kitchen-table admin-parents-table">
            <thead>
              <tr>
                <th>Last Name</th>
                <th>First Name</th>
                <th>User Name</th>
                <th>Youngster</th>
                <th>School</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {parents.map((p) => (
                <tr key={p.id}>
                  <td>{p.last_name}</td>
                  <td>{p.first_name}</td>
                  <td>{p.username}</td>
                  <td>
                    {(p.youngsters || []).length === 0
                      ? '-'
                      : (p.youngsters || []).map((y) => String(y.name || '').trim().split(/\s+/)[0] || '-').join(', ')}
                  </td>
                  <td>{(p.schools || []).join(', ') || '-'}</td>
                  <td>
                    <div className="action-row">
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
              ))}
              {parents.length === 0 ? (
                <tr><td colSpan={6}>No parents found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminReturnButton />
      </section>

      {showIdInfo ? (
        <div className="pass-modal-overlay" onClick={() => setShowIdInfo(null)}>
          <div className="pass-modal-card" onClick={(e) => e.stopPropagation()}>
            <h2 className="pass-modal-title">Parent ID</h2>
            <div className="reg-info-list">
              <div className="reg-info-row">
                <span className="reg-info-label">Parent Name</span>
                <span className="reg-info-val">{showIdInfo.parentName}</span>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent ID</span>
                <code className="reg-info-code">{showIdInfo.parentId}</code>
              </div>
              <div className="reg-info-row">
                <span className="reg-info-label">Parent Username</span>
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
                <span className="reg-info-label">Parent Password</span>
                <code className="reg-info-code">{showPassInfo.parentPassword}</code>
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
                <span className="reg-info-muted">Not changed — use Check Password on Admin Youngster page</span>
              </div>
            </div>
            <button className="btn btn-primary pass-modal-close" type="button" onClick={() => setShowPassInfo(null)}>
              Close
            </button>
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
        /* Mobile */
        @media (max-width: 680px) {
          .kitchen-table-wrap {
            overflow-x: hidden;
          }
          .admin-parents-table th:nth-child(4),
          .admin-parents-table td:nth-child(4),
          .admin-parents-table th:nth-child(5),
          .admin-parents-table td:nth-child(5) {
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
