import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Dialog contract: every modal overlay must be a labelled dialog that
 * contains keyboard focus. Two compliant shapes exist:
 *
 *   1. ui/Modal (reka-ui) — traps and restores focus itself.
 *   2. a hand-written overlay whose panel carries role="dialog" and
 *      v-focus-trap (shared/directives/focusTrap.ts).
 *
 * A file with a z-modal overlay that does neither lets Tab walk out behind
 * the backdrop into the page, which is exactly what this test prevents.
 */
const SRC = resolve(process.cwd(), 'src');

function vueFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...vueFiles(full));
    else if (entry.endsWith('.vue')) out.push(full);
  }
  return out;
}

const OVERLAY = /fixed inset-0[^"']*z-\[var\(--z-modal\)\]|z-\[var\(--z-modal\)\][^"']*fixed inset-0/;

describe('dialog focus containment', () => {
  const files = vueFiles(SRC);

  it('gives every z-modal overlay a role="dialog" panel', () => {
    const offenders = files
      .filter((file) => {
        // Modal.vue is the focus-trapping primitive itself (reka DialogContent).
        if (file.endsWith('ui/modal/Modal.vue')) return false;
        const source = readFileSync(file, 'utf8');
        if (!OVERLAY.test(source)) return false;
        return !/role="dialog"|from '@\/shared\/components\/ui\/modal'/.test(source);
      })
      .map((file) => file.replace(SRC, 'src'));
    expect(offenders).toEqual([]);
  });

  it('traps focus in every hand-written role="dialog"', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith('WorkbenchRail.vue') || file.endsWith('ui/modal/Modal.vue')) continue;
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/<[a-zA-Z][^<>]*?role="dialog"[^<>]*?>/gs)) {
        if (/v-focus-trap/.test(match[0])) continue;
        const line = source.slice(0, match.index).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
