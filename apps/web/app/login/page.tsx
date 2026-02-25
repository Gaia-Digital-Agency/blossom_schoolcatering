'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase, setAuthState } from '../../lib/auth';
import GoogleOAuthButton from '../_components/google-oauth-button';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('parent');
  const [password, setPassword] = useState('parent123');
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
      setAuthState(data.accessToken, data.refreshToken, data.user.role);
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
          <p><strong>Parent:</strong> parent / parent123</p>
          <p><strong>Youngster:</strong> youngster / youngster123</p>
          <p><strong>Admin:</strong> use /admin/login</p>
          <p><strong>Kitchen:</strong> use /kitchen/login</p>
          <p><strong>Delivery:</strong> use /delivery/login</p>
        </div>
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
              <option value="PARENT">PARENT</option>
              <option value="YOUNGSTER">YOUNGSTER</option>
            </select>
          </label>
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        <div className="auth-form" style={{ marginTop: '0.8rem' }}>
          <GoogleOAuthButton role={role as 'PARENT' | 'YOUNGSTER'} redirectPath="/dashboard" />
        </div>
      </section>
    </main>
  );
}
