import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../../i18n/en.json';
import zh from '../../../i18n/zh.json';

/*
 * Source-derived i18n presence audit (M-v7-10 review round 1): every
 * dictionary key referenced through t('…') in this module's non-test
 * source must exist in BOTH en.json and zh.json. The pre-round-1 audit
 * ran against a hand-assembled key list and missed two keys invented
 * while filling in template empty-states (v7backtest.noPlotImages /
 * noFillsPlots — legacy used literals). Deriving the list from the
 * committed source makes that drift impossible.
 */

const MODULE_ROOT = __dirname;
const KEY_PATTERN = /\bt\('((?:v7backtest|editor|nav|common)\.[A-Za-z0-9_.]+)'/g;

function collectFiles(dir: string, extension: '.ts' | '.vue'): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...collectFiles(full, extension));
    else if (entry.endsWith(extension)) files.push(full);
  }
  return files;
}

function usedKeys(): { key: string; file: string }[] {
  const hits: { key: string; file: string }[] = [];
  const files = [...collectFiles(MODULE_ROOT, '.ts'), ...collectFiles(MODULE_ROOT, '.vue')].filter(
    (file) => !file.endsWith('.test.ts') && !file.endsWith('i18nAudit.test.ts') && !file.endsWith('types.i18n.ts')
  );
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(KEY_PATTERN)) {
      hits.push({ key: match[1]!, file });
    }
  }
  return hits;
}

describe('i18n presence audit (source-derived)', () => {
  it('every t() key used by module source exists in en.json and zh.json', () => {
    const hits = usedKeys();
    expect(hits.length).toBeGreaterThan(100); // the scan actually found keys
    const missingEn = hits.filter((hit) => !(hit.key in en));
    const missingZh = hits.filter((hit) => !(hit.key in zh));
    expect({ missingEn, missingZh }).toEqual({ missingEn: [], missingZh: [] });
  });
});
