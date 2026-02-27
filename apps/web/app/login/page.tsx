'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase, setAuthState } from '../../lib/auth';
import PasswordInput from '../_components/password-input';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('parent');
  const [password, setPassword] = useState('parent123');
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
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        throw new Error('Invalid username/password');
      }
      const data = await res.json();
      setAuthState(data.accessToken, data.user.role);
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
        <h1>Home Login</h1>
        <p className="auth-help">Use this page for Parent and Youngster login.</p>
        <div className="quick-credentials" aria-label="Quick Credentials">
          <p><strong>Youngster Register:</strong> url: /register/youngsters (view only)</p>
          <p><strong>Youngster Login:</strong> url: /login | user: youngster | pw: youngster123</p>
          <p><strong>Parent Login:</strong> url: /login | user: parent | pw: parent123</p>
          <p><strong>Delivery Login:</strong> url: /delivery/login | user: delivery | pw: delivery123</p>
          <p><strong>Kitchen Login:</strong> url: /kitchen/login | user: kitchen | pw: kitchen123</p>
          <p><strong>Admin Login:</strong> url: /admin/login | user: admin | pw: admin123</p>
        </div>
        <form onSubmit={onSubmit} className="auth-form">
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
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
