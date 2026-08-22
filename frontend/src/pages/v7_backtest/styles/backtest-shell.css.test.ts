import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Container, type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/pages/v7_backtest/styles/backtest-shell.css'), 'utf8');
const root = postcss.parse(css);

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function findAtRule(container: Container, name: string, params: string): AtRule {
  const match = container.nodes?.find(
    (node): node is AtRule => node.type === 'atrule' && node.name === name && normalize(node.params) === params,
  );
  expect(match, `missing @${name} ${params}`).toBeDefined();
  return match as AtRule;
}

function findRule(container: Container, selector: string): Rule {
  let match: Rule | undefined;
  container.walkRules((rule) => {
    if (!match && rule.selectors.map(normalize).includes(selector)) match = rule;
  });
  expect(match, `missing rule for ${selector}`).toBeDefined();
  return match as Rule;
}

function expectDeclaration(rule: Rule, property: string, value: string): void {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === 'decl' && node.prop === property,
  );
  expect(declaration?.value, `${rule.selector} should declare ${property}: ${value}`).toBe(value);
}

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
    expect(css).toContain('.config-editor-grid');
    expect(css).toContain('.config-editor-12');
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('.config-editor-section');
    expect(css).toContain('.config-editor-section-head');
    expect(css).toContain('.editor-nav-group');
    expect(css).toContain('.editor-save-group');
  });

  it('ties the editor container to medium and narrow responsive grids', () => {
    const editor = findRule(root, '#configs-editor');
    expectDeclaration(editor, 'container-type', 'inline-size');
    expectDeclaration(editor, 'container-name', 'backtest-editor');

    const medium = findAtRule(root, 'container', 'backtest-editor (min-width: 701px) and (max-width: 1180px)');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary'), 'grid-template-columns', 'repeat(3, minmax(0, 1fr))');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary > .editor-span-2'), 'grid-column', 'span 1');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary > .editor-span-12'), 'grid-column', 'span 3');
    expectDeclaration(findRule(medium, '.config-editor-trading-advanced > .editor-span-2'), 'grid-column', 'span 4');
    expectDeclaration(findRule(medium, '.config-editor-trading-advanced > .editor-span-4'), 'grid-column', 'span 4');

    const narrow = findAtRule(root, 'container', 'backtest-editor (max-width: 700px)');
    expectDeclaration(findRule(narrow, '.config-editor-12'), 'grid-template-columns', '1fr');
    expectDeclaration(findRule(narrow, '#configs-editor .cols-2'), 'grid-template-columns', '1fr');
    expectDeclaration(findRule(narrow, '.editor-span-2'), 'grid-column', 'span 1');
    expectDeclaration(findRule(narrow, '.bot-side-head'), 'flex-wrap', 'wrap');
  });

  it('mirrors the editor-width rules when container queries are unavailable', () => {
    const fallback = findAtRule(root, 'supports', 'not (container-type: inline-size)');
    const medium = findAtRule(fallback, 'media', '(min-width: 952px) and (max-width: 1460px)');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary'), 'grid-template-columns', 'repeat(3, minmax(0, 1fr))');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary > .editor-span-2'), 'grid-column', 'span 1');
    expectDeclaration(findRule(medium, '.config-editor-trading-primary > .editor-span-12'), 'grid-column', 'span 3');
    expectDeclaration(findRule(medium, '.config-editor-trading-advanced > .editor-span-2'), 'grid-column', 'span 4');
    expectDeclaration(findRule(medium, '.config-editor-trading-advanced > .editor-span-4'), 'grid-column', 'span 4');

    const narrow = findAtRule(fallback, 'media', '(max-width: 951px)');
    expectDeclaration(findRule(narrow, '.config-editor-12'), 'grid-template-columns', '1fr');
    expectDeclaration(findRule(narrow, '#configs-editor .cols-2'), 'grid-template-columns', '1fr');
    expectDeclaration(findRule(narrow, '.editor-span-2'), 'grid-column', 'span 1');
    expectDeclaration(findRule(narrow, '.bot-side-head'), 'flex-wrap', 'wrap');
  });

  it('wraps rendered editor labels and styles the approved bot panel hooks', () => {
    const labels = findRule(root, '#configs-editor .form-group > label');
    expectDeclaration(labels, 'min-width', '0');
    expectDeclaration(labels, 'overflow-wrap', 'anywhere');
    expectDeclaration(labels, 'word-break', 'normal');

    expectDeclaration(findRule(root, '.bot-side-panel'), 'min-width', '0');
    expectDeclaration(findRule(root, '.bot-side-panel.long'), 'border-top', '2px solid var(--green)');
    expectDeclaration(findRule(root, '.bot-side-panel.short'), 'border-top', '2px solid var(--red)');
    expectDeclaration(findRule(root, '.bot-side-head'), 'display', 'flex');
    expectDeclaration(findRule(root, '.bot-side-title'), 'display', 'flex');
    expectDeclaration(findRule(root, '.bot-side-direction'), 'font-weight', '700');
    expectDeclaration(findRule(root, '.bot-side-role'), 'letter-spacing', '0.12em');
    expectDeclaration(findRule(root, '.bot-json-review'), 'margin-left', 'auto');
    expectDeclaration(findRule(root, '#configs-editor .bot-side-primary'), 'margin-bottom', '10px');
    expectDeclaration(findRule(root, '#configs-editor .bot-json-expander'), 'margin-bottom', '0');
    expectDeclaration(findRule(root, '#configs-editor .bot-json-expander.error'), 'border-color', 'rgb(var(--warning-rgb) / 0.38)');

    expect(css).not.toContain('.field-label');
    expect(css).not.toContain('.bot-side-panel > h3');
  });
});
