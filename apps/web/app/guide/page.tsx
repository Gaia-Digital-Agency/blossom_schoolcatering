import { readFile, stat } from 'fs/promises';
import path from 'path';
import Link from 'next/link';

type GuideItem = {
  title: string;
  key: string;
  file: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  { key: 'admin', title: 'Admin User Guide', file: 'admin.md' },
  { key: 'report', title: 'Report User Guide', file: 'report.md' },
  { key: 'parents', title: 'Parent User Guide', file: 'parents.md' },
  { key: 'youngsters', title: 'Youngster User Guide', file: 'youngsters.md' },
  { key: 'delivery', title: 'Delivery User Guide', file: 'delivery.md' },
  { key: 'kitchen', title: 'Kitchen User Guide', file: 'kitchen.md' },
  { key: 'billing', title: 'Billing & Payment User Guide', file: 'billing-payment.md' },
  { key: 'menu', title: 'Menu User Guide', file: 'menu.md' },
  { key: 'register', title: 'Registration Guide', file: 'register.md' },
  { key: 'terms', title: 'Terms and Conditions', file: 'terms-and-condition.md' },
  { key: 'contact', title: 'Contact Us User Guide', file: 'contact-us.md' },
];

function guideDirCandidates() {
  return [
    path.join(process.cwd(), 'docs', 'guides'),
    path.join(process.cwd(), '..', '..', 'docs', 'guides'),
  ];
}

async function readGuideMarkdown(file: string) {
  for (const dir of guideDirCandidates()) {
    const fullPath = path.join(dir, file);
    try {
      const [content, meta] = await Promise.all([
        readFile(fullPath, 'utf8'),
        stat(fullPath),
      ]);
      return { content, updatedAt: meta.mtime };
    } catch {
      // Try next candidate path.
    }
  }
  return {
    content: `# Missing Guide\n\nGuide file not found: ${file}`,
    updatedAt: null,
  };
}

function formatUpdatedAt(value: Date | null) {
  if (!value) return 'Unknown';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

export default async function GuidePage() {
  const guides = await Promise.all(
    GUIDE_ITEMS.map(async (item) => ({
      ...item,
      ...(await readGuideMarkdown(item.file)),
    })),
  );

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Guides and T&amp;C</h1>
        <p className="auth-help">Tap each section to expand guide content.</p>

        <div className="guide-list">
          {guides.map((guide) => (
            <details key={guide.key}>
              <summary>{guide.title}</summary>
              <p className="auth-help">Last updated: {formatUpdatedAt(guide.updatedAt)}</p>
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
