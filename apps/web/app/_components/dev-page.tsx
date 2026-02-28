'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ACCESS_KEY, fetchWithTimeout, getApiBase } from '../../lib/auth';
import PasswordInput from './password-input';

type DevPageProps = {
  title: string;
  description: string;
};

export default function DevPage({ title, description }: DevPageProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const onChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    const accessToken = localStorage.getItem(ACCESS_KEY);
    if (!accessToken) {
      setMessage('Please login first.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/change-password`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Password update failed');
      }
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password updated successfully.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page-auth" id="top">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p className="auth-help">{description}</p>
        <div className="dev-links">
          <Link href="/">Home</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/parents">Parents</Link>
          <Link href="/youngsters">Youngsters</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/kitchen">Kitchen</Link>
          <Link href="/delivery">Delivery</Link>
          <Link href="/login">Login</Link>
        </div>
        <a className="btn btn-primary" href="#top">
          Back To Top
        </a>
        <form className="auth-form" onSubmit={onChangePassword}>
          <label>
            Current Password
            <PasswordInput value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </label>
          <label>
            New Password
            <PasswordInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
          </label>
          {message ? <p className="auth-help">{message}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>
    </main>
  );
}
