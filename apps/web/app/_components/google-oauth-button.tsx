'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { Role, getApiBase, setAuthState } from '../../lib/auth';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            element: HTMLElement,
            options: { theme?: string; size?: string; type?: string; text?: string; shape?: string; width?: number },
          ) => void;
        };
      };
    };
  }
}

type Props = {
  role: Role;
  redirectPath: string;
  className?: string;
};

export default function GoogleOAuthButton({ role, redirectPath, className }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [error, setError] = useState('');
  const clientId = useMemo(() => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', []);

  useEffect(() => {
    if (!scriptReady || !ref.current || !window.google || !clientId) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setError('');
        try {
          const idToken = response.credential;
          if (!idToken) throw new Error('Google token missing');
          const res = await fetch(`${getApiBase()}/auth/google/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken, role }),
          });
          if (!res.ok) throw new Error('Google login failed');
          const data = await res.json();
          setAuthState(data.accessToken, data.refreshToken, data.user.role);
          router.push(redirectPath);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google login failed');
        }
      },
    });
    ref.current.innerHTML = '';
    window.google.accounts.id.renderButton(ref.current, {
      theme: 'outline',
      size: 'large',
      type: 'standard',
      text: 'continue_with',
      shape: 'pill',
      width: 300,
    });
  }, [scriptReady, clientId, role, redirectPath, router]);

  return (
    <div className={className}>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      {!clientId ? <p className="auth-error">Google client ID is missing in environment.</p> : null}
      <div ref={ref} />
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
