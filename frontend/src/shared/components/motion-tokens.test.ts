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
