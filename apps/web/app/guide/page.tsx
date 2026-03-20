import Link from 'next/link';
import { formatUpdatedAt, parseMarkdown, readGuideMarkdown } from '../../lib/guide-markdown';

type GuideItem = {
  title: string;
  key: string;
  file: string;
};

const GUIDE_ITEMS: GuideItem[] = [
  { key: 'userguide', title: 'Complete User Guide', file: 'user-guide.md' },
  { key: 'admin', title: 'Admin User Guide', file: 'admin.md' },
  { key: 'report', title: 'Report User Guide', file: 'report.md' },
  { key: 'family', title: 'Family User Guide', file: 'family.md' },
  { key: 'student', title: 'Student User Guide', file: 'studetnt.md' },
  { key: 'delivery', title: 'Delivery User Guide', file: 'delivery.md' },
  { key: 'kitchen', title: 'Kitchen User Guide', file: 'kitchen.md' },
  { key: 'billing', title: 'Billing & Payment User Guide', file: 'billing-payment.md' },
  { key: 'menu', title: 'Menu User Guide', file: 'menu.md' },
  { key: 'register', title: 'Registration Guide', file: 'register.md' },
  { key: 'terms', title: 'Terms and Conditions', file: 'terms-and-condition.md' },
  { key: 'privacy', title: 'Privacy and Confidentiality', file: 'privacy-and-confidentiality.md' },
  { key: 'contact', title: 'Contact Us User Guide', file: 'contact-us.md' },
];

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
              <div
                className="guide-content guide-rendered"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(guide.content) }}
              />
            </details>
          ))}
        </div>

        <div className="dev-links">
          <Link href="/">Back to Homepage</Link>
          <Link href="/login">Go to Login</Link>
        </div>
      </section>
    </main>
  );
}
