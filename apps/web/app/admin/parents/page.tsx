'use client';

import { useEffect, useState } from 'react';
import { ACCESS_KEY, getApiBase, refreshAccessToken } from '../../../lib/auth';
import AdminNav from '../_components/admin-nav';

type ParentRow = { id: string; first_name: string; last_name: string; username: string; linked_children_count: number };
type ChildRow = { id: string; first_name: string; last_name: string; school_grade: string; school_name: string };

export default function AdminParentsPage() {
  const [parents, setParents] = useState<ParentRow[]>([]);
  const [children, setChildren] = useState<ChildRow[]>([]);
  const [selectedParentId, setSelectedParentId] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const apiFetch = async (path: string, init?: RequestInit) => {
    let token = localStorage.getItem(ACCESS_KEY);
    if (!token) throw new Error('Please login first.');
    let res = await fetch(`${getApiBase()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    if (res.status === 401) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) throw new Error('Session expired. Please log in again.');
      token = refreshed;
      res = await fetch(`${getApiBase()}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
      });
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || 'Request failed');
    }
    return res.json();
  };

  const load = async () => {
    const [p, c] = await Promise.all([apiFetch('/admin/parents') as Promise<ParentRow[]>, apiFetch('/admin/children') as Promise<ChildRow[]>]);
    setParents(p);
    setChildren(c);
    if (!selectedParentId && p.length) setSelectedParentId(p[0].id);
    if (!selectedChildId && c.length) setSelectedChildId(c[0].id);
  };

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onLink = async () => {
    if (!selectedParentId || !selectedChildId) return;
    setError('');
    setMessage('');
    try {
      await apiFetch(`/parents/${selectedParentId}/children/${selectedChildId}/link`, { method: 'POST' });
      setMessage('Parent-youngster link saved.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Admin Parents</h1>
        <AdminNav />
        {message ? <p className="auth-help">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <label>
          Parent
          <select value={selectedParentId} onChange={(e) => setSelectedParentId(e.target.value)}>
            <option value="">Select...</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>{p.first_name} {p.last_name} ({p.username}) - linked {p.linked_children_count}</option>
            ))}
          </select>
        </label>
        <label>
          Youngster
          <select value={selectedChildId} onChange={(e) => setSelectedChildId(e.target.value)}>
            <option value="">Select...</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name} ({c.school_name} - {c.school_grade})</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="button" onClick={onLink}>Link Parent and Youngster</button>
      </section>
    </main>
  );
}
