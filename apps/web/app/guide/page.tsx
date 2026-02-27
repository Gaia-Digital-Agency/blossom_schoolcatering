import Link from 'next/link';
import { promises as fs } from 'fs';
import path from 'path';

type GuideItem = {
  title: string;
  file: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  { title: 'User Guide: Parent', file: 'parents.md' },
  { title: 'User Guide: Youngster', file: 'youngsters.md' },
  { title: 'User Guide: Register (Youngster + Parent)', file: 'register.md' },
  { title: 'User Guide: Delivery', file: 'delivery.md' },
  { title: 'User Guide: Kitchen', file: 'kitchen.md' },
  { title: 'Terms and Conditions', file: 'terms-and-condition.md' },
  { title: 'User Guide: Contact Us', file: 'contact-us.md' },
];

async function readGuide(file: string) {
  const full = path.join(process.cwd(), 'docs', 'guides', file);
  try {
    return await fs.readFile(full, 'utf8');
  } catch {
    return 'Guide content is not available yet.';
  }
}

export default async function GuidePage() {
  const guides = await Promise.all(
    GUIDE_ITEMS.map(async (item) => ({ ...item, content: await readGuide(item.file) })),
  );

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Guides and T&amp;C</h1>
        <p className="auth-help">Tap each section to expand guide content.</p>

        <div className="guide-list">
          {guides.map((guide) => (
            <details key={guide.file}>
              <summary>{guide.title}</summary>
              <pre className="guide-content">{guide.content}</pre>
            </details>
          ))}
        </div>

        <section className="module-section">
          <h2>Guides In Progress</h2>
          <p className="auth-help">Remaining guides to be finalized:</p>
          <ul>
            <li>Admin</li>
            <li>Billing &amp; Payment</li>
            <li>Menu</li>
          </ul>
        </section>

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/login">Go to Login</Link>
        </div>
      </section>
    </main>
  );
}
