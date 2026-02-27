import Link from 'next/link';
import { promises as fs } from 'fs';
import path from 'path';

type GuideItem = {
  title: string;
  file: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  { title: 'Parent User Guide', file: 'parents.md' },
  { title: 'Youngster User Guide', file: 'youngsters.md' },
  { title: 'Registration Guide', file: 'register.md' },
  { title: 'Delivery User Guide', file: 'delivery.md' },
  { title: 'Kitchen User Guide', file: 'kitchen.md' },
  { title: 'Billing & Payment User Guide', file: 'billing-payment.md' },
  { title: 'Menu User Guide', file: 'menu.md' },
  { title: 'Terms and Conditions', file: 'terms-and-condition.md' },
  { title: 'Contact Us User Guide', file: 'contact-us.md' },
];

async function resolveGuidesDir() {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'docs', 'guides'),
    path.join(cwd, '..', 'docs', 'guides'),
    path.join(cwd, '..', '..', 'docs', 'guides'),
  ];
  for (const dir of candidates) {
    try {
      const stat = await fs.stat(dir);
      if (stat.isDirectory()) return dir;
    } catch {
      // continue
    }
  }
  return '';
}

async function readGuide(guidesDir: string, file: string) {
  if (!guidesDir) return 'Guide content is not available yet.';
  const full = path.join(guidesDir, file);
  try {
    return await fs.readFile(full, 'utf8');
  } catch {
    return 'Guide content is not available yet.';
  }
}

export default async function GuidePage() {
  const guidesDir = await resolveGuidesDir();
  const guides = await Promise.all(
    GUIDE_ITEMS.map(async (item) => ({ ...item, content: await readGuide(guidesDir, item.file) })),
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

        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/login">Go to Login</Link>
        </div>
      </section>
    </main>
  );
}
