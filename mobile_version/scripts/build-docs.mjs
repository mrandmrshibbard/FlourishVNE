// Generate docs/*.html from docs/*.md. Markdown is the source of truth; the HTML reuses the existing
// sidebar + scroll-spy template (CSS extracted from the current feature-workflows.html). No deps.
import fs from 'node:fs';

// ── GitHub-style heading slug (no space-collapsing: "a & b" -> "a--b") ──
const slug = (s) => s.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── Inline formatting. Code spans are isolated by splitting first, so bold/italic/links/kbd never
//    touch their contents (and no fragile placeholders are needed). ──
function inline(text) {
  return text.split(/(`[^`]+`)/).map(part => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 1) return `<code>${esc(part.slice(1, -1))}</code>`;
    let t = esc(part);
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${url}">${label}</a>`);
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    t = t.replace(/\b((?:Shift|Ctrl|Alt)\+[A-Za-z0-9]+)\b/g, '<kbd>$1</kbd>');
    return t;
  }).join('');
}

// ── Nested list parser (indentation-based) ──
function parseList(lines, start) {
  const items = [];
  let i = start;
  const re = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
  const baseIndent = lines[start].match(re)[1].length;
  while (i < lines.length) {
    const m = lines[i].match(re);
    if (!m) {
      if (lines[i].trim() === '' && i + 1 < lines.length && re.test(lines[i + 1]) && lines[i + 1].match(re)[1].length === baseIndent) { i++; continue; }
      break;
    }
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      const sub = parseList(lines, i);
      if (items.length) items[items.length - 1].childrenHtml = sub.html;
      i = sub.next;
      continue;
    }
    items.push({ ordered: /\d+\./.test(m[2]), content: m[3] });
    i++;
  }
  const ordered = items.length && items[0].ordered;
  const tag = ordered ? 'ol' : 'ul';
  const html = `<${tag}>\n` + items.map(it => `  <li>${inline(it.content)}${it.childrenHtml ? '\n  ' + it.childrenHtml : ''}</li>`).join('\n') + `\n</${tag}>`;
  return { html, next: i };
}

function parseTable(lines, start) {
  const rows = [];
  let i = start;
  while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
  const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const header = cells(rows[0]);
  const body = rows.slice(2);
  let html = '<table>\n<thead><tr>' + header.map(h => `<th>${inline(h)}</th>`).join('') + '</tr></thead>\n<tbody>\n';
  for (const r of body) html += '<tr>' + cells(r).map(c => `<td>${inline(c)}</td>`).join('') + '</tr>\n';
  html += '</tbody>\n</table>';
  return { html, next: i };
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') { i++; continue; }

    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const buf = []; i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2].trim();
      if (level === 1) { out.push(`<h1>${inline(text)}</h1>`); i++; continue; }
      if (level === 2) { out.push(`<h2 id="${slug(text)}">${inline(text)}</h2>`); i++; continue; }
      out.push(`<h${level}>${inline(text)}</h${level}>`); i++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
      const t = parseTable(lines, i); out.push(t.html); i = t.next; continue;
    }
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      const content = buf.join(' ').trim();
      const tip = content.match(/^\*\*(Tip|Note|Warning|Important)\:?\*\*\s*(.*)$/i);
      if (tip) out.push(`<div class="tip"><strong>${tip[1]}:</strong> ${inline(tip[2])}</div>`);
      else out.push(`<blockquote>${inline(content)}</blockquote>`);
      continue;
    }
    if (/^(\s*)([-*]|\d+\.)\s+/.test(line)) { const l = parseList(lines, i); out.push(l.html); i = l.next; continue; }
    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|>\s?|```|\s*\||(-{3,}|\*{3,}|_{3,})\s*$|(\s*)([-*]|\d+\.)\s+)/.test(lines[i])) { buf.push(lines[i].trim()); i++; }
    if (buf.length) {
      const p = buf.join(' ');
      const tm = p.match(/^\*\*Tabs involved:\*\*\s*(.*)$/i);
      if (tm) out.push(`<div class="tabs-involved">${inline(tm[1])}</div>`);
      else out.push(`<p>${inline(p)}</p>`);
    }
  }
  return out;
}

const STYLE = (() => {
  const html = fs.readFileSync('docs/feature-workflows.html', 'utf8');
  const m = html.match(/<style>[\s\S]*?<\/style>/);
  return m ? m[0] : '<style></style>';
})();

const SCROLLSPY = `<script>
const links = document.querySelectorAll('.sidebar nav a[href^="#"]');
const sections = [...links].map(l => document.getElementById(l.getAttribute('href').slice(1))).filter(Boolean);
function onScroll(){
  let current = '';
  for(const s of sections){if(s.getBoundingClientRect().top <= 120) current = s.id;}
  links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#'+current));
}
window.addEventListener('scroll', onScroll, {passive:true});
onScroll();
</script>`;

function buildPage({ mdPath, htmlPath, brandSub, title, otherDocs }) {
  const md = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');
  const lines = md.split('\n');
  let idx = 0;
  while (idx < lines.length && !/^#\s+/.test(lines[idx])) idx++;
  const h1 = lines[idx] ? lines[idx].replace(/^#\s+/, '').trim() : title;
  idx++;
  while (idx < lines.length && lines[idx].trim() === '') idx++;
  const subBuf = [];
  while (idx < lines.length && lines[idx].trim() !== '' && !/^#{1,6}\s/.test(lines[idx])) { subBuf.push(lines[idx].trim()); idx++; }
  const subtitle = subBuf.join(' ');

  let body = lines.slice(idx).join('\n');
  body = body.replace(/##\s+Table of Contents[\s\S]*?(?=\n##\s)/, '');

  const blocks = mdToHtml(body);

  const navLinks = [];
  const idRe = /<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g; let mm;
  const joined = blocks.join('\n');
  while ((mm = idRe.exec(joined))) navLinks.push({ id: mm[1], label: mm[2].replace(/<[^>]+>/g, '') });

  const sidebar = `<aside class="sidebar">
  <div class="sidebar-brand">
    <h2>FlourishVNE</h2>
    <span>${esc(brandSub)}</span>
  </div>
  <nav>
