import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* The PBGui type ladder contract.

   The ladder in src/styles/tailwind.css is the single source of truth for
   font sizes; the tracking and weight contracts next to it collapse what used
   to be ~17 tracking spellings and 9 weight values. These assertions keep all
   three from decaying back into per-page literals (before this contract the
   pages carried 462 text-[...] overrides across ~25 near-duplicate sizes,
   the worst cluster being 13px x140 / 13.5px x65 / 0.8rem x53).

   Comments are masked before scanning: the ladder documents its own rule as
   "never write text-[13px]", and the @font-face carries `font-weight: 300 700`
   for Space Grotesk's variable range. Both are prose/mechanics, not
   violations. */

const styles = readFileSync(join(import.meta.dirname, '..', '..', 'styles', 'tailwind.css'), 'utf8');

const EXPECTED_LADDER = [
  ['micro', '11px', '14px'],
  ['xs', '12px', '15px'],
  ['compact', '13px', '18px'],
  ['sm', '14px', '19px'],
  ['base', '15px', '22px'],
  ['md', '16px', '22px'],
  ['lg', '19px', '26px'],
  ['xl', '23px', '26px'],
  ['2xl', '26px', '30px'],
  ['3xl', '34px', '34px'],
] as const;

const LADDER_STEPS = EXPECTED_LADDER.map(([step]) => step);
const TRACKING_TOKENS = ['tight', 'label', 'display'] as const;
const WEIGHT_TOKENS = ['normal', 'medium', 'semibold', 'bold'] as const;
const ALLOWED_WEIGHT_VALUES = new Set([400, 500, 600, 700]);

/** The six duplicate role tokens retired in favour of the numeric ladder. */
const RETIRED_ROLE_TOKENS = ['display', 'title', 'section', 'body', 'small', 'caption'] as const;

const COMMENT_PATTERNS = [/\/\*[\s\S]*?\*\//g, /<!--[\s\S]*?-->/g];

/* Near-steps that must never appear (`text-2xs`) plus the retired role names
   used as utilities. Deliberately narrow so it cannot flag colour utilities
   such as text-primary or text-muted. */
const RETIRED_SIZE_UTILITY_RE =
  /(?<![\w-])text-(2xs|3xs|2sm|3sm|xs2|sm2|small|body|section|title|display|huge|tiny)(?![\w-])/g;

function maskComments(text: string): string {
  return COMMENT_PATTERNS.reduce((masked, pattern) => masked.replace(pattern, ''), text);
}

/** Source files under src/, excluding tests (they quote the banned forms). */
function sourceFiles(): string[] {
  const root = join(import.meta.dirname, '..', '..');
  const files: string[] = [];
  (function walk(directory: string): void {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      const relative = join(directory, entry.name);
      if (entry.isDirectory()) walk(relative);
      else if (/\.(vue|ts|css)$/.test(entry.name) && !entry.name.endsWith('.test.ts')) {
        files.push(relative);
      }
    }
  })('.');
  return files.sort();
}

function offenders(paths: string[], matches: (masked: string) => RegExpMatchArray[]): string[] {
  const found: string[] = [];
  for (const path of paths) {
    const masked = maskComments(readFileSync(join(import.meta.dirname, '..', '..', path), 'utf8'));
    for (const match of matches(masked)) {
      found.push(`${path}: ${match[0].trim()}`);
    }
  }
  return found;
}

const SOURCE_FILES = sourceFiles();

