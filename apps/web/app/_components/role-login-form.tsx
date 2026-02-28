'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, fetchWithTimeout, getApiBase, setAuthState } from '../../lib/auth';
import PasswordInput from './password-input';

type Props = {
  role: Role;
  title: string;
  usernameDefault: string;
  passwordDefault: string;
  redirectPath: string;
};

export default function RoleLoginForm({
  role,
  title,
  usernameDefault,
  passwordDefault,
  redirectPath,
}: Props) {
  const router = useRouter();
  const [username, setUsername] = useState(usernameDefault);
  const [password, setPassword] = useState(passwordDefault);
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
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        throw new Error('Invalid credentials');
      }
      const data = await res.json();
      setAuthState(data.accessToken, data.user.role);
      router.push(redirectPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>{title}</h1>
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
