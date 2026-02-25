'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ROLE_OPTIONS, getApiBase, setAuthState } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [role, setRole] = useState('ADMIN');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEmail, setGoogleEmail] = useState('teameditor@gmail.com');

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
      setAuthState(data.accessToken, data.refreshToken, data.user.role);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const onGoogleDev = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/auth/google/dev`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ googleEmail, role }),
      });
      if (!res.ok) {
        throw new Error('Google dev login failed');
      }
      const data = await res.json();
      setAuthState(data.accessToken, data.refreshToken, data.user.role);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google dev login failed');
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
        <div className="auth-form" style={{ marginTop: '0.8rem' }}>
          <label>
            Google Email (Dev)
            <input value={googleEmail} onChange={(e) => setGoogleEmail(e.target.value)} />
          </label>
          <button className="btn btn-google" disabled={loading} type="button" onClick={onGoogleDev}>
            Continue with Google (Dev)
          </button>
        </div>
      </section>
    </main>
  );
}
