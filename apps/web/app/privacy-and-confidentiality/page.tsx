import { readFile } from 'fs/promises';
import path from 'path';
import Link from 'next/link';

async function loadPolicy() {
  const candidates = [
    path.join(process.cwd(), 'docs', 'guides', 'privacy-and-confidentiality.md'),
    path.join(process.cwd(), '..', '..', 'docs', 'guides', 'privacy-and-confidentiality.md'),
  ];
  for (const filePath of candidates) {
    try {
      return await readFile(filePath, 'utf8');
    } catch {
      // try next candidate path
    }
  }
  return '# Privacy and Confidentiality\n\nPolicy file not found.';
}

export default async function PrivacyAndConfidentialityPage() {
  const content = await loadPolicy();
  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Privacy and Confidentiality</h1>
        <pre className="guide-content">{content}</pre>
        <div className="dev-links">
          <Link href="/">Back to Home</Link>
          <Link href="/guide">Back to Guides</Link>
        </div>
      </section>
    </main>
  );
}
