'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Role, fetchWithTimeout, getApiBase, setAuthState } from '../../lib/auth';
import PasswordInput from './password-input';

/**
 * Props for the RoleLoginForm component.
 */
type Props = {
  // The user role for which the login is being performed.
  role: Role;
  // The title to be displayed on the login form.
  title: string;
  // The path to redirect to upon successful login.
  redirectPath: string;
};

/**
 * A reusable login form component for different user roles.
 * It handles user input, form submission, authentication against the API,
 * and redirection upon success.
 */
export default function RoleLoginForm({
  role,
  title,
  redirectPath,
}: Props) {
  const router = useRouter();
  // State for the username and password fields.
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // State to hold any login error messages.
  const [error, setError] = useState('');
  // State to manage the loading status of the form.
  const [loading, setLoading] = useState(false);

  /**
   * Handles the form submission.
   * It sends the user's credentials and role to the login API endpoint,
   * handles the response, sets the authentication state on success,
   * and redirects the user.
   * @param e The form event.
   */
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Attempt to log in with the provided credentials.
      const res = await fetchWithTimeout(`${getApiBase()}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, role }),
      });
      if (!res.ok) {
        throw new Error('Invalid credentials');
      }
      // On success, set the authentication state and redirect.
      const data = await res.json();
      setAuthState(data.accessToken, data.user.role);
      router.push(redirectPath);
    } catch (err) {
      // Set an error message if login fails.
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>{title}</h1>
        {/* The login form */}
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
          {/* Display any login errors */}
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
      </section>
    </main>
  );
}
