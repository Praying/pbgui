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

function find_exact_rules(container: Container, selector: string): Rule[] {
  const matching_rules: Rule[] = [];

  container.walkRules((rule) => {
    if (normalize(rule.selector) === selector) matching_rules.push(rule);
  });

  return matching_rules;
}

function expect_declaration(rule: Rule, property: string, value: string): void {
  const declaration = rule.nodes?.find(
    (node): node is Declaration => node.type === 'decl' && node.prop === property,
  );

  expect(declaration?.value, `${rule.selector} should declare ${property}: ${value}`).toBe(value);
}

function get_declaration(rule: Rule, property: string): Declaration | undefined {
  return rule.nodes?.find(
    (node): node is Declaration => node.type === 'decl' && node.prop === property,
  );
}

function get_source_line(rule: Rule): number {
  return rule.source?.start?.line ?? -1;
}

describe('WorkbenchRail responsive CSS contracts', () => {
  it('defines the engineering surface elevation and motion fallback', () => {
    expect(stylesheet).toContain('var(--shadow-panel)');
    expect(stylesheet).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(stylesheet).toContain('.workbench-rail--floating-expanded');
  });

  it('keeps compact rail controls available without changing the shell grid', () => {
    const rail = find_exact_rule(stylesheet_root, '.workbench-rail');
    const collapsed_controls = find_exact_rule(
      stylesheet_root,
      '.workbench-rail--collapsed .workbench-rail__item, .workbench-rail--collapsed .workbench-rail__ai-btn',
    );
    const floating_rail = find_exact_rule(stylesheet_root, '.workbench-rail--floating-expanded');

    expect_declaration(collapsed_controls, 'min-width', 'var(--rail-collapsed-width)');
    expect_declaration(collapsed_controls, 'justify-content', 'center');
    expect_declaration(floating_rail, 'position', 'fixed');
    expect_declaration(floating_rail, 'width', 'var(--rail-expanded-width)');
    expect(get_declaration(rail, 'transition')).toBeUndefined();
    expect(get_declaration(floating_rail, 'transition')).toBeUndefined();
  });

  it('does not animate the app shell grid columns', () => {
    const app_shell = find_exact_rule(stylesheet_root, '.app-shell');
    const rail_slot = find_exact_rule(stylesheet_root, '.app-shell__rail-slot');
    const workspace = find_exact_rule(stylesheet_root, '.app-shell__workspace');
    const transition = get_declaration(app_shell, 'transition');

    expect_declaration(
      app_shell,
      'grid-template-columns',
      'var(--rail-collapsed-width) minmax(0, 1fr)',
    );
    expect_declaration(rail_slot, 'grid-column', '1');
    expect_declaration(rail_slot, 'width', 'var(--rail-collapsed-width)');
    expect_declaration(workspace, 'grid-column', '2');
    expect(transition?.value ?? '').not.toContain('grid-template-columns');
  });

  it('defines shared panel and icon-button interaction states', () => {
    const shared_material_rules = find_exact_rules(
      stylesheet_root,
      '.panel, #main-content .pbgui-panel, .page-toolbar, .pbgui-status-strip',
    );
    const generic_panel_rule = find_exact_rule(stylesheet_root, '.panel');
    const specific_panel_rule = find_exact_rule(stylesheet_root, '#main-content .pbgui-panel');
    const shared_material_rule = shared_material_rules.at(-1);
    const icon_button_focus = find_exact_rule(
      stylesheet_root,
      '.pbgui-icon-button:focus-visible, .workbench-rail__item:focus-visible, .workbench-rail__ai-btn:focus-visible',
    );
    const icon_button_pressed = find_exact_rule(
      stylesheet_root,
      '.workbench-rail__item:not(.workbench-rail__item--disabled):active, .workbench-rail__ai-btn:active:not(:disabled), .pbgui-icon-button:active:not(:disabled)',
    );
    const icon_button_base = find_exact_rule(
      stylesheet_root,
      'button.pbgui-icon-button.pbgui-icon-button',
    );

    expect(shared_material_rules).toHaveLength(1);
    expect(shared_material_rule).toBeDefined();
    expect(get_source_line(shared_material_rule!)).toBeGreaterThan(
      get_source_line(generic_panel_rule),
    );
    expect(get_source_line(shared_material_rule!)).toBeGreaterThan(
      get_source_line(specific_panel_rule),
    );
    expect_declaration(shared_material_rule!, 'border-color', 'var(--border-default)');
    expect_declaration(shared_material_rule!, 'background', 'var(--surface-panel)');
    expect_declaration(shared_material_rule!, 'box-shadow', 'var(--shadow-panel)');
    expect_declaration(icon_button_focus, 'outline', 'none');
    expect_declaration(icon_button_focus, 'box-shadow', 'var(--focus-ring)');
    expect_declaration(icon_button_pressed, 'transform', 'scale(0.98)');
    expect(get_declaration(icon_button_base, 'transition')?.value).toContain(
      'transform var(--motion-fast) var(--ease-spring)',
    );
    expect(stylesheet).toContain('box-shadow: var(--shadow-panel)');
  });

  it('keeps the collapsed mobile toggle in the visible brand row', () => {
    const mobile_rules = find_at_rule(stylesheet_root, 'media', '(max-width: 720px)');
    const mobile_rail_slot = find_exact_rule(mobile_rules, '.app-shell__rail-slot');
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

    expect_declaration(mobile_rail_slot, 'width', '100%');
    expect_declaration(mobile_rail_slot, 'height', '64px');
    expect_declaration(mobile_rail, 'position', 'relative');
    expect_declaration(collapsed_rail, 'max-height', '64px');
    expect_declaration(collapsed_rail, 'flex-direction', 'row');
    expect_declaration(collapsed_rail, 'align-items', 'center');
    expect_declaration(collapsed_brand, 'flex', '1');
    expect_declaration(collapsed_brand, 'min-width', '0');
    expect_declaration(collapsed_groups, 'display', 'none');
    expect_declaration(collapsed_toggle, 'align-self', 'center');
    /* The mobile collapsed bar spans the viewport; the lone toggle pins to
       its trailing edge (auto margin beats the desktop rule's centered
       justify-content) instead of floating mid-screen. */
    expect_declaration(collapsed_toggle, 'margin-left', 'auto');
    const mobile_overlay = find_exact_rule(
      mobile_rules,
      '.workbench-rail--floating-expanded',
    );
    expect_declaration(mobile_overlay, 'overscroll-behavior', 'contain');
    const mobile_backdrop = find_exact_rule(
      mobile_rules,
      '.app-shell:has(.workbench-rail--floating-expanded)::after',
    );
    expect_declaration(mobile_backdrop, 'position', 'fixed');
    expect_declaration(mobile_backdrop, 'inset', '0');
    expect(mobile_rules.toString()).not.toMatch(
      /\.app-shell--rail-collapsed\s+\.app-shell__workspace\s*\{[^}]*padding-top/s,
    );
  });
});
