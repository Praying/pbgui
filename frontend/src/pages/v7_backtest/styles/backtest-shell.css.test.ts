import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/pages/v7_backtest/styles/backtest-shell.css'), 'utf8');

/** Regression contracts for the migrated PBv7 config editor stylesheet. */
describe('PBv7 config editor CSS contracts', () => {
  it('keeps the compact grid, multiselect, stepper, expander and raw JSON surfaces', () => {
    expect(css).toContain('.cols-8');
    expect(css).toContain('grid-template-columns: repeat(8, minmax(0, 1fr))');
    expect(css).toContain('.span-4');
    expect(css).toContain('.cols-3');
    expect(css).toContain('.ms-wrap');
    expect(css).toContain('position: relative');
    expect(css).toContain('.ms-dropdown');
    expect(css).toContain('display: none');
    expect(css).toContain('.ms-dropdown.open');
    expect(css).toContain('display: block');
    expect(css).toContain('.ms-tag');
    expect(css).toContain('.num-stepper');
    expect(css).toContain('.stepper-btn');
    expect(css).toContain('.expander.open .expander-body');
    expect(css).toContain('.raw-json-wrap');
    expect(css).toContain('.section-title');
  });
});
