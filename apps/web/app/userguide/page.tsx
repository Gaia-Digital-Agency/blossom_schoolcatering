import Link from 'next/link';
import { parseMarkdown, readGuideMarkdown } from '../../lib/guide-markdown';

export default async function UserGuidePage() {
  const guide = await readGuideMarkdown('user-guide.md');

  return (
    <main className="page-auth page-auth-mobile">
      <section
        className="auth-panel"
        style={{ width: 'min(860px, 100%)', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <div
          style={{
            border: '1px solid #e2d6c2',
            borderRadius: '1rem',
            padding: '1rem 1.1rem',
            background: 'linear-gradient(135deg, #fff8ef 0%, #fffdf8 100%)',
          }}
        >
          <p
            style={{
              margin: '0 0 0.35rem',
              fontSize: '0.85rem',
              fontWeight: 700,
              color: '#7b5f33',
              letterSpacing: '0.03em',
              textTransform: 'uppercase',
            }}
          >
            School Catering Meals by Blossom Steakhouse Kitchen
          </p>
          <h1>User Guide</h1>
          <p className="auth-help">
            A concise guide for family and student users covering registration, login, menu, ordering,
            billing, rating, and support.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.85rem' }}>
            <Link href="/guide" className="btn btn-outline">All Guides</Link>
            <Link href="/login" className="btn btn-primary">Log In</Link>
          </div>
        </div>

        <article
          className="auth-form guide-rendered"
          dangerouslySetInnerHTML={{ __html: parseMarkdown(guide.content) }}
        />
      </section>
    </main>
  );
}
