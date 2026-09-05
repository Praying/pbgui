import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Container, type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

/* The former backtest-shell.css was deleted at the Tailwind migration:
   everything expressible as utilities moved onto the templates, and the
   rules that must stay CSS (the shared editor-form contract, the .tbl
   row states, the container queries and their @supports fallback, the
   pseudo-elements and the root chrome) live in App.vue's unscoped
   <style> block. These contracts pin that block — the template anchors
   that replaced the rest are checked against the components. */

const pageRoot = import.meta.dirname;

const appVue = readFileSync(resolve(pageRoot, 'App.vue'), 'utf8');
const css = appVue.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? '';
const root = postcss.parse(css);
const sharedCss = readFileSync(resolve(pageRoot, '../../styles/tailwind.css'), 'utf8');

function readComponent(name: string): string {
  return readFileSync(resolve(pageRoot, 'components', name), 'utf8');
}

const legacyPanel = readComponent('LegacyPanel.vue');
const archivePanel = readComponent('ArchivePanel.vue');

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

/** All rules with the given selector (later duplicates override earlier). */
function findRules(container: Container, selector: string): Rule[] {
  const matches: Rule[] = [];
  container.walkRules((rule) => {
    if (rule.selectors.map(normalize).includes(selector)) matches.push(rule);
  });
  expect(matches.length, `missing rule for ${selector}`).toBeGreaterThan(0);
  return matches;
}

function expectDeclaration(rule: Rule, property: string, value: string): void {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === 'decl' && node.prop === property,
  );
  expect(declaration?.value, `${rule.selector} should declare ${property}: ${value}`).toBe(value);
}

