import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* NOTE: `new URL('./x', import.meta.url)` is REWRITTEN by Vite's asset
   plugin into an http:// URL (base /app/dist/), which breaks fileURLToPath
   under vitest — use import.meta.dirname instead. */
const widgetsCss = readFileSync(join(import.meta.dirname, 'widgets.css'), 'utf8');

/**
 * Parity lock: the Vue stylesheet must carry the exact CSS the legacy engine
 * injects via DashRender.injectCSS (dashboard_render.js `_CSS` array, lines
 * 52-354). dashboard_render.js stays live until D-editor-8, so this test
 * fails loudly if the two ever drift.
 */
function legacyCss(): string {
  const source = readFileSync(join(import.meta.dirname, '../../../../dashboard_render.js'), 'utf8');
  const match = /var _CSS = \[([\s\S]*?)\]\.join\(''\)/.exec(source);
  if (!match) throw new Error('could not locate the _CSS array in dashboard_render.js');
  /* match[1] exists whenever the regex matches (single capture group). */
  const literals = [...match[1]!.matchAll(/'([^'\\]|\\.)*'/g)].map((m) => {
    /* Re-decode the JS single-quoted literal as a JSON string: escape
       backslashes first, then the double quotes that JS allows raw
       (e.g. "Segoe UI" in the --db-font token). The _CSS block contains no
       escape sequences today; if the legacy file ever grows some, this parse
       fails loudly instead of silently drifting. m[0] is non-empty by the
       regex (a quote pair always matches at least the quotes). */
    const raw = m[0]!.slice(1, -1);
    return JSON.parse(`"${raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  });
  return literals.join('');
}

function normalize(text: string): string {
  /* Comments are stripped (the legacy _CSS section headers are raw JS
     comments between array elements, never part of the joined string; the
     CSS file keeps them as readable comments). Only the line BREAKS are
     removed: the legacy strings carry their own leading 2-space indents as
     content, and widgets.css reproduces that indentation verbatim — so
     removing \n reconstructs the exact `join('')` of the legacy array. */
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\r?\n/g, '')
    .trim();
}

describe('widgets.css vs dashboard_render.js _CSS (52-354)', () => {
  it('carries every design token and widget rule the legacy engine injects', () => {
    const legacy = legacyCss();
    expect(legacy.length).toBeGreaterThan(8000); // sanity: the real _CSS, not an empty extraction
    expect(normalize(widgetsCss)).toBe(normalize(legacy));
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