describe('PBGui type ladder', () => {
  it('defines all ten steps at their contracted px values', () => {
    for (const [step, size] of EXPECTED_LADDER) {
      expect(styles, `--text-${step}: ${size}`).toContain(`--text-${step}: ${size};`);
    }
  });

  it('binds a px line height to every step, so text-* never inherits a rem one', () => {
    for (const [step, , lineHeight] of EXPECTED_LADDER) {
      expect(styles, `--text-${step}--line-height: ${lineHeight}`).toContain(
        `--text-${step}--line-height: ${lineHeight};`,
      );
    }
  });

  it('keeps the ladder strictly increasing, top of scale included', () => {
    const steps = EXPECTED_LADDER.map(([step, size]) => ({ step, size: Number.parseFloat(size) }));
    for (let index = 1; index < steps.length; index += 1) {
      const previous = steps[index - 1]!;
      const current = steps[index]!;
      expect(current.size, `${current.step} must exceed ${previous.step}`).toBeGreaterThan(previous.size);
    }
    /* Tailwind's own 4xl/5xl rem defaults resolved to 33.75/45px against the
       15px root, i.e. below the 34px 3xl; they are pinned so they cannot
       reappear non-monotonic. */
    expect(styles).toContain('--text-4xl: 42px;');
    expect(styles).toContain('--text-5xl: 52px;');
  });

  it('keeps exactly three tracking values', () => {
    for (const token of TRACKING_TOKENS) {
      expect(styles, `--tracking-${token}`).toMatch(new RegExp(`--tracking-${token}: -?[\\d.]+em;`));
    }
  });

  it('does not reintroduce the six retired role tokens', () => {
    for (const token of RETIRED_ROLE_TOKENS) {
      expect(styles, `--text-${token} was folded into the numeric ladder`).not.toMatch(
        new RegExp(`--text-${token}\\s*:`),
      );
    }
  });

  it('keeps the offline typeface guarantee', () => {
    expect(styles).toContain("src: url('/app/vendor/fonts/space-grotesk-var.woff2') format('woff2');");
    expect(styles).not.toMatch(/https?:\/\//);
  });
});

describe('no font size leaves the ladder', () => {
  it('never sets an absolute px/rem font-size outside the token layer', () => {
    /* The token layer writes sizes as `--text-<step>` declarations, so a
       `font-size:` declaration anywhere means a page bypassed the ladder.
       `em` (relative to its own context) and `clamp()` (intentionally fluid)
       are the two documented escapes. */
    const found = offenders(SOURCE_FILES, (masked) =>
      [...masked.matchAll(/font-size\s*:\s*[\d.]+(?:px|rem)\b/g)],
    );
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });

  it('never writes an arbitrary text-[<size>] utility', () => {
    const found = offenders(SOURCE_FILES, (masked) =>
      [...masked.matchAll(/(?<![\w-])text-\[[\d.]+(?:px|rem)\](?![\w-])/g)],
    );
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });

  it('uses only ladder steps in text-* utilities', () => {
    const allowed = new Set([...LADDER_STEPS, '4xl', '5xl']);
    const found = offenders(SOURCE_FILES, (masked) => {
      const hits: RegExpMatchArray[] = [];
      /* Colour utilities (text-primary, text-muted, …) share the `text-`
         prefix, so only bracket-free numeric-looking steps are checked:
         anything Tailwind resolves from --text-* must be a ladder name. */
      for (const match of masked.matchAll(RETIRED_SIZE_UTILITY_RE)) {
        if (!allowed.has(match[1] as string)) hits.push(match);
      }
      return hits;
    });
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });
});

describe('tracking and weight contracts', () => {
  it('never writes an arbitrary tracking-[...] utility', () => {
    const found = offenders(SOURCE_FILES, (masked) => [
      ...masked.matchAll(/(?<![\w-])tracking-\[[^\]]+\]/g),
    ]);
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });

  it('uses only the three tracking tokens plus an explicit normal reset', () => {
    const allowed = new Set<string>([...TRACKING_TOKENS, 'normal']);
    const found = offenders(SOURCE_FILES, (masked) => {
      const hits: RegExpMatchArray[] = [];
      for (const match of masked.matchAll(/(?<![\w-])tracking-([a-z][a-z-]*)(?![\w-])/g)) {
        if (!allowed.has(match[1] as string)) hits.push(match);
      }
      return hits;
    });
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });

  it('uses only the four weight utilities', () => {
    const allowed = new Set<string>(WEIGHT_TOKENS);
    const found = offenders(SOURCE_FILES, (masked) => {
      const hits: RegExpMatchArray[] = [];
      for (const match of masked.matchAll(
        /(?<![\w-])font-(thin|extralight|light|extrabold|black|heavy|ultra)(?![\w-])/g,
      )) {
        if (!allowed.has(match[1] as string)) hits.push(match);
      }
      return hits;
    });
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });

  it('never sets a numeric font-weight outside 400/500/600/700', () => {
    /* 650/750/550/800 rendered as faux-bold on the static CJK fallback faces
       (PingFang SC, Microsoft YaHei) even though Space Grotesk is variable.
       `bold`/`normal` keywords are fine (700/400). A multi-number value is the
       @font-face variable range, not a weight. The digit is required inside
       the capture so a keyword value cannot match as whitespace. */
    const found = offenders(SOURCE_FILES, (masked) => {
      const hits: RegExpMatchArray[] = [];
      for (const match of masked.matchAll(/font-weight\s*:\s*([\d\s]*\d[\d\s]*)/g)) {
        const numbers = match[1]!.trim().split(/\s+/);
        if (numbers.length > 1) continue;
        if (!ALLOWED_WEIGHT_VALUES.has(Number(numbers[0]))) hits.push(match);
      }
      return hits;
    });
    expect(found, found.slice(0, 12).join('\n')).toEqual([]);
  });
});
