import { useState, useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../icons/Icon';
import { PanelHeader } from '../../shared/PanelHeader';
import type { Feature } from '../../../types';
import { STRINGS } from '../../../lib/strings';

interface DocArticle {
  id: string;
  file: string;
  category: string;
  title: string;
  blurb: string;
  readTime: string;
  updated: string;
  icon: string;
  order: number;
  content: string;
}

// Maps a Feature.id (see python/src/redshift_backend/data/features.py) to the
// docs article surfaced as the "suggested" card when the user enters Docs from
// that feature. Articles are auto-discovered from /docs/*.md via the Vite glob
// below — this map only chooses which one is highlighted on entry.
const FEATURE_TO_ARTICLE: Record<string, string> = {
  planner: 'constellation-planner',
  sky:     'sky-viewer',
};

const CATEGORIES = STRINGS.DOCS.CATEGORIES;

/* ── Markdown loading ─────────────────────────────────────────── */

// Vite inlines every `.md` file under /docs at build time. The string content
// of each file ends up bundled into the JS, so this works the same in dev,
// `vite build`, and the Tauri production bundle. Editing a file in /docs
// auto-reloads via HMR; GitHub renders the same files for project docs.
const RAW_DOCS = import.meta.glob<string>('../../../../docs/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[kv[1]] = value;
  }
  return { meta, body: match[2] };
}

function loadArticles(): DocArticle[] {
  const out: DocArticle[] = [];
  for (const [path, raw] of Object.entries(RAW_DOCS)) {
    const filename = path.split('/').pop() ?? '';
    const { meta, body } = parseFrontmatter(raw);
    const order = Number.parseInt(meta.order ?? '999', 10);
    out.push({
      id:       meta.id       ?? filename.replace(/\.md$/, ''),
      file:     meta.file     ?? filename,
      category: meta.category ?? 'Reference',
      title:    meta.title    ?? filename,
      blurb:    meta.blurb    ?? '',
      readTime: meta.readTime ?? '',
      updated:  meta.updated  ?? '',
      icon:     meta.icon     ?? 'info',
      order:    Number.isFinite(order) ? order : 999,
      content:  body,
    });
  }
  return out.sort((a, b) => a.order - b.order);
}

const DOC_ARTICLES: DocArticle[] = loadArticles();

/* ── Markdown → HTML ─────────────────────────────────────────── */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Only http(s), mailto, and in-page anchors are permitted. Anything else
// (javascript:, data:, vbscript:, etc.) is rendered as plain text so a
// future docs/*.md mistake can't smuggle script execution through the
// dangerouslySetInnerHTML in the article view.
function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (url.startsWith('#')) return url;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  return null;
}

function processInline(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" rel="noopener noreferrer">${label}</a>` : label;
  });
  return s;
}

