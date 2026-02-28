'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTimeout, getApiBase, setAuthState } from '../../../lib/auth';
import PasswordInput from '../../_components/password-input';

type RegisterRole = 'PARENT' | 'YOUNGSTER' | 'DELIVERY';

type RegisterFormProps = {
  role?: RegisterRole;
  allowedRoles?: RegisterRole[];
  title: string;
  subtitle: string;
};

export default function RegisterForm({ role, allowedRoles, title, subtitle }: RegisterFormProps) {
  const router = useRouter();
  const availableRoles = (allowedRoles && allowedRoles.length > 0 ? allowedRoles : role ? [role] : ['YOUNGSTER' as RegisterRole]);
  const [selectedRole, setSelectedRole] = useState<RegisterRole>(availableRoles[0]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isParentRole = selectedRole === 'PARENT';

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`${getApiBase()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          role: selectedRole,
          username,
          password,
          firstName,
          lastName,
          phoneNumber,
          email,
          address: isParentRole ? address : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Registration failed');
      }
      const data = await res.json();
      setAuthState(data.accessToken, data.user.role);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>{title}</h1>
        <p className="auth-help">{subtitle}</p>
        <form onSubmit={onSubmit} className="auth-form">
          {availableRoles.length > 1 ? (
            <label>
              Register As
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as RegisterRole)}
                required
              >
                {availableRoles.map((availableRole) => (
                  <option key={availableRole} value={availableRole}>
                    {availableRole === 'YOUNGSTER' ? 'Youngster' : availableRole === 'PARENT' ? 'Parent' : 'Delivery'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label>
            Password
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
          </label>
          <label>
            First Name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </label>
          <label>
            Last Name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </label>
          <label>
            Phone Number
            <input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {isParentRole ? (
            <label>
              Address
              <input value={address} onChange={(e) => setAddress(e.target.value)} required />
            </label>
          ) : null}
          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </section>
    </main>
  );
}
