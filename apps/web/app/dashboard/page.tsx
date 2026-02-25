'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AUTH_COOKIE, ROLE_COOKIE, getApiBase } from '../../lib/auth';

type Profile = {
  username: string;
  displayName: string;
  role: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('blossom_access_token');
    if (!token) {
      router.push('/login');
      return;
    }
    fetch(`${getApiBase()}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          throw new Error('Session expired. Please log in again.');
        }
        return res.json();
      })
      .then((data) => setProfile(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'));
  }, [router]);

  const onLogout = async () => {
    const token = localStorage.getItem('blossom_access_token');
    if (token) {
      await fetch(`${getApiBase()}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => undefined);
    }
    localStorage.removeItem('blossom_access_token');
    localStorage.removeItem('blossom_refresh_token');
    localStorage.removeItem('blossom_role');
    document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0`;
    document.cookie = `${ROLE_COOKIE}=; path=/; max-age=0`;
    router.push('/login');
  };

  return (
    <main className="page-auth">
      <section className="auth-panel">
        <h1>Dashboard</h1>
        {profile ? (
          <>
            <p>Welcome, {profile.displayName}</p>
            <p>Username: {profile.username}</p>
            <p>Role: {profile.role}</p>
            <button className="btn btn-primary" type="button" onClick={onLogout}>
              Log Out
            </button>
          </>
        ) : (
          <p>{error || 'Loading profile...'}</p>
        )}
      </section>
    </main>
  );
}
