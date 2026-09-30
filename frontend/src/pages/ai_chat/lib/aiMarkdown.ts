const MARKDOWN_TABLE_SEPARATOR = /^:?-+:?$/;

function splitTableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim());
}

/** Keep prose separate from GFM tables so marked parses the table reliably. */
export function normalizeMarkdownTables(markdown: string): string {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let fence: string | null = null;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex] || '';
    const fenceMarker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fenceMarker) {
      const fenceToken = fenceMarker[1] || '';
      if (!fence) fence = fenceToken;
      else if (fenceToken[0] === fence[0] && fenceToken.length >= fence.length && !(fenceMarker[2] || '').trim()) fence = null;
      output.push(line);
      continue;
    }
    if (fence || /^( {4}|\t)/.test(line) || lineIndex + 1 >= lines.length) {
      output.push(line);
      continue;
    }

    const separator = lines[lineIndex + 1] || '';
    const separatorCells = splitTableCells(separator);
    if (
      /^( {4}|\t)/.test(separator) ||
      separatorCells.length < 2 ||
      !separatorCells.every((cell) => MARKDOWN_TABLE_SEPARATOR.test(cell))
    ) {
      output.push(line);
      continue;
    }

    let header = line;
    let prefix = '';
    const firstPipe = /(?<!\\)\|/.exec(line);
    if (splitTableCells(header).length !== separatorCells.length && firstPipe && firstPipe.index > 0) {
      prefix = line.slice(0, firstPipe.index).trimEnd();
      header = line.slice(firstPipe.index);
    }
    if (splitTableCells(header).length !== separatorCells.length) {
      output.push(line);
      continue;
    }

    if (prefix) output.push(prefix);
    if (output.length && output[output.length - 1]?.trim()) output.push('');
    output.push(header, separator);
    lineIndex += 2;
    while (lineIndex < lines.length && /(?<!\\)\|/.test(lines[lineIndex] || '') && !/^\s*(`{3,}|~{3,})/.test(lines[lineIndex] || '')) {
      output.push(lines[lineIndex] || '');
      lineIndex += 1;
    }
    if (lineIndex < lines.length && (lines[lineIndex] || '').trim()) output.push('');
    lineIndex -= 1;
  }

  return output.join('\n');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] || character);
}

/** Render model output only after Markdown parsing and DOMPurify sanitization. */
export function renderAiMarkdown(markdown: string): string {
  const safeText = String(markdown || '');
  if (!window.marked || !window.DOMPurify) return escapeHtml(safeText).replace(/\n/g, '<br>');

  window.marked.setOptions?.({ gfm: true, breaks: true });
  const html = window.marked.parse(normalizeMarkdownTables(safeText));
  const purify = window.DOMPurify as unknown as { sanitize(source: string, options?: Record<string, unknown>): string };
  const sanitized = purify.sanitize(html, {
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'],
    ALLOWED_ATTR: ['href', 'title', 'start'],
    ALLOWED_URI_REGEXP: /^https:\/\//,
  });
  const template = document.createElement('template');
  template.innerHTML = sanitized;
  template.content.querySelectorAll('a').forEach((link) => {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
  });
  template.content.querySelectorAll('table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ai-markdown-table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Response table');
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
    table.querySelectorAll('thead th').forEach((header) => { (header as HTMLTableCellElement).scope = 'col'; });
  });
  return template.innerHTML;
}
