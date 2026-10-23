import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isImeComposing, onEnterOutsideIme } from './ime';

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { key: 'Enter', ...init });
}

describe('isImeComposing', () => {
  it('is false for a plain Enter', () => {
    expect(isImeComposing(keydown({}))).toBe(false);
  });

  it('is true while an IME is composing', () => {
    expect(isImeComposing(keydown({ isComposing: true }))).toBe(true);
  });

  it('is true for the keyCode 229 signal Safari sends as composition ends', () => {
    expect(isImeComposing(keydown({ keyCode: 229 }))).toBe(true);
  });
});

describe('onEnterOutsideIme', () => {
  it('runs the handler on a plain Enter', () => {
    let calls = 0;
    onEnterOutsideIme(() => { calls += 1; })(keydown({}));
    expect(calls).toBe(1);
  });

  it('skips the handler during composition', () => {
    let calls = 0;
    const guarded = onEnterOutsideIme(() => { calls += 1; });
    guarded(keydown({ isComposing: true }));
    guarded(keydown({ keyCode: 229 }));
    expect(calls).toBe(0);
  });
});

/**
 * Repo-wide contract: an Enter handler on a free-text field must be IME
 * guarded. Handlers on buttons, rows and toasts are exempt — Enter there
 * is activation, not candidate commitment, and an IME is never composing.
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

/** Index just past the '>' that closes the tag opening at `start`. */
function tagEnd(source: string, start: number): number {
  let quote: string | null = null;
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '>') return i + 1;
  }
  return -1;
}

describe('IME guard coverage', () => {
  it('guards every inline @keydown.enter on a text input', () => {
    const offenders: string[] = [];
    const textInput = /<(Input|input|Textarea|textarea)\b/g;
    for (const file of vueFiles(SRC)) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(textInput)) {
        const start = match.index!;
        const tag = source.slice(start, tagEnd(source, start));
        const enter = tag.match(/@keydown\.enter(?:\.[a-z]+)*="((?:[^"\\]|\\.)*)"/);
        if (!enter) continue;
        if (/isComposing|isImeComposing|keyCode === 229/.test(enter[1]!)) continue;
        const line = source.slice(0, start).split('\n').length;
        offenders.push(`${file.replace(SRC, 'src')}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