${navLinks.map(n => `    <a href="#${n.id}">${n.label}</a>`).join('\n')}
    <div class="doc-links">
      <div class="nav-section">Other Docs</div>
${otherDocs.map(d => `      <a href="${d.href}">${esc(d.label)}</a>`).join('\n')}
    </div>
  </nav>
</aside>`;

  const main = `<main class="main">
  <h1>${inline(h1)}</h1>
  ${subtitle ? `<p class="subtitle">${inline(subtitle)}</p>` : ''}
  ${blocks.join('\n  ')}
</main>`;

  const out = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
${STYLE}
</head>
<body>

<button class="menu-toggle" onclick="document.querySelector('.sidebar').classList.toggle('open')" aria-label="Toggle menu">☰</button>

${sidebar}

${main}

${SCROLLSPY}
</body>
</html>
`;
  fs.writeFileSync(htmlPath, out);
  console.log(`${htmlPath}: ${navLinks.length} sections`);
}

const PAGES = [
  { mdPath: 'docs/getting-started.md', htmlPath: 'docs/getting-started.html', brandSub: 'Getting Started', title: 'Getting Started — FlourishVNE',
    otherDocs: [{ href: 'feature-workflows.html', label: 'Feature Workflows' }, { href: 'scripting-and-plugins.html', label: 'Scripting & Plugins' }] },
  { mdPath: 'docs/feature-workflows.md', htmlPath: 'docs/feature-workflows.html', brandSub: 'Feature Workflows', title: 'Feature Workflows — FlourishVNE',
    otherDocs: [{ href: 'getting-started.html', label: 'Getting Started' }, { href: 'scripting-and-plugins.html', label: 'Scripting & Plugins' }] },
  { mdPath: 'docs/scripting-and-plugins.md', htmlPath: 'docs/scripting-and-plugins.html', brandSub: 'Scripting & Plugins', title: 'Scripting & Plugins — FlourishVNE',
    otherDocs: [{ href: 'getting-started.html', label: 'Getting Started' }, { href: 'feature-workflows.html', label: 'Feature Workflows' }] },
];

for (const p of PAGES) buildPage(p);
console.log('Docs HTML generated.');