function renderMarkdown(src: string): string {
  const lines = src.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      out.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
      i++;
      continue;
    }

    // Headings
    const h1m = /^# (.+)$/.exec(line);
    if (h1m) { out.push(`<h1>${processInline(h1m[1])}</h1>`); i++; continue; }
    const h2m = /^## (.+)$/.exec(line);
    if (h2m) { out.push(`<h2>${processInline(h2m[1])}</h2>`); i++; continue; }
    const h3m = /^### (.+)$/.exec(line);
    if (h3m) { out.push(`<h3>${processInline(h3m[1])}</h3>`); i++; continue; }

    // Horizontal rule
    if (/^---+$/.test(line)) { out.push('<hr>'); i++; continue; }

    // Blockquote
    if (line.startsWith('> ')) {
      const bqLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith('> ') || lines[i] === '>')) {
        bqLines.push(lines[i].startsWith('> ') ? lines[i].slice(2) : '');
        i++;
      }
      out.push(`<blockquote><p>${processInline(bqLines.join(' '))}</p></blockquote>`);
      continue;
    }

    // Table (header row followed by separator)
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\|[-:\s|]+\|$/.test(lines[i + 1].trim())) {
      const splitCells = (row: string) =>
        row.split('|').slice(1, -1).map(c => c.trim());

      const headerCells = splitCells(line);
      const alignCells  = splitCells(lines[i + 1]);
      const aligns = alignCells.map(a =>
        a.startsWith(':') && a.endsWith(':') ? 'center' : a.endsWith(':') ? 'right' : null
      );
      i += 2;

      const bodyRows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitCells(lines[i]);
        const tds = cells.map((c, ci) => {
          const align = aligns[ci];
          return align ? `<td align="${align}">${processInline(c)}</td>` : `<td>${processInline(c)}</td>`;
        }).join('');
        bodyRows.push(`<tr>${tds}</tr>`);
        i++;
      }

      const ths = headerCells.map((c, ci) => {
        const align = aligns[ci];
        return align ? `<th align="${align}">${processInline(c)}</th>` : `<th>${processInline(c)}</th>`;
      }).join('');

      out.push(`<table><thead><tr>${ths}</tr></thead><tbody>${bodyRows.join('')}</tbody></table>`);
      continue;
    }

    // Unordered list
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) {
        items.push(`<li>${processInline(lines[i].slice(2))}</li>`);
        i++;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // Ordered list
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) {
        items.push(`<li>${processInline(lines[i].replace(/^\d+\. /, ''))}</li>`);
        i++;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // Empty line
    if (line.trim() === '') { i++; continue; }

    // Paragraph — collect until a block-level token or blank line
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^[#>]/.test(lines[i]) &&
      !/^[-*] /.test(lines[i]) &&
      !/^\d+\. /.test(lines[i]) &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('---') &&
      !lines[i].trim().startsWith('|')
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${processInline(paraLines.join(' '))}</p>`);
    }
  }

  return out.join('\n');
}

function tocSlug(s: string): string {
  return s.toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');
}

/* ── Article list / docs home ─────────────────────────────────── */

interface DocsHomeProps {
  feature: Feature;
  onOpen: (a: DocArticle) => void;
  onBack?: () => void;
}

function DocsHome({ feature, onOpen, onBack }: DocsHomeProps) {
  const [category, setCategory] = useState('All');
  const [query, setQuery]       = useState('');

  const suggested = useMemo(
    () => DOC_ARTICLES.find(a => a.id === (FEATURE_TO_ARTICLE[feature.id] ?? '')) ?? null,
    [feature.id],
  );

  const filtered = useMemo(() => DOC_ARTICLES.filter(a => {
    if (category !== 'All' && a.category !== category) return false;
    if (query) {
      const q = query.toLowerCase();
      return a.title.toLowerCase().includes(q) || a.blurb.toLowerCase().includes(q);
    }
    return true;
  }), [category, query]);

  return (
    <div className="docs-screen fade-enter fade-in">
      <PanelHeader title={STRINGS.DOCS.TITLE} subtitle={STRINGS.DOCS.SUBTITLE} onBack={onBack} />

      <div className="docs-body">
        <div className="docs-controls">
          <div className="docs-search">
            <Icon name="cursor" size={12}/>
            <input
              type="text"
              placeholder={STRINGS.DOCS.SEARCH_PLACEHOLDER}
              value={query}
              onChange={e => setQuery(e.target.value)}
              spellCheck={false}
            />
            {query && (
              <button className="ds-clear" onClick={() => setQuery('')} aria-label={STRINGS.DOCS.CLEAR_ARIA}>{STRINGS.DOCS.CLEAR_BTN}</button>
            )}
          </div>
          <div className="docs-cats">
            {CATEGORIES.map(c => (
              <button
                key={c}
                className={'docs-cat' + (category === c ? ' on' : '')}
                onClick={() => setCategory(c)}
              >
                {c}
                <span className="dc-count">
                  {c === 'All' ? DOC_ARTICLES.length : DOC_ARTICLES.filter(a => a.category === c).length}
                </span>
              </button>
            ))}
          </div>
        </div>

        {suggested && !query && category === 'All' && (
          <div className="docs-suggested">
            <div className="ds-eyebrow">
              <span className="ds-dot"/> {STRINGS.DOCS.suggestedEyebrow(feature.name)}
            </div>
            <button className="ds-card" onClick={() => onOpen(suggested)}>
              <div className="ds-card-icon"><Icon name={suggested.icon} size={22}/></div>
              <div className="ds-card-body">
                <div className="ds-card-title">{suggested.title}</div>
                <div className="ds-card-blurb">{suggested.blurb}</div>
                <div className="ds-card-meta">
                  <span>{suggested.category}</span>
                  <span className="dotsep">·</span>
                  <span>{suggested.readTime}{STRINGS.DOCS.READ_SUFFIX}</span>
                  <span className="dotsep">·</span>
                  <span className="ds-file">{suggested.file}</span>
                </div>
              </div>
              <span className="ds-card-arrow"><Icon name="arrow-right" size={14}/></span>
            </button>
          </div>
        )}

        <div className="docs-list">
          {filtered.length === 0 ? (
            <div className="docs-empty">
              <div className="de-title">{STRINGS.DOCS.emptyTitle(query)}</div>
              <div className="de-sub">{STRINGS.DOCS.EMPTY_SUB}</div>
            </div>
          ) : (
            filtered.map((a, idx) => (
              <button
                key={a.id}
                className="doc-row"
                style={{ animationDelay: `${idx * 40}ms` }}
                onClick={() => onOpen(a)}
              >
                <div className="dr-icon"><Icon name={a.icon} size={18}/></div>
                <div className="dr-body">
                  <div className="dr-top">
                    <span className="dr-cat">{a.category}</span>
                    <span className="dotsep">·</span>
                    <span className="dr-file">{a.file}</span>
                  </div>
                  <div className="dr-title">{a.title}</div>
                  <div className="dr-blurb">{a.blurb}</div>
                </div>
                <div className="dr-meta">
                  <div className="dr-read">{a.readTime}</div>
                  <div className="dr-updated">{STRINGS.DOCS.UPDATED_PREFIX}{a.updated}</div>
                </div>
                <span className="dr-arrow"><Icon name="arrow-right" size={14}/></span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Article view ─────────────────────────────────────────────── */

interface ArticleViewProps {
  article: DocArticle;
  onBack: () => void;
}

function ArticleView({ article, onBack }: ArticleViewProps) {
  const html = useMemo(() => renderMarkdown(article.content), [article.content]);

  const toc = useMemo(() => {
    const items: { depth: number; text: string }[] = [];
    for (const line of article.content.split('\n')) {
      const m2 = /^## (.+)$/.exec(line);
      const m3 = /^### (.+)$/.exec(line);
      if (m2) items.push({ depth: 2, text: m2[1].trim() });
      else if (m3) items.push({ depth: 3, text: m3[1].trim() });
    }
    return items;
  }, [article.content]);

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bodyRef.current?.querySelectorAll('h2, h3').forEach(h => {
      (h as HTMLElement).id = tocSlug((h as HTMLElement).textContent ?? '');
    });
  }, [html]);

  return (
    <div className="docs-article fade-enter fade-in">
      <PanelHeader title={article.title} subtitle={article.blurb} onBack={onBack} />

      <div className="docs-article-body">
        <aside className="article-toc">
          {toc.length > 0 && (
            <nav className="atc-list">
              {toc.map((t, idx) => (
                <a
                  key={idx}
                  href={'#' + tocSlug(t.text)}
                  className={'atc-item d' + t.depth}
                  onClick={e => {
                    e.preventDefault();
                    const el = bodyRef.current?.querySelector('#' + CSS.escape(tocSlug(t.text)));
                    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                  }}
                >
                  {t.text}
                </a>
              ))}
            </nav>
          )}
        </aside>

        <article className="md-wrap">
          <div className="md-content" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }}/>
        </article>
      </div>
    </div>
  );
}

/* ── Public entry point ───────────────────────────────────────── */

interface DocumentationProps {
  feature: Feature;
  onBack?: () => void;
}

export function Documentation({ feature, onBack }: DocumentationProps) {
  const [article, setArticle] = useState<DocArticle | null>(null);

  return article
    ? <ArticleView article={article} onBack={() => setArticle(null)}/>
    : <DocsHome feature={feature} onOpen={setArticle} onBack={onBack}/>;
}
