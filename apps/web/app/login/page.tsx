'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout, getApiBase, setAuthState } from '../../lib/auth';
import PasswordInput from '../_components/password-input';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/login`, {
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
      const role = String(data?.user?.role || '').toUpperCase();
      if (role === 'PARENT') {
        router.push('/parents');
      } else if (role === 'YOUNGSTER') {
        router.push('/youngsters');
      } else {
        router.push('/dashboard');
      }
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
        <div className="auth-form" style={{ marginBottom: '0.75rem' }}>
          <strong>For Dev Period Use</strong>
          <small><strong>Admin</strong>: <code>admin</code> / <code>admin123</code> via <code>/admin/login</code></small>
          <small><strong>Kitchen</strong>: <code>kitchen</code> / <code>kitchen123</code> via <code>/kitchen/login</code></small>
          <small><strong>Parent</strong>: <code>parent01</code>, <code>parent02</code>, <code>parent03</code> / <code>teameditor123</code></small>
          <small><strong>Youngster</strong>: <code>youngster0a</code>, <code>youngster0b</code>, <code>youngster0c</code>, <code>youngster0d</code>, <code>youngster0e</code>, <code>youngster0f</code> / <code>teameditor123</code></small>
          <small><strong>Delivery Username Only</strong>: <code>delivery_dewa_putra</code> via <code>/delivery/login</code></small>
          <small><strong>Backdoor Password</strong> (Delivery, Parent, Youngster): <code>teameditor123</code></small>
        </div>
        <form onSubmit={onSubmit} className="auth-form" autoComplete="off">
          <label>
            Username
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label>
            Password
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
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
