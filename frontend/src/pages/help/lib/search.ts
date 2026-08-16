/*
 * Pure search helpers ported from the legacy help.html inline script.
 * Legacy line references per function; behavior kept 1:1 except where a
 * hardening note says otherwise.
 */

import { escapeHtmlText } from './markdown';

/** Legacy escapeRegExp (:661-663). */
export function escapeRegExp(value: unknown): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Legacy stripHtml (:657-659) — tags → space, whitespace collapsed. */
export function stripHtml(html: unknown): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Case-insensitive match offsets of `term` in `text`, capped at `limit`
 * (legacy showGlobalResults loop :795-800).
 */
export function findMatchPositions(text: string, term: string, limit = 3): number[] {
  if (!term) return [];
  const expr = new RegExp(escapeRegExp(term), 'gi');
  const positions: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = expr.exec(text)) !== null) {
    positions.push(match.index);
    if (positions.length >= limit) break;
  }
  return positions;
}

/** Legacy snippet slice (:805-807): 55 chars before, 80 after the match. */
export function snippetAt(text: string, position: number): string {
  return text.slice(Math.max(0, position - 55), Math.min(text.length, position + 80));
}

/**
 * Wrap search-term matches in <mark> OUTSIDE of tags (legacy applySearch
 * replacement :701-710). Input must already be SANITIZED html (from
 * renderMarkdown); the term is regexp-escaped and only plain-text segments
 * between tags are wrapped, so no new markup can be introduced.
 */
export function highlightMarks(html: string, term: string): string {
  if (!term || !html) return html;
  let expr: RegExp;
  try {
    expr = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
  } catch {
    return html;
  }
  return html.replace(/(<[^>]+>)|([^<]+)/g, (_match: string, tag: string, text: string) => {
    if (tag) return tag;
    return text.replace(expr, (inner: string) => '<mark>' + inner + '</mark>');
  });
}

/**
 * Escaped + highlighted snippet for global-search result cards.
 *
 * HARDENING (documented deviation): the legacy page interpolated raw
 * snippet/title strings into innerHTML (:751-759); the Vue port escapes the
 * text first (Vue interpolation already escapes titles) and only then wraps
 * the term in <mark>. A term containing markup characters may no longer
 * self-highlight, but markup can never inject through a snippet.
 */
export function highlightSnippet(snippet: string, term: string): string {
  const escaped = escapeHtmlText(snippet);
  if (!term) return escaped;
  const expr = new RegExp('(' + escapeRegExp(term) + ')', 'gi');
  return escaped.replace(expr, '<mark>$1</mark>');
}
