import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

/* NOTE: `new URL('./x', import.meta.url)` is REWRITTEN by Vite's asset
   plugin into an http:// URL (base /app/dist/), which breaks fileURLToPath
   under vitest — use import.meta.dirname instead. */
const widgetsCss = readFileSync(join(import.meta.dirname, 'widgets.css'), 'utf8');

/* widgets.css is the frozen port of the CSS the legacy engine injected via
   DashRender.injectCSS (dashboard_render.js `_CSS` array, lines 52-354).
   dashboard_render.js was removed at D-editor-8 after byte-parity was
   verified; the digest below was computed from that verified-parity
   content, so any CSS drift — accidental or deliberate — must consciously
   update this expectation. */

/** sha256 of the normalized CSS; re-frozen at the style-unification pass
   (hardcoded colors redirected to the shared @/styles/tokens.css), then at
   the viewport-hardening pass (100vh declarations gained 100dvh twins),
   then at the palette-consolidation pass (rgba literals routed through the
   semantic -rgb token channels), then at the Morandi-palette pass (last
   escaped hex literals — #276749/#2a3a5c/#8a4b05/#070b12/rgba(45,55,72) —
   routed to success/accent/warning/bg-page/bg-elevated tokens), then at the
   deep-space-palette pass (value-level swap onto the blue-slate terminal
   palette). */
const FROZEN_WIDGETS_CSS_SHA256 = '8c1bf31750076914c0b570f273c50c70ca88ad15f2cd71b2f0d253dcecc57ecb';

function normalize(text: string): string {
  /* Comments are stripped (the legacy _CSS section headers were raw JS
     comments between array elements, never part of the joined string; the
     CSS file keeps them as readable comments). Only the line BREAKS are
     removed: the legacy strings carry their own leading 2-space indents as
     content, and widgets.css reproduces that indentation verbatim. */
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r?\n/g, '')
    .trim();
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('widgets.css — frozen port of the legacy _CSS (52-354)', () => {
  it('stays byte-identical to the verified-parity port (frozen digest)', () => {
    const normalized = normalize(widgetsCss);
    expect(normalized.length).toBeGreaterThan(8000); // sanity: the real stylesheet
    expect(sha256(normalized)).toBe(FROZEN_WIDGETS_CSS_SHA256);
  });

  it('aliases the widget tokens to the shared design tokens', () => {
    /* Style unification: the --db-* values now reference the global
       @/styles/tokens.css instead of duplicating hardcoded hex values. */
    const normalized = normalize(widgetsCss);
    for (const token of ['--db-bg:var(--bg-page)', '--db-surface:var(--bg-card)', '--db-pos:var(--success-soft)', '--db-neg:var(--danger-soft)']) {
      expect(normalized).toContain(token);
    }
  });

  it('keeps the legacy widget chrome classes', () => {
    const normalized = normalize(widgetsCss);
    for (const cls of ['.db-root', '.dt-header', '.dt-trash', '.di-table', '.dp-modal', '.do-chart-wrap']) {
      expect(normalized).toContain(cls);
    }
  });
});
