'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearAuthState, fetchWithTimeout, getApiBase, refreshAccessToken } from '../../lib/auth';

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
    const loadProfile = async () => {
      let accessToken = token;
      let res = await fetchWithTimeout(`${getApiBase()}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        const refreshed = await refreshAccessToken();
        if (!refreshed) throw new Error('Session expired. Please log in again.');
        accessToken = refreshed;
        res = await fetchWithTimeout(`${getApiBase()}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      }
      if (!res.ok) throw new Error('Failed to load profile');
      const data = await res.json();
      setProfile(data);
    };
    loadProfile().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'));
  }, [router]);

  const onLogout = async () => {
    await fetchWithTimeout(`${getApiBase()}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    }).catch(() => undefined);
    clearAuthState();
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
