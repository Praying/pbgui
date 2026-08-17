import { describe, expect, it } from 'vitest';
import { archiveRemoteBrowserUrl, encodeArchiveRelativePath, parseReadme, readmePreviewUrl, safeMarkdownHref } from './readmePreview';

/*
 * The archive README preview parser — a SAFE token port of
 * renderArchiveReadmeMarkdown (:6294-6345) + renderMarkdownInline
 * (:6256-6271) + markdownSafeUrl/markdownPreviewUrl (:6216-6248).
 * The legacy built HTML strings; the Vue port must never v-html, so
 * this returns typed tokens the component renders with interpolations
 * (scheme-whitelisted hrefs only).
 */

describe('parseReadme blocks (:6294-6345)', () => {
  it('parses headings, paragraphs, bullets, tables and code fences', () => {
    const blocks = parseReadme('# Title\n\nSome text here\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode line\n```\n');
    expect(blocks.map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'table', 'code']);
    const heading = blocks[0];
    expect(heading?.kind === 'heading' && heading.level).toBe(1);
    const list = blocks[2];
    expect(list?.kind === 'list' && list.items).toHaveLength(2);
    const table = blocks[3];
    expect(table?.kind === 'table' && table.header).toEqual([[{ kind: 'text', text: 'A' }], [{ kind: 'text', text: 'B' }]]);
    expect(table?.kind === 'table' && table.body).toEqual([[[{ kind: 'text', text: '1' }], [{ kind: 'text', text: '2' }]]]); // row → cell → inline nodes
    const code = blocks[4];
    expect(code?.kind === 'code' && code.lines).toEqual(['code line']);
  });

  it('joins consecutive non-empty lines into one paragraph and normalizes line endings', () => {
    const blocks = parseReadme('line one\r\nline two');
    expect(blocks).toHaveLength(1);
    const para = blocks[0];
    expect(para?.kind === 'paragraph' && (para.nodes[0] as { text?: string })?.text).toBe('line one line two');
  });

  it('skips pbgui HTML comments (:6329)', () => {
    expect(parseReadme('<!-- pbgui:meta -->\ntext')).toHaveLength(1);
  });

  it('drops the markdown separator row from tables (:6279-6281)', () => {
    const blocks = parseReadme('| H |\n| --- |\n| v |');
    const table = blocks[0];
    expect(table?.kind === 'table' && table.body).toHaveLength(1);
  });
});

describe('parseReadme inline (:6256-6271)', () => {
  it('parses code spans and bold', () => {
    const blocks = parseReadme('a `code` b **bold** c');
    const para = blocks[0];
    if (para?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(para.nodes).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ' b ' },
      { kind: 'strong', nodes: [{ kind: 'text', text: 'bold' }] },
      { kind: 'text', text: ' c' },
    ]);
  });

  it('parses links with whitelisted hrefs and images', () => {
    const blocks = parseReadme('[docs](https://example.com) and ![logo](https://example.com/l.png)');
    const para = blocks[0];
    if (para?.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(para.nodes[0]).toEqual({ kind: 'link', text: 'docs', href: 'https://example.com' });
    expect(para.nodes[1]).toEqual({ kind: 'text', text: ' and ' });
    expect(para.nodes[2]).toEqual({ kind: 'image', alt: 'logo', src: 'https://example.com/l.png' });
  });

  it('drops javascript: and data: schemes entirely (XSS)', () => {
    const blocks = parseReadme('[bad](javascript:alert(1)) and [img](data:text/html,x) and ![x](javascript:alert(2))');
    const para = blocks[0];
    if (para?.kind !== 'paragraph') throw new Error('expected paragraph');
    const link = para.nodes[0];
    if (link?.kind !== 'link') throw new Error('expected link');
    expect(link.href).toBeNull();
    expect(link.text).toBe('bad');
  });

  it('keeps raw angle-bracket payloads as text (escaped by Vue rendering)', () => {
    const blocks = parseReadme('<img onerror=alert(1) src=x>');
    const para = blocks[0];
    expect(para?.kind === 'paragraph' && JSON.stringify(para.nodes)).toContain('<img onerror=alert(1) src=x>');
  });
});

describe('url helpers (:6216-6248)', () => {
  it('safeMarkdownHref allows only http(s) and mailto', () => {
    expect(safeMarkdownHref('https://a.b')).toBe('https://a.b');
    expect(safeMarkdownHref('http://a.b')).toBe('http://a.b');
    expect(safeMarkdownHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeMarkdownHref('javascript:alert(1)')).toBeNull();
    expect(safeMarkdownHref('data:text/html,x')).toBeNull();
    expect(safeMarkdownHref(' javascript:alert(1)')).toBeNull();
    expect(safeMarkdownHref('')).toBeNull();
  });

  it('strips credentials and normalizes ssh remote urls (:6222-6231)', () => {
    expect(archiveRemoteBrowserUrl('https://user:token@github.com/o/r.git')).toBe('https://github.com/o/r');
    expect(archiveRemoteBrowserUrl('git@github.com:o/r.git')).toBe('https://github.com/o/r');
    // legacy strips .git BEFORE the trailing slash, so '.git/' keeps the suffix
    expect(archiveRemoteBrowserUrl('git@gitlab.com:o/r.git/')).toBe('https://gitlab.com/o/r.git');
    expect(archiveRemoteBrowserUrl('ssh://git@gitlab.example.com/o/r.git')).toBe('');
    expect(archiveRemoteBrowserUrl('')).toBe('');
  });

  it('encodes each relative path segment (:6233-6237)', () => {
    expect(encodeArchiveRelativePath('./pbgui/a b/c.json')).toBe('pbgui/a%20b/c.json');
  });

  it('maps pbgui/README relative links to the remote tree when a base exists (:6239-6248)', () => {
    const base = 'https://github.com/o/r';
    expect(readmePreviewUrl('./pbgui/backtests.json', base)).toBe('https://github.com/o/r/tree/main/pbgui/backtests.json');
    expect(readmePreviewUrl('README.md', base)).toBe('https://github.com/o/r/tree/main/README.md');
    expect(readmePreviewUrl('other/file.json', base)).toBeNull();
    expect(readmePreviewUrl('./pbgui/x.json', '')).toBeNull();
  });

  it('keeps absolute urls untouched through readmePreviewUrl', () => {
    expect(readmePreviewUrl('https://x.y/z', 'https://github.com/o/r')).toBe('https://x.y/z');
    expect(readmePreviewUrl('javascript:alert(1)', 'https://github.com/o/r')).toBeNull();
  });
});
