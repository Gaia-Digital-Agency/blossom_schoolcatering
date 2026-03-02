import { readFile, stat } from 'fs/promises';
import path from 'path';
import Link from 'next/link';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(s: string): string {
  let r = escapeHtml(s);
  // Bold: **text**
  r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Underline: __text__
  r = r.replace(/__(.+?)__/g, '<u>$1</u>');
  // Italic: *text* or _text_ (single, not already consumed by bold/underline)
  r = r.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  r = r.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  // Inline code: `code`
  r = r.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return r;
}

function parseMarkdown(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inP = false;

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  };
  const closePara = () => {
    if (inP) { out.push('</p>'); inP = false; }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      closeList();
      closePara();
      continue;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      closeList(); closePara();
      out.push('<hr />');
      continue;
    }

    const h4 = trimmed.match(/^#### (.+)/);
    const h3 = trimmed.match(/^### (.+)/);
    const h2 = trimmed.match(/^## (.+)/);
    const h1 = trimmed.match(/^# (.+)/);
    const ul = trimmed.match(/^[-*+] (.+)/);
    const ol = trimmed.match(/^\d+\. (.+)/);

    if (h1 || h2 || h3 || h4) {
      closeList(); closePara();
      const match = (h1 || h2 || h3 || h4)!;
      const tag = h1 ? 'h2' : h2 ? 'h3' : h3 ? 'h4' : 'h5';
      out.push(`<${tag}>${inlineFormat(match[1])}</${tag}>`);
      continue;
    }

    if (ul) {
      closePara();
      if (inOl) { out.push('</ol>'); inOl = false; }
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${inlineFormat(ul[1])}</li>`);
      continue;
    }

    if (ol) {
      closePara();
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (!inOl) { out.push('<ol>'); inOl = true; }
      out.push(`<li>${inlineFormat(ol[1])}</li>`);
      continue;
    }

    // Regular paragraph text
    closeList();
    if (!inP) { out.push('<p>'); inP = true; } else { out.push('<br />'); }
    out.push(inlineFormat(trimmed));
  }

  closeList();
  closePara();
  return out.join('\n');
}

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
  { key: 'privacy', title: 'Privacy and Confidentiality', file: 'privacy-and-confidentiality.md' },
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
              <div
                className="guide-content guide-rendered"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(guide.content) }}
              />
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
