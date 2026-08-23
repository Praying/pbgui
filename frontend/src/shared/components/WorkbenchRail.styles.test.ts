import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postcss, { type AtRule, type Container, type Declaration, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8');
const stylesheet_root = postcss.parse(stylesheet);

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function find_at_rule(container: Container, name: string, params: string): AtRule {
  /* components.css lives inside `@layer components` since the Tailwind v4
     migration, so the @media blocks nest one level down — walk recursively
     instead of only scanning top-level nodes. */
  let matching_rule: AtRule | undefined;

  container.walkAtRules((rule) => {
    if (!matching_rule && rule.name === name && normalize(rule.params) === params) {
      matching_rule = rule;
    }
  });

  expect(matching_rule, `missing @${name} ${params}`).toBeDefined();
  return matching_rule as AtRule;
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

describe('WorkbenchRail responsive CSS contracts', () => {
  it('keeps the collapsed mobile toggle in the visible brand row', () => {
    const mobile_rules = find_at_rule(stylesheet_root, 'media', '(max-width: 720px)');
    const mobile_rail = find_exact_rule(
      mobile_rules,
      '.workbench-rail, .workbench-rail--collapsed',
    );
    const collapsed_rail = find_exact_rule(mobile_rules, '.workbench-rail--collapsed');
    const collapsed_brand = find_exact_rule(
      mobile_rules,
      '.workbench-rail--collapsed .workbench-rail__brand',
    );
    const collapsed_groups = find_exact_rule(
      mobile_rules,
      '.workbench-rail--collapsed .workbench-rail__groups',
    );
    const collapsed_toggle = find_exact_rule(
      mobile_rules,
      '.workbench-rail--collapsed .workbench-rail__toggle',
    );

    expect_declaration(mobile_rail, 'position', 'relative');
    expect_declaration(collapsed_rail, 'max-height', '64px');
    expect_declaration(collapsed_rail, 'flex-direction', 'row');
    expect_declaration(collapsed_rail, 'align-items', 'center');
    expect_declaration(collapsed_brand, 'flex', '1');
    expect_declaration(collapsed_brand, 'min-width', '0');
    expect_declaration(collapsed_groups, 'display', 'none');
    expect_declaration(collapsed_toggle, 'align-self', 'center');
    expect(mobile_rules.toString()).not.toMatch(
      /\.app-shell--rail-collapsed\s+\.app-shell__workspace\s*\{[^}]*padding-top/s,
    );
  });
});
