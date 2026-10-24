import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Theme coverage guard.
 *
 * `initTheme()` lives in AppShell, so any page entry that does not render
 * AppShell is a separate document that must apply the saved theme itself.
 * Missing it is invisible in the owning page's own tests and only shows up as
 * a dark block embedded in a light page (dashboard_editor/templates,
 * market_data_status, hl_data_actions were all hit by this), so the invariant
 * is enforced by scanning the entries instead of trusting review.
 */

const pagesRoot = resolve(process.cwd(), 'src/pages');

/** Page folders that ship both a Vue root and an entry module. */
function pageNames(): string[] {
  return readdirSync(pagesRoot)
    .filter((name) => statSync(join(pagesRoot, name)).isDirectory())
    .filter((name) => {
      try {
        statSync(join(pagesRoot, name, 'App.vue'));
        statSync(join(pagesRoot, name, 'main.ts'));
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

function readPageFile(name: string, file: string): string {
  return readFileSync(join(pagesRoot, name, file), 'utf8');
}

describe('theme coverage', () => {
  it('applies the saved theme in every entry that does not render AppShell', () => {
    const missingThemeEntries = pageNames().filter((name) => {
      if (/^import AppShell from/m.test(readPageFile(name, 'App.vue'))) return false;
      return !/^initTheme\(\);$/m.test(readPageFile(name, 'main.ts'));
    });

    expect(missingThemeEntries).toEqual([]);
  });
});
