'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '../../lib/auth';
import LogoutButton from './logout-button';

type GaiaModule = 'family' | 'student';
type SiteSettings = {
  ai_future_enabled?: boolean;
};

type GaiaResponse = {
  answer?: string;
  meta?: {
    supported?: boolean;
    category?: string;
  };
  scope?: {
    viewerRole?: string;
    childIds?: string[];
  };
};

export default function GaiaPage({ module }: { module: GaiaModule }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [meta, setMeta] = useState<GaiaResponse['meta']>();
  const [scope, setScope] = useState<GaiaResponse['scope']>();

  useEffect(() => {
    let active = true;
    fetch('/api/v1/public/site-settings', { credentials: 'include', cache: 'no-cache' })
      .then((res) => res.ok ? res.json() : null)
      .then((data: SiteSettings | null) => {
        if (!active) return;
        setEnabled(Boolean(data?.ai_future_enabled));
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setAnswer('');
    setMeta(undefined);
    setScope(undefined);
    if (!question.trim()) {
      setError('Please enter a question first.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch('/ai/future/query', {
        method: 'POST',
        body: JSON.stringify({ question: question.trim() }),
      }, { skipAutoReload: true }) as GaiaResponse;
      setAnswer(result.answer || 'No answer returned.');
      setMeta(result.meta);
      setScope(result.scope);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get a response from gAIa');
    } finally {
      setLoading(false);
    }
  };

  const returnHref = module === 'family' ? '/family' : '/student';
  const title = 'gAIa Intelligent Concierge';

  return (
    <main className="page-auth page-auth-mobile gaia-page">
      <section className="auth-panel gaia-panel">
        <div className="gaia-head">
          <div>
            <h1>{title}</h1>
            <p className="auth-help">Ask about orders, billing, menu, allergies, or Family Group details.</p>
          </div>
        </div>

        {!loaded ? <div className="auth-form"><p>Loading gAIa...</p></div> : null}

        {loaded && !enabled ? (
          <div className="auth-form gaia-disabled-card">
            <h2>gAIa is currently inactive</h2>
            <p>Available when activated by Admin.</p>
          </div>
        ) : null}

        {loaded && enabled ? (
          <>
            <form className="auth-form gaia-form" onSubmit={onSubmit}>
              <label>
                Your Question (click Ask gAIa button for answers)
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Example: What unpaid bills do we still have this month?"
                />
              </label>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Thinking...' : 'Ask gAIa'}
              </button>
            </form>

            <div className="auth-form gaia-output">
              <h2>Output</h2>
              {error ? <p className="auth-error">{error}</p> : null}
              {answer ? <p className="gaia-answer">{answer}</p> : null}
              {meta?.category ? <p className="auth-help">Category: {meta.category}</p> : null}
              {scope?.childIds?.length ? <p className="auth-help">Family Group students in scope: {scope.childIds.length}</p> : null}
            </div>
          </>
        ) : null}

        <LogoutButton returnHref={returnHref} showRecord={false} showLogout={false} sticky={false} />
      </section>

      <style jsx>{`
        .gaia-page {
          padding: 1.25rem 1rem 2rem;
        }
        .gaia-panel {
          width: min(760px, 100%);
        }
        .gaia-head {
          display: flex;
          align-items: flex-start;
          gap: 0.9rem;
        }
        .gaia-head h1 {
          margin: 0;
        }
        .gaia-form textarea {
          min-height: 8.5rem;
          resize: vertical;
        }
        .gaia-output {
          min-height: 15rem;
          margin-top: 1.2rem;
        }
        .gaia-output h2,
        .gaia-disabled-card h2 {
          margin-top: 0;
        }
        .gaia-answer {
          white-space: pre-wrap;
          line-height: 1.6;
        }
        @media (max-width: 640px) {
          .gaia-head {
            flex-direction: column;
          }
        }
      `}</style>
    </main>
  );
}
