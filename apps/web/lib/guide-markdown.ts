import { readFile, stat } from 'fs/promises';
import path from 'path';

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFormat(input: string) {
  let output = escapeHtml(input);
  output = output.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/__(.+?)__/g, '<u>$1</u>');
  output = output.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  output = output.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  output = output.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  return output;
}

export function parseMarkdown(text: string) {
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
      closeList();
      closePara();
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
      closeList();
      closePara();
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

    closeList();
    if (!inP) { out.push('<p>'); inP = true; } else { out.push('<br />'); }
    out.push(inlineFormat(trimmed));
  }

  closeList();
  closePara();
  return out.join('\n');
}

function guideDirCandidates() {
  return [
    path.join(process.cwd(), 'docs', 'guides'),
    path.join(process.cwd(), '..', '..', 'docs', 'guides'),
  ];
}

export async function readGuideMarkdown(file: string) {
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

export function formatUpdatedAt(value: Date | null) {
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
