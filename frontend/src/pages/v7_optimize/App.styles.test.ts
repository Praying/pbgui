import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = import.meta.dirname;
const appSource = readFileSync(resolve(pageRoot, 'App.vue'), 'utf8');
const configsPanelSource = readFileSync(resolve(pageRoot, 'components/ConfigsPanel.vue'), 'utf8');
const listWrapSource = readFileSync(resolve(pageRoot, '../../shared/components/ui/table/ListWrap.vue'), 'utf8');
const tableSource = readFileSync(resolve(pageRoot, '../../shared/components/ui/table/Table.vue'), 'utf8');
const listFooterSource = readFileSync(resolve(pageRoot, '../../shared/components/ui/table/ListFooter.vue'), 'utf8');
const sharedComponentsSource = readFileSync(resolve(pageRoot, '../../styles/components.css'), 'utf8');
const queuePanelSource = readFileSync(resolve(pageRoot, 'components/QueuePanel.vue'), 'utf8');
const resultsPanelSource = readFileSync(resolve(pageRoot, 'components/ResultsPanel.vue'), 'utf8');
const paretosPanelSource = readFileSync(resolve(pageRoot, 'components/ParetosPanel.vue'), 'utf8');
const editorSource = readFileSync(resolve(pageRoot, 'components/BotJsonEditor.vue'), 'utf8');
const configEditorModalSource = readFileSync(
  resolve(pageRoot, 'components/ConfigEditorModal.vue'),
  'utf8',
);
const importConfigModalSource = readFileSync(
  resolve(pageRoot, 'components/ImportConfigModal.vue'),
  'utf8',
);
const ohlcvPreflightModalSource = readFileSync(resolve(pageRoot, 'components/OhlcvPreflightModal.vue'), 'utf8');
const connectionNoticeSource = readFileSync(resolve(pageRoot, '../../shared/components/ConnectionNotice.vue'), 'utf8');
const optimizeSources = [
  appSource,
  queuePanelSource,
  editorSource,
  configEditorModalSource,
  importConfigModalSource,
  ohlcvPreflightModalSource,
  connectionNoticeSource,
].join('\n');

function countOccurrences(source: string, value: string): number {
  return source.split(value).length - 1;
}

