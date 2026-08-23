import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Page stylesheets are un-layered CSS, and un-layered rules beat every
   @layer (Tailwind's base/components/utilities) regardless of specificity.
   A bare element selector in a page stylesheet therefore overrides shared
   component classes wholesale — e.g. a legacy `a { color: var(--accent) }`
   reset silenced `.workbench-rail__item { color: var(--text-secondary) }`
   in @layer components and turned the whole workbench rail blue on the
   backtest pages (fixed by deleting the duplicate; the shared base layer
   in tailwind.css already provides the identical `a` rule).

   This contract keeps that trap from coming back: page stylesheets may
   not declare rules whose selectors are bare `a`/`a:hover` — the shared
   base layer owns those. Compound selectors (`.panel a`, `#help a`, …)
   are fine and stay untouched. */

function pageStyleSheets(): string[] {
  const root = join(import.meta.dirname, '..', '..', 'pages');
  const sheets: string[] = [];
  for (const page of readdirSync(root)) {
    const stylesDir = join(root, page, 'styles');
    if (!existsSync(stylesDir)) continue;
    for (const name of readdirSync(stylesDir)) {
      if (name.endsWith('.css')) sheets.push(join(stylesDir, name));
    }
  }
  return sheets;
}

describe('page stylesheets vs the Tailwind layer cascade', () => {
  it('declare no bare `a` rules (un-layered, they override the shared rail links)', () => {
    const offenders: string[] = [];
    for (const sheet of pageStyleSheets()) {
      const css = readFileSync(sheet, 'utf8');
      // strip comments, then flag selectors that are exactly `a` / `a:hover`
      const bare = css
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .match(/(^|\})\s*(a|a:hover)\s*\{/g);
      if (bare) offenders.push(`${sheet}: ${bare.map((m) => m.trim()).join(', ')}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
