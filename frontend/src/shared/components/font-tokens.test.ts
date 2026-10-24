import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** One sans stack and one mono stack, both defined in tailwind.css. Any other
 *  literal font-family drifts the UI out of the type system. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.(vue|css|ts)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });
}

describe('font tokens', () => {
  it('no source outside tailwind.css hard-codes a font family', () => {
    const offenders = sources(join(__dirname, '../..'))
      .filter((p) => !p.endsWith('styles/tailwind.css'))
      .filter((p) => {
        const text = readFileSync(p, 'utf8');
        const families = [...text.matchAll(/font-family:\s*([^;}\n]*)/g)].map((m) => m[1]!.trim());
        const literal = families.some((f) => !/^(var\(--font|inherit)/.test(f));
        return literal || /font-\[[^\]]*(Fira|Consolas|Cascadia|monospace|Segoe)/i.test(text);
      });
    expect(offenders).toEqual([]);
  });
});