describe('Optimize page warning style contracts', () => {
  it('removes the former amber literal from warning surfaces', () => {
    expect(optimizeSources).not.toContain('#d0a36f');
  });

  it('uses the shared Warning token for every migrated warning surface', () => {
    expect(appSource).toContain('<ConnectionNotice');
    expect(appSource).toContain('border-l-warning');
    expect(queuePanelSource).toContain('bg-warning/15 text-warning-soft');
    expect(editorSource).toContain('color: var(--warning-soft);');
    expect(ohlcvPreflightModalSource).toContain('bg-warning/15 text-warning-soft');
    expect(connectionNoticeSource).toContain('pbgui-connection-notice--ok');
  });

  it('uses shared modal and elevated effects in the reviewed Optimize files', () => {
    expect(optimizeSources).not.toContain('rgba(5,8,14');
    expect(optimizeSources).not.toContain('rgba(5, 8, 14');
    expect(countOccurrences(appSource, 'shadow-[var(--shadow-modal)]')).toBe(3);
    expect(countOccurrences(appSource, 'shadow-[var(--shadow-elevated)]')).toBe(1);
    expect(configEditorModalSource).toContain('shadow-[var(--shadow-modal)]');
    expect(importConfigModalSource).toContain('shadow-[var(--shadow-modal)]');
  });

  it('uses the canonical primary foreground role for the JSON editor caret', () => {
    expect(editorSource).toContain('caret-primary');
    expect(editorSource).not.toContain('caret-[#e8ecf4]');
  });

  it('uses the Optimize workspace finish for every data panel', () => {
    const dataPanelSources = [queuePanelSource, resultsPanelSource, paretosPanelSource];

    for (const dataPanelSource of dataPanelSources) {
      expect(dataPanelSource).toContain('class="opt-table-wrap');
    }
    expect(configsPanelSource).not.toContain('class="opt-table-wrap');
    expect(appSource).toContain('optimize-workspace');
    expect(appSource).toContain('--opt-table-surface-rgb: 23 28 33;');
    expect(appSource).toContain('--opt-table-surface: rgb(var(--opt-table-surface-rgb));');
    expect(appSource).toContain('.optimize-workspace .opt-table-wrap');
    expect(appSource).toContain('.optimize-workspace .opt-table-wrap::after');
    expect(appSource).toContain("tr[data-slot='empty-row'] td");
    expect(appSource).toContain("tr[data-slot='empty-row']:hover td");
    expect(appSource).toContain("tr[data-slot='empty-row'] .pbgui-empty-state");
    expect(appSource).toContain('border-color: rgb(var(--text-secondary-rgb) / 0.1);');
    expect(appSource).toContain('box-shadow: none;');
    expect(appSource).toContain('padding: 24px 16px;');
    expect(appSource).not.toContain('background: #151a1f;');
    expect(appSource).not.toContain('background: #171c21;');
    expect(countOccurrences(appSource, 'background: var(--opt-table-surface);')).toBeGreaterThanOrEqual(6);
    expect(appSource).toContain('padding-bottom: 24px;');
    expect(appSource).toMatch(/\.optimize-workspace \.opt-table-wrap::after \{[\s\S]*?z-index: 0;[\s\S]*?height: 24px;/);
    expect(appSource).toMatch(/\.optimize-workspace \.opt-table \{[\s\S]*?position: relative;[\s\S]*?z-index: 1;/);
    expect(appSource).toContain('z-index: 0;');
    expect(appSource).toContain('box-shadow: var(--shadow-elevated), inset 0 1px 0');
  });

  it('uses one shared visual contract for Backtest and Optimize configuration tables', () => {
    expect(configsPanelSource).toContain('class="pbgui-config-list');
    expect(configsPanelSource).toContain('class="pbgui-config-frame"');
    expect(configsPanelSource).toContain('class="pbgui-config-wrap"');
    expect(configsPanelSource).toContain('class="pbgui-config-table');
    expect(configsPanelSource).toContain('<ListFooter');
    // the list contract classes now live in the shared ui/table components
    expect(listWrapSource).toContain("'pbgui-list-wrap'");
    expect(tableSource).toContain("'pbgui-list-table");
    expect(listFooterSource).toContain("'pbgui-list-footer'");
    expect(configsPanelSource).toContain('data-test="configs-list-footer"');
    expect(configsPanelSource).toContain("t('v7optimize.configCount', { count: rows.length })");
    expect(sharedComponentsSource).toContain('.pbgui-config-frame');
    expect(sharedComponentsSource).toContain('.pbgui-config-toolbar');
    expect(sharedComponentsSource).toContain('.pbgui-config-table');
    expect(sharedComponentsSource).toContain('min-width: 900px;');
    expect(sharedComponentsSource).toContain('background: rgb(var(--accent-rgb) / 0.12);');
    expect(sharedComponentsSource).toContain('border-left: 3px solid var(--accent);');
    expect(sharedComponentsSource).toMatch(/\.pbgui-config-list \{[\s\S]*?display: flex;[\s\S]*?height: 100%;[\s\S]*?min-height: 0;/);
    expect(sharedComponentsSource).toContain('.pbgui-config-list .pbgui-config-toolbar');
    expect(sharedComponentsSource).toContain('.pbgui-config-list .pbgui-config-frame');
    expect(sharedComponentsSource).toContain('tr:nth-child(even):not(:hover):not(.selected) td');
    expect(sharedComponentsSource).toMatch(/\.pbgui-config-list \.pbgui-config-table td \{[\s\S]*?max-width: 300px;[\s\S]*?overflow: hidden;[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/);
    expect(sharedComponentsSource).toMatch(/\.pbgui-config-list \.pbgui-config-table td\.pbgui-list-actions \{[\s\S]*?max-width: none;[\s\S]*?overflow: visible;[\s\S]*?text-overflow: clip;/);
    expect(appSource).not.toContain('.opt-table-frame--content-sized');
  });

  it('excludes selected rows from zebra stripes and action-cell backgrounds', () => {
    expect(appSource).toContain('tr:nth-child(even):not(:last-child):not(.selected) td');
    expect(appSource).toContain('tr:nth-child(even):not(.selected) .pbgui-list-actions');
  });

  it('displays converged total and selected counts in the config list footer', () => {
    expect(configsPanelSource).toContain('<ListFooter data-test="configs-list-footer">');
    expect(configsPanelSource).toContain("t('v7optimize.configCount', { count: rows.length })");
    expect(configsPanelSource).toContain("t('v7optimize.configsSelected', { count: selectedCount })");
  });

  it('renders semantic compact notification states with reduced-motion support', () => {
    expect(appSource).toContain('opt-toast-card');
    expect(appSource).toContain('opt-toast-card__icon');
    expect(appSource).toContain('PhCheckCircle');
    expect(appSource).toContain('PhWarningCircle');
    expect(appSource).toContain(`:role="toast.kind === 'error' ? 'alert' : 'status'"`);
    expect(appSource).toContain(`:aria-live="toast.kind === 'error' ? 'assertive' : 'polite'"`);
    expect(appSource).toContain('overflow-wrap: anywhere;');
    expect(appSource).toContain('}, 4000);');
    expect(appSource).toMatch(/onBeforeUnmount\(\(\) => \{[\s\S]*?window\.clearTimeout\(toastTimer\);/);
    expect(appSource).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
