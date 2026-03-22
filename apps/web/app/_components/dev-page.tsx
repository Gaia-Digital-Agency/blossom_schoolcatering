'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ACCESS_KEY, fetchWithTimeout, getApiBase } from '../../lib/auth';
import PasswordInput from './password-input';

type DevPageProps = {
  title: string;
  description: string;
};

/**
 * A development page component that provides quick navigation links to different
 * parts of the application and includes a form for changing the user's password.
 * This is likely used for testing and development purposes.
 */
export default function DevPage({ title, description }: DevPageProps) {
  // State for the password change form fields.
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // State to manage the saving/loading status of the form.
  const [saving, setSaving] = useState(false);
  // State to display feedback messages to the user.
  const [message, setMessage] = useState('');

  /**
   * Handles the form submission for changing the password.
   * It performs validation, sends the new password to the API,
   * and provides feedback to the user.
   * @param e The form event.
   */
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
      // Send the request to the change-password endpoint.
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
      // Reset form fields and show a success message.
      setCurrentPassword('');
      setNewPassword('');
      setMessage('Password updated successfully.');
    } catch (err) {
      // Show an error message if the update fails.
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

        {/* Quick navigation links for development */}
        <div className="dev-links">
          <Link href="/">Home</Link>
          <Link href="/family">Family</Link>
          <Link href="/student">Student</Link>
          <Link href="/admin">Admin</Link>
          <Link href="/kitchen">Kitchen</Link>
          <Link href="/delivery">Delivery</Link>
          <Link href="/login">Login</Link>
        </div>
        <a className="btn btn-primary" href="#top">
          Back To Top
        </a>

        {/* Form for changing the user's password */}
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
