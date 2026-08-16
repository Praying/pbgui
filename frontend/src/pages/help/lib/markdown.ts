/*
 * Help-content markdown → sanitized HTML.
 *
 * RENDERER DECISION (documented per the migration brief): the hardened
 * pages/market_data/lib/markdown.ts does NOT fit this page — the help guides
 * are full GFM including tables (e.g. docs/help/41_db_tools.md,
 * docs/help/33_dashboard.md) and that converter has no table support, so
 * tables would render as raw pipe text. The repo-wide help renderer — the
 * legacy help.html (:619, :653-655) AND the shared overlay
 * frontend/js/shared_help_overlay.js — is the LOCAL vendor stack
 * marked (GFM) + DOMPurify from /app/vendor/ (no CDN), and this port keeps
 * it 1:1:
 *
 *   renderMarkdown(md) = DOMPurify.sanitize(marked.parse(md))
 *
 * SECURITY: v-html only ever receives DOMPurify-sanitized output — never raw
 * server markdown. When the vendor scripts are unavailable (stripped bundle,
 * unit tests without the vendor files) the hardened fallback renders fully
 * HTML-escaped plain text, so unsanitized markup can never reach the DOM.
 */

type MarkedLike = {
  parse: (md: string) => string;
  setOptions?: (options: Record<string, unknown>) => void;
};

type DomPurifyLike = {
  sanitize: (html: string) => string;
};

declare global {
  interface Window {
    marked?: MarkedLike;
    DOMPurify?: DomPurifyLike;
  }
}

/** Legacy marked options (help.html:619). Re-applied per render — idempotent
 *  and avoids cross-render module state. */
const MARKED_OPTIONS: Record<string, unknown> = { gfm: true, breaks: true };

/** Escape &, <, > — used by the no-vendor fallback and snippet rendering. */
export function escapeHtmlText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Vendor renderer available (marked + DOMPurify from /app/vendor/)? */
export function hasVendorRenderer(): boolean {
  return Boolean(window.marked?.parse && window.DOMPurify?.sanitize);
}

/**
 * Markdown → sanitized HTML (legacy renderMarkdown :653-655).
 *
 * Falls back to HTML-escaped plain text when the vendor scripts are missing
 * — content stays visible and can never inject live markup.
 */
export function renderMarkdown(md: unknown): string {
  const text = String(md || '');
  if (!hasVendorRenderer()) return escapeHtmlText(text);
  const marked = window.marked!;
  const purify = window.DOMPurify!;
  marked.setOptions?.(MARKED_OPTIONS);
  return purify.sanitize(marked.parse(text));
}
