import Link from 'next/link';
import { promises as fs } from 'fs';
import path from 'path';

type GuideItem = {
  title: string;
  file: string;
  content: string;
};

function titleFromContent(file: string, content: string) {
  const match = content.match(/^#\s+(.+)$/m);
  if (match?.[1]) return match[1].trim();
  return file.replace(/\.md$/i, '').replace(/[-_]/g, ' ');
}

async function loadGuides(): Promise<GuideItem[]> {
  const guidesDir = path.join(process.cwd(), 'docs', 'guides');
  let files: string[] = [];
  try {
    files = (await fs.readdir(guidesDir)).filter((name) => name.toLowerCase().endsWith('.md'));
  } catch {
    return [];
  }

  const guides = await Promise.all(
    files.map(async (file) => {
      const full = path.join(guidesDir, file);
      const content = await fs.readFile(full, 'utf8');
      return { file, title: titleFromContent(file, content), content };
    }),
  );

  return guides.sort((a, b) => a.title.localeCompare(b.title));
}

export default async function GuidePage() {
  const guides = await loadGuides();

  return (
    <main className="page-auth page-auth-mobile">
      <section className="auth-panel">
        <h1>Guides and T&amp;C</h1>
        <p className="auth-help">Tap each section to expand guide content.</p>

        <div className="guide-list">
          {guides.length === 0 ? (
            <p className="auth-help">No guides available in `docs/guides`.</p>
          ) : guides.map((guide) => (
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
