/*
 * Hardened port of the legacy hand-rolled markdown→HTML converter
 * (market_data_main.html:3867-3955), used for help content rendering.
 *
 * SECURITY (recon R1): the legacy inlineFormat (:3880-3889) did not escape
 * `&<>` outside code fences and passed img src / link href URLs through
 * unfiltered — help .md content is server-supplied but only semi-trusted.
 * This port hardens exactly those two surfaces while keeping the legacy
 * block structure and inline grammar byte-compatible for benign input:
 *
 *   1. every non-fence line is HTML-escaped BEFORE inline formatting, so
 *      raw HTML in paragraphs/headings/lists/quotes/code spans renders as
 *      text instead of live markup;
 *   2. link/image URLs must be scheme-safe (http/https/mailto or relative/
 *      anchor/protocol-relative) and contain no control characters — a URL
 *      like `java\tscript:` is rejected because browsers strip whitespace
 *      before parsing schemes; unsafe URLs drop the tag and keep the label.
 *
 * Fence bodies keep the legacy escaping (only &, <, >) and therefore render
 * byte-identically to legacy output.
 */

/** Allowed absolute URL schemes; everything else must be scheme-relative. */
const SAFE_URL_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:']);

/** Control characters and whitespace — browsers strip these inside URL
 *  attributes, which re-enables `jav&#x09;ascript:` scheme smuggling. */
const UNSAFE_URL_CHARS = /[\x00-\x20\x7f]/;

const SCHEME_PREFIX = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** Legacy esc() (:3830-3837) — also neutralizes attribute-context quotes. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL gate for href/src attributes (R1 hardening). Input is already
 * HTML-escaped, which additionally neutralizes entity smuggling
 * (`java&#115;cript:` arrives here as `java&amp;#115;cript:` — a harmless
 * relative URL). Returns null when the URL must not be linked.
 */
function safeUrl(url: string): string | null {
  if (UNSAFE_URL_CHARS.test(url)) return null;
  const scheme = SCHEME_PREFIX.exec(url);
  if (!scheme) return url; // relative, #anchor or //protocol-relative
  return SAFE_URL_SCHEMES.has(scheme[1]!.toLowerCase() + ':') ? url : null;
}

const CODE_SPAN = /`([^`]+)`/g;
const IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g;
const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const STRONG_ASTERISK = /\*\*(.+?)\*\*/g;
const STRONG_UNDERSCORE = /__(.+?)__/g;
const EM_ASTERISK = /\*(.+?)\*/g;
const EM_UNDERSCORE = /_(.+?)_/g;

/** Legacy inlineFormat (:3880-3889) on an already-escaped line, with the
 *  URL gate added to the image/link rules. */
function inlineFormat(text: string): string {
  return text
    .replace(CODE_SPAN, '<code>$1</code>')
    .replace(IMAGE, (_match, alt: string, url: string) =>
      safeUrl(url) === null ? alt : `<img src="${url}" alt="${alt}">`
    )
    .replace(LINK, (_match, label: string, url: string) => {
      const href = safeUrl(url);
      return href === null ? label : `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
    })
    .replace(STRONG_ASTERISK, '<strong>$1</strong>')
    .replace(STRONG_UNDERSCORE, '<strong>$1</strong>')
    .replace(EM_ASTERISK, '<em>$1</em>')
    .replace(EM_UNDERSCORE, '<em>$1</em>');
}

const FENCE = /^```/;
const HR = /^(?:---+|\*\*\*+)$/;
const HEADING = /^(#{1,6})\s+(.*)/;
const QUOTE = /^>\s?/;
const UL_ITEM = /^[\-*]\s+(.*)/;
const OL_ITEM = /^\d+\.\s+(.*)/;

/** Legacy fence-body escaping (:3899) — & < > only, no quotes. */
function escapeFence(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Markdown → HTML (legacy mdToHtml :3867-3955 with the R1 hardening).
 * Grammar: triple-backtick fences, --- and *** rules, #..###### headings,
 * > quotes, -/* bullet lists, 1. ordered lists, blank-line paragraphs, and
 * inline `code` **bold** __bold__ *em* _em_ [text](url) ![alt](url).
 */
export function mdToHtml(md: unknown): string {
  const lines = String(md || '').split('\n'); // legacy falsy handling (:3868)
  let html = '';
  let inPre = false;
  let preBuf = '';
  let inUl = false;
  let inOl = false;

  function flushList(): void {
    if (inUl) {
      html += '</ul>';
      inUl = false;
    }
    if (inOl) {
      html += '</ol>';
      inOl = false;
    }
  }

  for (const line of lines) {
    if (FENCE.test(line)) {
      if (!inPre) {
        flushList();
        inPre = true;
        preBuf = '';
      } else {
        html += `<pre><code>${escapeFence(preBuf)}</code></pre>`;
        inPre = false;
      }
      continue;
    }
    if (inPre) {
      preBuf += (preBuf ? '\n' : '') + line;
      continue;
    }
    if (HR.test(line)) {
      flushList();
      html += '<hr>';
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushList();
      const level = heading[1]!.length;
      html += `<h${level}>${inlineFormat(escapeHtml(heading[2]))}</h${level}>`;
      continue;
    }
    if (QUOTE.test(line)) {
      flushList();
      html += `<blockquote>${inlineFormat(escapeHtml(line.replace(QUOTE, '')))}</blockquote>`;
      continue;
    }
    const ulMatch = UL_ITEM.exec(line);
    if (ulMatch) {
      if (!inUl) {
        if (inOl) {
          html += '</ol>';
          inOl = false;
        }
        html += '<ul>';
        inUl = true;
      }
      html += `<li>${inlineFormat(escapeHtml(ulMatch[1]))}</li>`;
      continue;
    }
    const olMatch = OL_ITEM.exec(line);
    if (olMatch) {
      if (!inOl) {
        if (inUl) {
          html += '</ul>';
          inUl = false;
        }
        html += '<ol>';
        inOl = true;
      }
      html += `<li>${inlineFormat(escapeHtml(olMatch[1]))}</li>`;
      continue;
    }
    if (line.trim() === '') {
      flushList();
      html += '<p></p>';
      continue;
    }
    flushList();
    html += `<p>${inlineFormat(escapeHtml(line))}</p>`;
  }
  flushList();
  return html;
}
