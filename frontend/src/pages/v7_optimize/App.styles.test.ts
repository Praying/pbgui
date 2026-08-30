import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pageRoot = import.meta.dirname;
const appSource = readFileSync(resolve(pageRoot, 'App.vue'), 'utf8');
const queuePanelSource = readFileSync(resolve(pageRoot, 'components/QueuePanel.vue'), 'utf8');
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
    expect(appSource).toContain('show-ok');
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
});
