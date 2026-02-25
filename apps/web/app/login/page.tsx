'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_COOKIE, ROLE_COOKIE, ROLE_OPTIONS, getApiBase } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('teameditor');
  const [password, setPassword] = useState('admin123');
  const [role, setRole] = useState('PARENT');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        throw new Error('Invalid username/password/role');
      }
      const data = await res.json();
      localStorage.setItem('blossom_access_token', data.accessToken);
      localStorage.setItem('blossom_refresh_token', data.refreshToken);
      localStorage.setItem('blossom_role', data.user.role);
      document.cookie = `${AUTH_COOKIE}=${data.accessToken}; path=/; max-age=86400; SameSite=Lax`;
      document.cookie = `${ROLE_COOKIE}=${data.user.role}; path=/; max-age=86400; SameSite=Lax`;
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Developer Login</h1>
        <p className="auth-help">Common account for Parent, Youngsters, Admin, Kitchen, and Delivery.</p>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>
            Role
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              {ROLE_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  );
}