/** Regression contracts for the shared editor form contract + grids. */
describe('PBv7 config editor CSS contracts', () => {
  it('uses neutral shared elevation for Legacy and Archive fixed headers', () => {
    expect(legacyPanel).toContain('shadow-[var(--shadow-panel)]');
    expect(archivePanel).toContain('shadow-[var(--shadow-panel)]');
    expect(legacyPanel).not.toContain('shadow-[0_4px_12px_rgba(5,8,14,0.6)]');
    expect(archivePanel).not.toContain('shadow-[0_4px_12px_rgba(5,8,14,0.6)]');
  });

  it('uses the shared palette without a Backtest-wide color override', () => {
    expect(css).not.toContain(':root {');
    expect(css).not.toContain('#0b111b');
    expect(css).not.toContain('#141e2b');
    expect(css).not.toContain('#26364a');
    expect(css).not.toContain('#e7edf6');
    expect(css).toContain('color: var(--accent-contrast)');
    expect(css).toContain('background: var(--success)');
  });

  it('uses shared elevation for the active data-tip tooltip', () => {
    expectDeclaration(
      findRule(root, '#data-tip-tooltip'),
      'box-shadow',
      'var(--shadow-elevated)',
    );
    expect(css).not.toContain('rgba(5, 8, 14');
    expect(css).not.toContain('rgba(5,8,14');
  });

  it('keeps the shared frontend typography scale canonical', () => {
    expect(sharedCss).toContain('--text-xs: 12px;');
    expect(sharedCss).toContain('--text-sm: 14px;');
    expect(sharedCss).toContain('--text-base: 15px;');
    expect(sharedCss).toContain('--text-md: 16px;');
    expect(sharedCss).toContain('--text-lg: 19px;');
    expect(sharedCss).toContain('--text-xl: 23px;');
    expect(sharedCss).toContain('--text-display: 34px;');
    expect(sharedCss).toContain('--text-title: 26px;');
    expect(sharedCss).toContain('--text-section: 19px;');
    expect(sharedCss).toContain('--text-body: 15px;');
    expect(sharedCss).toContain('--text-small: 14px;');
    expect(sharedCss).toContain('--text-caption: 12px;');
  });

  it('uses the shared typography scale across the backtest page', () => {
    expect(css).not.toContain('.core-workbench-shell--backtest {');
    expectDeclaration(findRule(root, '.core-workbench-shell--backtest #configs-editor .config-editor-intro h1'), 'font-size', 'clamp(var(--text-title), 2.6vw, var(--text-display))');
    expectDeclaration(findRule(root, '.core-workbench-shell--backtest #configs-editor .config-editor-section header h2'), 'font-size', 'var(--text-section)');
    expectDeclaration(findRule(root, '#configs-editor .form-group > label'), 'font-size', '12px');
    expectDeclaration(findRule(root, '.core-workbench-shell--backtest .ms-clear-btn'), 'font-size', '12px');
    expectDeclaration(findRule(root, '.core-workbench-shell--backtest .ms-tag .ms-x'), 'font-size', '12px');
  });

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
    expect(css).toContain('.config-editor-12');
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('.act-btn');
    expect(css).toContain('.form-group');
    expect(css).toContain('.tbl');
  });

  it('ties the editor-width rules to the container queries', () => {
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

  it('wraps rendered editor labels and keeps the editor container contract', () => {
    const labels = findRule(root, '#configs-editor .form-group > label');
    expectDeclaration(labels, 'min-width', '0');
    expectDeclaration(labels, 'overflow-wrap', 'anywhere');
    expectDeclaration(labels, 'word-break', 'normal');

    expectDeclaration(findRule(root, '#configs-editor .bot-json-expander'), 'margin-bottom', '0');
    expectDeclaration(findRule(root, '#configs-editor .bot-json-expander.error'), 'border-color', 'rgb(var(--warning-rgb) / 0.38)');

    /* The editor container itself is template utilities now — the named
       containment context must survive as arbitrary properties. */
    const editor = readComponent('BacktestConfigEditor.vue');
    expect(editor).toContain('[container-type:inline-size]');
    expect(editor).toContain('[container-name:backtest-editor]');
    expect(editor).toContain('config-editor-grid');
    expect(editor).toContain('config-editor-12');
    expect(editor).toContain('config-editor-trading-primary');
    expect(editor).toContain('config-editor-trading-advanced');

    expect(css).not.toContain('.field-label');
    expect(css).not.toContain('.bot-side-panel > h3');
  });

  it('keeps the table row-state group shared with CoinOverridesPanel', () => {
    expectDeclaration(findRule(root, '.tbl'), 'user-select', 'none');
    expectDeclaration(findRule(root, '.tbl tr:hover td'), 'background', 'rgba(255,255,255,.03)');
    expectDeclaration(findRule(root, '.tbl tr.selected td'), 'background', 'rgb(var(--accent-rgb) / .12)');
    expectDeclaration(findRule(root, '.tbl tr.selected td:first-child'), 'border-left', '3px solid var(--accent)');
  });

  it('keeps the shell scroll-release and panel pin-state rules', () => {
    expectDeclaration(findRule(root, '.workbench-page-content:has(#panel-results.active.unpinned)'), 'overflow-y', 'auto');
    expectDeclaration(findRule(root, '.workbench-page-content:has(#configs-editor)'), 'overflow-y', 'auto');
    /* #panel-configs.active:has(#configs-editor) arrives as two rules —
       the min-width reset, then the display/flex/height/overflow release. */
    const configsRules = findRules(root, '#panel-configs.active:has(#configs-editor)');
    const merged = configsRules.flatMap((rule) => rule.nodes ?? []);
    const overflow = merged.find(
      (node): node is Declaration => node.type === 'decl' && node.prop === 'overflow',
    );
    expect(overflow?.value).toBe('visible');
    expectDeclaration(findRule(root, '#panel-results.active.unpinned'), 'flex', 'none');
    expectDeclaration(findRule(root, '#panel-results.unpinned #results-scroll-area'), 'overflow-y', 'visible');
    expectDeclaration(findRule(root, '#panel-archive.active.arc-unpinned'), 'flex', 'none');
    expectDeclaration(findRule(root, '#panel-legacy.active.leg-unpinned'), 'flex', 'none');
  });
});

describe('results panel flex chain', () => {
  it('keeps the results wrapper as the viewport-height flex owner', () => {
    // The results table now owns the available height. Reports are opened in
    // a dialog, so the wrapper can safely be an explicit flex column.
    const resultsPanel = readComponent('ResultsPanel.vue');
    expect(resultsPanel).toContain('results-panel-root');
    expect(resultsPanel).toContain('flex min-h-0 min-w-0 flex-1 flex-col');
    expect(resultsPanel).toContain('relative min-h-36 flex-1 overflow-auto');
    expect(resultsPanel).not.toContain('h-[clamp(220px,34dvh,400px)]');
    expect(resultsPanel).not.toContain('results-panel-root contents');
  });
});

describe('migrated template anchors', () => {
  it('keeps the bot panel hooks the tests select', () => {
    const bot = readComponent('BotSideEditor.vue');
    expect(bot).toContain('bot-side-head');
    expect(bot).toContain('bot-side-title');
    expect(bot).toContain('bot-side-primary');
    expect(bot).toContain('border-t-success');
    expect(bot).toContain('border-t-danger');
  });

  it('keeps the modal button and pull-progress anchors', () => {
    const uiClasses = readFileSync(resolve(pageRoot, 'lib', 'uiClasses.ts'), 'utf8');
    expect(uiClasses).toContain('modal-btn');
    const gitModals = readComponent('ArchiveGitModals.vue');
    expect(gitModals).toContain('archive-pull-modal');
    expect(gitModals).toContain('archive-pull-spinner');
    expect(gitModals).toContain('archive-pull-bar');
  });
});
