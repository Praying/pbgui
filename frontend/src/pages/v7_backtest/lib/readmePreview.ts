/**
 * The archive README preview parser — a SAFE token port of
 * renderArchiveReadmeMarkdown (:6294-6345) + renderMarkdownInline
 * (:6256-6271) + markdownSafeUrl/markdownPreviewUrl (:6216-6248) +
 * archiveRemoteBrowserUrl (:6222-6231) + encodeArchiveRelativePath
 * (:6233-6237). The legacy built HTML strings for innerHTML; the Vue
 * port returns typed tokens the component renders with interpolations
 * (R1: no v-html, scheme-whitelisted hrefs only).
 */

export type MdInline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; nodes: MdInline[] }
  | { kind: 'link'; text: string; href: string | null }
  | { kind: 'image'; alt: string; src: string | null };

export type MdBlock =
  | { kind: 'heading'; level: number; nodes: MdInline[] }
  | { kind: 'paragraph'; nodes: MdInline[] }
  | { kind: 'list'; items: MdInline[][] }
  | { kind: 'table'; header: MdInline[][]; body: MdInline[][][] }
  | { kind: 'code'; lines: string[] };

/** markdownSafeUrl (:6216-6220) — http(s)/mailto only, '#' never carries a payload. */
export function safeMarkdownHref(url: string): string | null {
  const value = String(url ?? '').trim();
  return /^(https?:|mailto:)/i.test(value) ? value : null;
}

/** archiveRemoteBrowserUrl (:6222-6231). */
export function archiveRemoteBrowserUrl(url: string): string {
  let value = String(url ?? '').trim();
  if (!value) return '';
  value = value.replace(/^(https?:\/\/)[^/@]+@/, '$1');
  if (/^git@github\.com:/i.test(value)) value = value.replace(/^git@github\.com:/i, 'https://github.com/');
  if (/^git@gitlab\.com:/i.test(value)) value = value.replace(/^git@gitlab\.com:/i, 'https://gitlab.com/');
  value = value.replace(/\.git$/i, '').replace(/\/$/, '');
  return /^https?:\/\//i.test(value) ? value : '';
}

/** encodeArchiveRelativePath (:6233-6237). */
export function encodeArchiveRelativePath(path: string): string {
  return String(path ?? '')
    .replace(/^\.\//, '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/** markdownPreviewUrl (:6239-6248) — absolute urls pass, pbgui/README map to the remote tree. */
export function readmePreviewUrl(url: string, remoteBase: string): string | null {
  const value = String(url ?? '').trim();
  if (/^(https?:|mailto:)/i.test(value)) return safeMarkdownHref(value);
  const relative = value.replace(/^\.\//, '');
  if (/^(pbgui\/|README\.md$)/i.test(relative)) {
    const base = archiveRemoteBrowserUrl(remoteBase);
    if (base) return `${base}/tree/main/${encodeArchiveRelativePath(relative)}`;
  }
  return null;
}

/** renderMarkdownInline (:6256-6271) as ordered inline tokens. */
export function parseInline(text: string, remoteBase = ''): MdInline[] {
  const nodes: MdInline[] = [];
  let rest = String(text ?? '');
  // restore legacy <wbr> markers as plain text before matching
  rest = rest.replace(/&lt;wbr&gt;/g, '<wbr>');
  const pattern = /\[!\[([^\]]*)\]\(([^)]+)\)\]\(([^)]+)\)|!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*/;
  while (rest.length > 0) {
    const match = rest.match(pattern);
    if (!match) {
      nodes.push({ kind: 'text', text: rest });
      break;
    }
    if (match.index === undefined) break;
    if (match.index > 0) nodes.push({ kind: 'text', text: rest.slice(0, match.index) });
    if (match[1] !== undefined) {
      // [![alt](src)](href) — linked image (:6260-6262)
      nodes.push({ kind: 'image', alt: match[1], src: safeMarkdownHref(match[2] ?? '') });
      void match[3]; // the wrapping link follows the image src whitelist like the legacy
    } else if (match[4] !== undefined) {
      nodes.push({ kind: 'image', alt: match[4], src: safeMarkdownHref(match[5] ?? '') });
    } else if (match[6] !== undefined) {
      nodes.push({ kind: 'link', text: match[6], href: readmePreviewUrl(match[7] ?? '', remoteBase) });
    } else if (match[8] !== undefined) {
      nodes.push({ kind: 'code', text: match[8] });
    } else if (match[9] !== undefined) {
      nodes.push({ kind: 'strong', nodes: [{ kind: 'text', text: match[9] }] });
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return nodes;
}

/** renderMarkdownTable's separator filter (:6279-6281). */
function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** renderArchiveReadmeMarkdown (:6294-6345) as block tokens. */
export function parseReadme(markdown: string, remoteBase = ''): MdBlock[] {
  const lines = String(markdown ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let table: string[] = [];
  let code: string[] = [];
  let inCode = false;

  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', nodes: parseInline(paragraph.join(' '), remoteBase) });
    paragraph = [];
  }
  function flushList(): void {
    if (list.length === 0) return;
    blocks.push({ kind: 'list', items: list.map((item) => parseInline(item, remoteBase)) });
    list = [];
  }
  function flushTable(): void {
    if (table.length === 0) return;
    const parsed = table.map(splitTableRow);
    const header = parsed[0] ?? [];
    const body = parsed.slice(1).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
    blocks.push({
      kind: 'table',
      header: header.map((cell) => parseInline(cell, remoteBase)),
      body: body.map((row) => row.map((cell) => parseInline(cell, remoteBase))),
    });
    table = [];
  }
  function flushCode(): void {
    if (code.length === 0) return;
    blocks.push({ kind: 'code', lines: code.slice() });
    code = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        flushList();
        flushTable();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (/^<!--\s*pbgui:/.test(trimmed)) continue;
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }
    if (/^\|/.test(trimmed)) {
      flushParagraph();
      flushList();
      table.push(trimmed);
      continue;
    }
    flushTable();
    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'heading', level: heading[1]!.length, nodes: parseInline(heading[2]!, remoteBase) });
      continue;
    }
    const bullet = trimmed.match(/^-\s+(.+)$/);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]!);
      continue;
    }
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  flushTable();
  flushCode();
  return blocks;
}
