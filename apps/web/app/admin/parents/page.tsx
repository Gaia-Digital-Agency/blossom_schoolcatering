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

type ResetPasswordResponse = {
  ok: boolean;
  newPassword: string;
  username: string;
};

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = async () => {
    const p = await apiFetch('/admin/parents') as ParentRow[];
    setParents(p || []);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
  }, []);

  const onResetPassword = async (userId: string) => {
    setError('');
    setMessage('');
    try {
      const res = await apiFetch(`/admin/users/${userId}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({}),
      }) as ResetPasswordResponse;
      setMessage(`Password reset for ${res.username}: ${res.newPassword}`);
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
                    <button className="btn btn-outline" type="button" onClick={() => onResetPassword(p.user_id)}>
                      Change Password
                    </button>
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
        /* Mobile: hide Parent ID column, stack layout */
        @media (max-width: 680px) {
          .admin-parents-table th:nth-child(2),
          .admin-parents-table td:nth-child(2) {
            display: none;
          }
          .kitchen-table th,
          .kitchen-table td {
            font-size: 0.82rem;
            padding: 0.45rem 0.5rem;
          }
        }
      `}</style>
    </main>
  );
}
