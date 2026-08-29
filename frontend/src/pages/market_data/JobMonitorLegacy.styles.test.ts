import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const frontendRoot = resolve(import.meta.dirname, '../../..');
const monitorHtml = readFileSync(resolve(frontendRoot, 'jobs_monitor.html'), 'utf8');
const monitorCss = readFileSync(resolve(frontendRoot, 'css/app.css'), 'utf8');
const sharedThemeCss = readFileSync(resolve(frontendRoot, 'src/styles/tailwind.css'), 'utf8');
const integrityMonitorCard = readFileSync(
  resolve(import.meta.dirname, 'components/integrity/JobMonitorCard.vue'),
  'utf8',
);
const monitorSources = `${monitorHtml}\n${monitorCss}`;

function positionOf(fragment: string): number {
  const position = monitorHtml.indexOf(fragment);
  expect(position, `missing ${fragment}`).toBeGreaterThanOrEqual(0);
  return position;
}

function relativeLuminance(hexColor: string): number {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255);
  const linearChannels = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linearChannels[0]! + 0.7152 * linearChannels[1]! + 0.0722 * linearChannels[2]!;
}

function contrastRatio(foreground: string, background: string): number {
  const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (first, second) => second - first,
  );
  return (luminances[0]! + 0.05) / (luminances[1]! + 0.05);
}

describe('legacy Job Monitor Precision Terminal contract', () => {
  it('is self-contained and cache-busts the Precision stylesheet', () => {
    expect(monitorHtml).not.toContain('/app/src/styles/tokens.css');
    expect(monitorHtml).toContain('/app/css/app.css?v=4');
  });

  it('defines the approved neutral surface and signal tokens', () => {
    for (const declaration of [
      '--bg-page: #161616;',
      '--bg-panel: #222222;',
      '--bg-card: #2b2b2b;',
      '--bg-elevated: #2b2b2b;',
      '--bg-input: #1e1e1e;',
      '--bg-backdrop: rgb(15 15 15 / 0.72);',
      '--surface-sidebar: #1b1b1b;',
      '--text-primary: #f0f0f0;',
      '--text-secondary: #bdbdbd;',
      '--text-muted: #999999;',
      '--border-default: #464646;',
      '--accent: #8fcff2;',
      '--accent-deep: #4fa8d3;',
      '--success: #7bc8a5;',
      '--warning: #d8ae6f;',
      '--danger: #d98080;',
    ]) {
      expect(monitorCss).toContain(declaration);
    }
  });

  it('removes active blue-grey literals from the monitor document', () => {
    for (const retiredLiteral of [
      '#0d151e',
      '#1a2a38',
      '#203344',
      '#263b4d',
      '#101a24',
      '#10141d',
      '#333f5c',
      '#4d5c82',
      '#e8ecf4',
      '#a3adc2',
      '#717b8e',
      '#3f63ad',
      '#46c88f',
      '#e5615c',
      '#72a0ee',
      '#96b9f4',
      '#4a5364',
      '#262f45',
      '#9bbfff',
      '#b5d0ff',
      '#72d5b3',
      '#76d9ad',
      '#efbd72',
      '#ecc381',
      '#e9817c',
      '#ee8d84',
      '#267a54',
      '#1b2231',
      '#131826',
      '#262230',
      '#0c1018',
      '#a83a35',
      '#f2f5fb',
      'rgba(96,165,250',
      'rgba(2,6,23',
      'rgb(38, 34, 48',
      'rgba(5, 8, 14',
      'rgba(5,8,14',
      'rgb(2 8 14',
      'rgb(224 241 255',
    ]) {
      expect(monitorSources).not.toContain(retiredLiteral);
    }
  });

  it('styles embedded queue surfaces, states, progress, and dialogs', () => {
    expect(positionOf('/app/css/app.css?v=4')).toBeLessThan(positionOf('<style>'));
    expect(monitorCss).toContain('body.is-embedded .tabs');
    expect(monitorCss).toContain('body.is-embedded .tab-content');
    expect(monitorCss).toContain('body.is-embedded .job-card');
    expect(monitorCss).toContain('body.is-embedded .progress-fill');
    expect(monitorCss).toContain('body.is-embedded .modal-content');
    expect(monitorCss).toContain('background: var(--bg-backdrop) !important;');
    expect(monitorCss).toContain('box-shadow: var(--shadow-modal);');
    expect(integrityMonitorCard).toContain('shadow-[var(--shadow-panel)]');
    expect(integrityMonitorCard).not.toContain('rgba(2,8,14');
    expect(integrityMonitorCard).toContain('background: var(--surface-page);');
    expect(sharedThemeCss).toContain('--surface-page: var(--color-page);');
    expect(sharedThemeCss).toContain('--shadow-panel:');
  });

  it('keeps filled action buttons above the normal-text contrast threshold', () => {
    const palette = {
      textPrimary: '#f0f0f0',
      accentContrast: '#081216',
      elevated: '#2b2b2b',
      borderDefault: '#464646',
      accentDeep: '#4fa8d3',
      accent: '#8fcff2',
      success: '#7bc8a5',
      dangerDeep: '#914343',
      danger: '#d98080',
    };
    const buttonPairs = [
      [palette.textPrimary, palette.elevated],
      [palette.textPrimary, palette.borderDefault],
      [palette.accentContrast, palette.accentDeep],
      [palette.accentContrast, palette.accent],
      [palette.accentContrast, palette.success],
      [palette.textPrimary, palette.dangerDeep],
      [palette.accentContrast, palette.danger],
    ] as const;

    for (const [foreground, background] of buttonPairs) {
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(monitorHtml).toContain('.btn-run { background: var(--success); color: var(--accent-contrast); }');
    expect(monitorHtml).toContain('.btn-view { background: var(--accent-deep); color: var(--accent-contrast); }');
    expect(monitorHtml).toContain('.btn-info { background: var(--accent-deep); color: var(--accent-contrast); }');
    expect(monitorCss).toContain('background: var(--danger-deep);\n    color: var(--text-primary);');
  });

  it('declares every consumed theme token and keeps generated colors tokenized', () => {
    const consumedTokens = new Set(
      [...monitorSources.matchAll(/var\(--([a-z0-9-]+)(\s*,)?/g)]
        .filter((match) => match[2] === undefined)
        .map((match) => match[1]),
    );
    const declaredTokens = new Set(
      [...monitorCss.matchAll(/--([a-z0-9-]+)\s*:/g)].map((match) => match[1]),
    );

    for (const tokenName of consumedTokens) {
      expect(declaredTokens, `missing --${tokenName}`).toContain(tokenName);
    }

    for (const generatedColor of [
      'style="color:var(--text-secondary);"',
      'color:var(--danger)',
    ]) {
      expect(monitorHtml).toContain(generatedColor);
    }
    expect(monitorHtml).not.toMatch(/style="color:#[0-9a-f]+/i);
  });
});
