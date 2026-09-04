import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(resolve(import.meta.dirname, 'App.vue'), 'utf8');
const integrityPanelSource = readFileSync(
  resolve(import.meta.dirname, 'components/integrity/IntegrityPanel.vue'),
  'utf8',
);
const gapDetailsModalSource = readFileSync(
  resolve(import.meta.dirname, 'components/integrity/GapDetailsModal.vue'),
  'utf8',
);
const marketDataStyleSources = `${appSource}\n${integrityPanelSource}\n${gapDetailsModalSource}`;

describe('Market Data page style contracts', () => {
  it('inherits the shared typography while keeping page chrome behavior', () => {
    expect(appSource).not.toContain("--font: 'Source Sans Pro'");
    expect(appSource).not.toContain('font-family: var(--font)');
    expect(appSource).toContain('html,\nbody {\n  overflow: hidden;');
    expect(appSource).toContain('body {\n  display: flex;\n  flex-direction: column;');
  });

  it('keeps the data-tip and tooltip contracts', () => {
    expect(appSource).toContain('[data-tip]');
    expect(appSource).toContain('#data-tip-tooltip');
    expect(appSource).toContain('text-decoration-style: dotted;');
    expect(appSource).toContain('box-shadow: var(--shadow-elevated);');
    expect(appSource).toContain('pointer-events: none;');
  });

  it('uses shared and neutral effects for active Market Data surfaces', () => {
    expect(marketDataStyleSources).not.toContain('rgba(5, 8, 14');
    expect(marketDataStyleSources).not.toContain('rgba(5,8,14');
    expect(marketDataStyleSources).not.toContain('rgb(2 8 14');
    expect(marketDataStyleSources).not.toContain('rgb(224 241 255');

    expect(integrityPanelSource).toContain(
      'box-shadow: 0 22px 46px rgb(0 0 0 / 0.3), 0 1px 0 rgb(255 255 255 / 0.1) inset;',
    );
    expect(integrityPanelSource).toContain(
      'box-shadow: 0 1px 0 rgb(255 255 255 / 0.06) inset;',
    );
    expect(gapDetailsModalSource).toContain(
      'class="integrity-gap-backdrop fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-backdrop',
    );
    expect(gapDetailsModalSource).toContain('shadow-[var(--shadow-modal)]');
  });
});
