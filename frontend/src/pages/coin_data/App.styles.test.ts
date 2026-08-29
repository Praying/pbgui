import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = resolve(import.meta.dirname);
const pageSource = readFileSync(resolve(pageRoot, 'App.vue'), 'utf8');
const symbolTableSource = readFileSync(resolve(pageRoot, 'components/SymbolTable.vue'), 'utf8');
const filtersPanelSource = readFileSync(resolve(pageRoot, 'components/FiltersPanel.vue'), 'utf8');

describe('Coin Data visual role contract', () => {
  it('derives page-local roles from canonical shared aliases', () => {
    expect(pageSource).toContain('--coin-page: var(--surface-page);');
    expect(pageSource).toContain('--coin-workspace: var(--surface-workspace);');
    expect(pageSource).toContain('--coin-control: var(--surface-card);');
    expect(pageSource).toContain('--coin-data: var(--surface-panel);');
    expect(pageSource).toContain('--coin-header: var(--color-deep);');
    expect(pageSource).toContain('--coin-input: var(--bg-input);');
    expect(pageSource).toContain('--coin-border: var(--border-subtle);');
    expect(pageSource).toContain('--coin-border-strong: var(--border-strong);');
  });

  it('uses the explicit deep token for the workspace header endpoint', () => {
    expect(pageSource).toContain(
      'background: linear-gradient(180deg, var(--color-deep), var(--coin-workspace));'
    );
  });

  it('keeps panel and filter elevation effects on neutral channels', () => {
    expect(pageSource).toContain('0 18px 34px rgb(0 0 0 / 0.2),');
    expect(pageSource).toContain('0 1px 0 rgb(255 255 255 / 0.045) inset;');
    expect(pageSource).toContain('box-shadow: 0 1px 0 rgb(255 255 255 / 0.035) inset;');
    expect(filtersPanelSource).toContain('0 14px 28px rgb(0 0 0 / 0.17),');
    expect(filtersPanelSource).toContain('0 1px 0 rgb(255 255 255 / 0.05) inset;');
  });

  it('maps row hover and selection to accent channels', () => {
    expect(pageSource).toContain('--coin-row-hover: rgb(var(--accent-rgb) / 0.055);');
    expect(pageSource).toContain('--coin-row-selected: rgb(var(--accent-rgb) / 0.11);');
    expect(symbolTableSource).toContain('background: var(--coin-row-hover);');
    expect(symbolTableSource).toContain('background: var(--coin-row-selected);');
    expect(symbolTableSource).toContain('box-shadow: inset 3px 0 0 var(--accent);');
  });

  it('keeps each accent background tied to its owning Coin Data rule', () => {
    expect(pageSource).toContain(
      '.coin-data-sort-pill {\n  border-color: var(--coin-border);\n  background: rgb(var(--accent-rgb) / 0.055);\n}'
    );
    expect(filtersPanelSource).toContain(
      '.coin-filter-pill {\n  border-color: var(--coin-border);\n  background: rgb(var(--accent-rgb) / 0.045);\n}'
    );
    expect(symbolTableSource).toContain(
      '.coin-table-empty > span:first-child {\n  border-color: var(--coin-border);\n  background: rgb(var(--accent-rgb) / 0.04);\n}'
    );
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
    const source = pageSource + symbolTableSource + filtersPanelSource;
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
