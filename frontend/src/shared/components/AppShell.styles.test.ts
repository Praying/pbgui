import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type Container, type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

/**
 * Height-chain contract for fixed-height workbench pages
 * (.core-workbench-shell). The chain must stay unbroken:
 *
 *   .app-shell (100dvh) → __workspace → __main → __primary
 *   → #page-body → the page's own overflow container.
 *
 * If `.app-shell__main` stops being a flex container (a past copy of
 * these overrides said `display: block`), `.app-shell__primary` grows
 * to content height, nothing ever overflows the page's scroll
 * container, and pages silently clip instead of scrolling.
 */
const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8');
const stylesheet_root = postcss.parse(stylesheet);

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function find_exact_rule(container: Container, selector: string): Rule {
  let matching_rule: Rule | undefined;

  container.walkRules((rule) => {
    if (!matching_rule && normalize(rule.selector) === selector) matching_rule = rule;
  });

  expect(matching_rule, `missing rule for ${selector}`).toBeDefined();
  return matching_rule as Rule;
}

function expect_declaration(rule: Rule, property: string, value: string): void {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === 'decl' && node.prop === property,
  );

  expect(declaration?.value, `${rule.selector} should declare ${property}: ${value}`).toBe(value);
}

describe('AppShell core-workbench-shell height chain', () => {
  it('keeps shared shell surfaces on the engineering material hierarchy', () => {
    const header = find_exact_rule(stylesheet_root, '.workspace-header');
    const state_surfaces = find_exact_rule(
      stylesheet_root,
      '.pbgui-empty-state, .pbgui-error-state',
    );

    expect_declaration(header, 'background', 'var(--surface-workspace)');
    expect_declaration(header, 'box-shadow', '0 1px 0 rgb(224 241 255 / 0.06) inset');
    expect_declaration(state_surfaces, 'background', 'var(--surface-panel)');
    expect_declaration(state_surfaces, 'box-shadow', 'var(--shadow-panel)');
  });

  it('pins the shell to the viewport', () => {
    const shell = find_exact_rule(stylesheet_root, '.core-workbench-shell');
    expect_declaration(shell, 'height', '100dvh');
    expect_declaration(shell, 'min-height', '0');
  });

  it('keeps .app-shell__main a flex container so page scroll containers can overflow', () => {
    const main = find_exact_rule(stylesheet_root, '.core-workbench-shell .app-shell__main');
    expect_declaration(main, 'display', 'flex');
    expect_declaration(main, 'flex-direction', 'column');
    expect_declaration(main, 'flex', '1');
    expect_declaration(main, 'width', '100%');
    expect_declaration(main, 'min-height', '0');
    expect_declaration(main, 'overflow', 'hidden');
  });

  it('constrains .app-shell__primary so #page-body inherits the viewport height', () => {
    const primary = find_exact_rule(stylesheet_root, '.core-workbench-shell .app-shell__primary');
    expect_declaration(primary, 'flex', '1');
  });

  it('threads flex: 1 down to #page-body', () => {
    const page_body = find_exact_rule(stylesheet_root, '.core-workbench-shell #page-body');
    expect_declaration(page_body, 'flex', '1');
    expect_declaration(page_body, 'height', 'auto');
  });

  it('stays single-sourced: page stylesheets must not re-declare the shell overrides', () => {
    // These used to carry seven drifting copies of this block (one said
    // display: block — the scrolling bug). components.css is the only source.
    const page_sheets = [
      'src/pages/v7_pareto_explorer/styles/pareto-base.css',
      'src/pages/v7_strategy_explorer/styles/explorer.css',
      'src/pages/v7_edit/styles/v7-edit.css',
      'src/pages/v7_optimize/styles/optimize.css',
      'src/pages/v7_run/styles/v7-run.css',
      'src/pages/v7_backtest/styles/backtest-shell.css',
      'src/pages/welcome/styles/welcome.css',
    ];
    for (const sheet of page_sheets) {
      /* Migrated pages delete their stylesheet outright — skip the ones
         that no longer exist; the guard still covers every survivor. */
      if (!existsSync(resolve(process.cwd(), sheet))) continue;
      const css = readFileSync(resolve(process.cwd(), sheet), 'utf8');
      expect(
        css.includes('core-workbench-shell'),
        `${sheet} must not style .core-workbench-shell (single source: components.css)`,
      ).toBe(false);
    }
  });
});
