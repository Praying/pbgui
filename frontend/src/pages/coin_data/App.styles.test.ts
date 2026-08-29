import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = resolve(import.meta.dirname);
const pageSource = readFileSync(resolve(pageRoot, 'App.vue'), 'utf8');
const symbolTableSource = readFileSync(resolve(pageRoot, 'components/SymbolTable.vue'), 'utf8');
const filtersPanelSource = readFileSync(resolve(pageRoot, 'components/FiltersPanel.vue'), 'utf8');
const tagMultiselectSource = readFileSync(resolve(pageRoot, 'components/TagMultiselect.vue'), 'utf8');

describe('Coin Data visual role contract', () => {
  it('derives page-local roles from canonical shared aliases', () => {
    expect(pageSource).toContain('--coin-page: var(--surface-page);');
    expect(pageSource).toContain('--coin-workspace: var(--surface-workspace);');
    expect(pageSource).toContain('--coin-control: var(--surface-panel);');
    expect(pageSource).toContain('--coin-data: var(--surface-panel);');
    expect(pageSource).toContain('--coin-header: var(--surface-card);');
    expect(pageSource).toContain('--coin-input: var(--bg-input);');
    expect(pageSource).toContain('--coin-border: var(--border-subtle);');
    expect(pageSource).toContain('--coin-border-strong: var(--border-default);');
  });

  it('keeps the workspace header on the shared workspace surface', () => {
    expect(pageSource).toContain('background: var(--surface-workspace);');
    expect(pageSource).not.toContain('linear-gradient(180deg, var(--color-deep)');
  });

  it('uses the shared panel elevation token', () => {
    expect(pageSource).toContain('box-shadow: var(--shadow-panel);');
    expect(filtersPanelSource).toContain('box-shadow: var(--shadow-panel);');
  });

  it('maps row hover and selection to accent channels', () => {
    expect(pageSource).toContain('--coin-row-hover: rgb(var(--accent-rgb) / 0.055);');
    expect(pageSource).toContain('--coin-row-selected: var(--accent-bg);');
    expect(symbolTableSource).toContain('background: var(--coin-row-hover);');
    expect(symbolTableSource).toContain('background: var(--coin-row-selected);');
    expect(symbolTableSource).toContain('box-shadow: inset 3px 0 0 var(--accent);');
  });

  it('uses the shared accent background token for local highlights', () => {
    expect(pageSource).toContain(
      '.coin-data-sort-pill {\n  border-color: var(--coin-border);\n  background: var(--accent-bg);'
    );
    expect(filtersPanelSource).toContain('background: var(--accent-bg);');
    expect(tagMultiselectSource).toContain('background: var(--accent-bg);');
    expect(symbolTableSource).toContain('background: var(--surface-card);');
  });

  it('maps table header and cell borders to the page border role', () => {
    expect(symbolTableSource).toContain(
      '.coin-table-header {\n  border-color: var(--coin-border);\n  background: var(--coin-header);\n}'
    );
    expect(symbolTableSource).toContain(
      '.coin-table-cell {\n  border-color: var(--coin-border);\n}'
    );
  });

  it('inherits the shared font while retaining the page overflow lock', () => {
    expect(pageSource).toContain('overflow: hidden;');
    expect(pageSource).not.toContain("font-family: 'Segoe UI'");
  });

  it('does not retain legacy blue surface, accent, or effect literals', () => {
    const source = pageSource + symbolTableSource + filtersPanelSource + tagMultiselectSource;
    const legacyLiterals = [
      '#0d151e',
      '#111c27',
      '#1a2a38',
      '#203344',
      '#263b4d',
      'rgb(2 8 14',
      'rgb(224 241 255',
      'rgb(155 191 255',
    ];

    for (const legacyLiteral of legacyLiterals) {
      expect(source).not.toContain(legacyLiteral);
    }
  });
});
