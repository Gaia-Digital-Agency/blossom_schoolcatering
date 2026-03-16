'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { Role, fetchWithTimeout, getApiBase, setAuthState } from '../../lib/auth';

// Extend the global Window interface to include the Google Identity Services library.
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

/**
 * Props for the GoogleOAuthButton component.
 */
type Props = {
  // The role to be assigned to the user upon successful authentication.
  role: Role;
  // The path to redirect to after a successful login.
  redirectPath: string;
  // Optional CSS class name for styling the container.
  className?: string;
};

/**
 * A component that renders a Google OAuth "Sign In" button and handles the
 * entire authentication flow.
 */
export default function GoogleOAuthButton({ role, redirectPath, className }: Props) {
  const router = useRouter();
  // Ref to the div where the Google button will be rendered.
  const ref = useRef<HTMLDivElement | null>(null);
  // State to track if the Google Identity Services script has loaded.
  const [scriptReady, setScriptReady] = useState(false);
  // State to hold any authentication error messages.
  const [error, setError] = useState('');
  // Memoized Google Client ID from environment variables.
  const clientId = useMemo(() => process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '', []);

  /**
   * This effect initializes and renders the Google Sign-In button once the
   * Google script is loaded and the component is mounted. It also defines the
   * callback function that handles the token verification and user authentication.
   */
  useEffect(() => {
    if (!scriptReady || !ref.current || !window.google || !clientId) return;

    // Initialize the Google Identity Services client.
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response) => {
        setError('');
        try {
          const idToken = response.credential;
          if (!idToken) throw new Error('Google token missing');
          
          // Verify the Google ID token with the backend API.
          const res = await fetchWithTimeout(`${getApiBase()}/auth/google/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ idToken, role }),
          });
          
          if (!res.ok) {
            let message = 'Google login failed';
            try {
              const errData = (await res.json()) as { message?: string | string[] };
              if (Array.isArray(errData.message) && errData.message.length > 0) {
                message = errData.message.join(', ');
              } else if (typeof errData.message === 'string' && errData.message.trim()) {
                message = errData.message;
              }
            } catch {
              // ignore parse errors and keep generic fallback
            }
            throw new Error(message);
          }
          
          // On success, set the authentication state and redirect the user.
          const data = await res.json();
          setAuthState(data.accessToken, data.user.role);
          router.push(redirectPath);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Google login failed');
        }
      },
    });

    // Render the Google Sign-In button.
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
      {/* Load the Google Identity Services library. */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      
      {/* Display an error if the Google Client ID is not configured. */}
      {!clientId ? <p className="auth-error">Google client ID is missing in environment.</p> : null}
      
      {/* The container for the rendered Google button. */}
      <div ref={ref} />
      
      {/* Display any authentication errors. */}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}
