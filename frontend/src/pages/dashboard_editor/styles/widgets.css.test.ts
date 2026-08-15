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

/** sha256 of the normalized CSS, frozen at D-editor-8 (parity verified). */
const FROZEN_WIDGETS_CSS_SHA256 = '50e6b22988b639b7a3ebd3ce7bd936312b74734b4d79a0ff36b30ce8fb171672';

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

  it('keeps the legacy design tokens', () => {
    const normalized = normalize(widgetsCss);
    for (const token of ['--db-bg:#0e1117', '--db-surface:#1a202c', '--db-pos:#48bb78', '--db-neg:#f56565']) {
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
