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

describe('page templates vs Tailwind same-property conflicts', () => {
  /* Tailwind emits same-property utilities in its own fixed order — the
     order classes appear in the template is irrelevant. A class list like
     "bg-card bg-accent/8" therefore renders NEUTRAL (bg-card sorts later),
     silently killing the variant tint. Found live on cluster_sync's
     primary/danger buttons after the batch-1 migration; helpers and static
     lists must each carry a complete, non-overlapping colour set. */
  const COLOUR = /^(bg|text|border|border-b|border-t|border-l|border-r)-(primary|secondary|muted|disabled|placeholder|accent|accent-soft|accent-deep|accent-contrast|success|success-soft|success-deep|warning|warning-soft|warning-deep|danger|danger-soft|danger-deep|page|panel|card|elevated|input|workspace|sidebar|backdrop|border-subtle|border-default|border-strong)(\/\d+)?$|^(bg|text|border)-\[#[0-9a-fA-F]{3,8}\](\/\d+)?$/;

  function pageVueFiles(): string[] {
    const root = join(import.meta.dirname, '..', '..', 'pages');
    const out: string[] = [];
    for (const page of readdirSync(root)) {
      (function walk(dir: string): void {
        const d = join(root, page, dir);
        if (!existsSync(d)) return;
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(join(dir, e.name));
          else if (e.name.endsWith('.vue')) out.push(p);
        }
      })('.');
    }
    return out;
  }

  it('never places two same-property colour utilities in one static class list', () => {
    const offenders: string[] = [];
    for (const f of pageVueFiles()) {
      const src = readFileSync(f, 'utf8');
      /* Static class="…" lists only — :class bindings hold ternaries whose
         branches each carry a complete colour set, so scanning them would
         false-positive on the two branches. */
      for (const m of src.matchAll(/(?<![:\w])class="([^"]*)"/g)) {
        const words = (m[1] ?? '').split(/\s+/).filter(Boolean);
        const seen = new Map<string, string>();
        for (const w of words) {
          if (!COLOUR.test(w)) continue;
          /* Directional borders (border-t-accent) set border-top-color —
             a different property from border-color, and the standard way
             to build spinners, so they never conflict with border-* tints. */
          let prop: string;
          if (w.startsWith('bg-')) prop = 'background-color';
          else if (w.startsWith('text-')) prop = 'color';
          else if (w.startsWith('border-t-')) prop = 'border-top-color';
          else if (w.startsWith('border-b-')) prop = 'border-bottom-color';
          else if (w.startsWith('border-l-')) prop = 'border-left-color';
          else if (w.startsWith('border-r-')) prop = 'border-right-color';
          else prop = 'border-color';
          const prev = seen.get(prop);
          if (prev && prev !== w) offenders.push(`${f}: "${m[1]}" (${prev} vs ${w})`);
          seen.set(prop, w);
        }
      }
    }
    expect(offenders, offenders.slice(0, 10).join('\n')).toEqual([]);
  });
});
