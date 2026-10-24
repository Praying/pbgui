import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The motion and density scales are contracts, not conventions: component
 * CSS and several hundred page utilities both resolve through them, so a
 * renamed or missing step silently degrades to `transition: none` (an
 * undefined var() in a transition shorthand makes the whole declaration
 * invalid). These tests pin the five durations, the named curves, and the
 * two density geometries.
 */
const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/tailwind.css'), 'utf8');

function declaration(name: string): string | undefined {
  return stylesheet.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('motion scale', () => {
  it('defines all five durations in ascending order', () => {
    const steps = ['fast', 'snap', 'base', 'sheet', 'slow'].map((step) =>
      Number.parseInt(declaration(`--transition-duration-${step}`) ?? '', 10),
    );

    expect(steps).toEqual([60, 120, 200, 300, 450]);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('defines the named easing curves', () => {
    for (const curve of ['standard', 'spring', 'out', 'snap', 'overshoot']) {
      expect(declaration(`--ease-${curve}`)).toMatch(/^cubic-bezier\(/);
    }
  });

  it('routes the legacy motion aliases onto the new scale', () => {
    expect(declaration('--motion-fast')).toBe('var(--transition-duration-snap)');
    expect(declaration('--motion-normal')).toBe('var(--transition-duration-base)');
    expect(declaration('--motion-slow')).toBe('var(--transition-duration-sheet)');
  });

  it('never collapses reduced motion to a removed state change', () => {
    const reduced = stylesheet.slice(stylesheet.indexOf('prefers-reduced-motion: reduce'));
    // Duration collapses; the declaration must not disable transitions
    // outright, which would skip the final frame instead of landing on it.
    expect(reduced).toContain('transition-duration: 0.01ms !important');
    expect(reduced).not.toContain('transition: none');
    expect(reduced).not.toContain('animation: none');
  });
});

describe('density scale', () => {
  const densityBlock = stylesheet.slice(stylesheet.indexOf("[data-density='compact']"));

  it('defines the comfortable geometry as the root default', () => {
    expect(declaration('--control-height-sm')).toBe('28px');
    expect(declaration('--control-height-md')).toBe('32px');
    expect(declaration('--control-height-lg')).toBe('38px');
  });

  it('shrinks controls by one step when compact', () => {
    const compact = densityBlock.match(/\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(compact).toContain('--control-height-sm: 24px;');
    expect(compact).toContain('--control-height-md: 28px;');
    expect(compact).toContain('--control-height-lg: 32px;');
  });

  it('keeps the 30px / 34px between-step sizes the dense editors rely on', () => {
    expect(declaration('--control-height-sm-plus')).toBe('30px');
    expect(declaration('--control-height-md-plus')).toBe('34px');
    const compact = densityBlock.match(/\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(compact).toContain('--control-height-sm-plus: 26px;');
    expect(compact).toContain('--control-height-md-plus: 30px;');
  });

  it('keeps the comfortable hit area on coarse pointers', () => {
    const coarse = stylesheet.slice(stylesheet.indexOf('@media (pointer: coarse)'));
    expect(coarse).toContain("--control-height-md: 32px;");
  });
});

describe('radius scale', () => {
  it('pins --radius-xs to px rather than a rem default', () => {
    // The 15px root makes Tailwind's 0.125rem default resolve to 1.875px,
    // breaking monotonicity against --radius-sm (4px).
    expect(declaration('--radius-xs')).toBe('2px');
  });
});

describe('theme channels keep the dark rendering identical', () => {
  it('defaults the shadow, highlight and overlay channels to the literals the CSS used before', () => {
    // The old rules were `rgb(255 255 255 / a)` highlights/washes and near-black
    // shadows. Routing them through variables only preserves dark if the
    // defaults equal those literals.
    expect(declaration('--highlight-rgb')).toBe('255 255 255');
    expect(declaration('--overlay-rgb')).toBe('255 255 255');
    expect(declaration('--shadow-rgb')).toBe('0 0 0');
  });

  it('swaps all three channels under the light theme', () => {
    const light = stylesheet.slice(stylesheet.indexOf("[data-theme='light'] {"));
    const block = light.slice(0, light.indexOf('\n}\n'));
    expect(block).toContain('--shadow-rgb: 20 24 31;');
    expect(block).toContain('--overlay-rgb: 20 22 26;');
    expect(block).toContain('color-scheme: light;');
  });
});

describe('control boundary token', () => {
  const lin = (c: number): number => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (hex: string): number => {
    const n = (i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    return 0.2126 * lin(n(0)) + 0.7152 * lin(n(1)) + 0.0722 * lin(n(2));
  };
  const ratio = (a: string, b: string): number => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const block = (start: string): string => {
    const i = stylesheet.indexOf(start);
    return stylesheet.slice(i, stylesheet.indexOf('\n}', i));
  };
  const value = (css: string, name: string): string => css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))![1]!;

  it('keeps a control outline at >=3:1 against its input surface in both themes (WCAG 1.4.11)', () => {
    const dark = block('@theme {');
    const light = block("[data-theme='light'] {");
    expect(ratio(value(dark, '--color-border-control'), value(dark, '--color-input'))).toBeGreaterThanOrEqual(3);
    expect(ratio(value(light, '--color-border-control'), value(light, '--color-input'))).toBeGreaterThanOrEqual(3);
  });

  it('is used by every interactive ui/ control instead of the decorative card hairline', () => {
    for (const rel of ['input/Input.vue', 'textarea/Textarea.vue', 'select/SelectTrigger.vue', 'checkbox/Checkbox.vue', 'radio-group/RadioItem.vue', 'switch/Switch.vue']) {
      const src = readFileSync(resolve(process.cwd(), 'src/shared/components/ui', rel), 'utf8');
      expect(src, rel).toContain('border-border-control');
    }
  });
});
