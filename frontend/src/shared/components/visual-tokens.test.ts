import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRECISION_PALETTE } from '../lib/precisionPalette';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/tailwind.css'), 'utf8');
const componentStylesheet = readFileSync(resolve(process.cwd(), 'src/styles/components.css'), 'utf8');

function convertHexToRgbChannels(hexColor: string): string {
  const redChannel = Number.parseInt(hexColor.slice(1, 3), 16);
  const greenChannel = Number.parseInt(hexColor.slice(3, 5), 16);
  const blueChannel = Number.parseInt(hexColor.slice(5, 7), 16);

  return `${redChannel} ${greenChannel} ${blueChannel}`;
}

function assertOptionalRgbCompanion(
  stylesheetText: string,
  variableName: string,
  expectedHexColor: string,
): void {
  const declarationValue = stylesheetText.match(new RegExp(`${variableName}:\\s*([^;]+);`))?.[1]?.trim();

  if (declarationValue !== undefined) {
    expect(declarationValue).toBe(convertHexToRgbChannels(expectedHexColor));
  }
}

describe('precision engineering visual tokens', () => {
  it('uses the accent contrast role for filled toolbar CTAs', () => {
    expect(componentStylesheet).toContain('color: var(--accent-contrast);');
    expect(componentStylesheet).not.toContain('color: #f2f5fb; /* near-white on colored fill */');
  });

  it('keeps canonical CSS declarations synchronized with the TypeScript bridge', () => {
    expect(stylesheet).toContain(`--color-deep: ${PRECISION_PALETTE.surface.deep};`);
    expect(stylesheet).toContain(`--color-page: ${PRECISION_PALETTE.surface.page};`);
    expect(stylesheet).toContain(`--color-sidebar: ${PRECISION_PALETTE.surface.sidebar};`);
    expect(stylesheet).toContain(`--color-input: ${PRECISION_PALETTE.surface.input};`);
    expect(stylesheet).toContain(`--color-panel: ${PRECISION_PALETTE.surface.panel};`);
    expect(stylesheet).toContain(`--color-elevated: ${PRECISION_PALETTE.surface.elevated};`);

    expect(stylesheet).toContain(`--color-border-subtle: ${PRECISION_PALETTE.border.subtle};`);
    expect(stylesheet).toContain(`--color-border-default: ${PRECISION_PALETTE.border.default};`);
    expect(stylesheet).toContain(`--color-border-strong: ${PRECISION_PALETTE.border.strong};`);

    expect(stylesheet).toContain(`--color-primary: ${PRECISION_PALETTE.text.primary};`);
    expect(stylesheet).toContain(`--color-secondary: ${PRECISION_PALETTE.text.secondary};`);
    expect(stylesheet).toContain(`--color-muted: ${PRECISION_PALETTE.text.muted};`);

    expect(stylesheet).toContain(`--color-accent-deep: ${PRECISION_PALETTE.accent.deep};`);
    expect(stylesheet).toContain(`--color-accent: ${PRECISION_PALETTE.accent.base};`);
    expect(stylesheet).toContain(`--color-accent-soft: ${PRECISION_PALETTE.accent.soft};`);
    expect(stylesheet).toContain(`--color-accent-contrast: ${PRECISION_PALETTE.accent.contrast};`);
    expect(stylesheet).toContain(`--accent-bg: ${PRECISION_PALETTE.alpha.accentBackground};`);
    expect(stylesheet).toContain(`--success-bg: ${PRECISION_PALETTE.alpha.successBackground};`);
    expect(stylesheet).toContain(`--warning-bg: ${PRECISION_PALETTE.alpha.warningBackground};`);
    expect(stylesheet).toContain(`--danger-bg: ${PRECISION_PALETTE.alpha.dangerBackground};`);

    expect(stylesheet).toContain(`--color-success-deep: ${PRECISION_PALETTE.success.deep};`);
    expect(stylesheet).toContain(`--color-success: ${PRECISION_PALETTE.success.base};`);
    expect(stylesheet).toContain(`--color-success-soft: ${PRECISION_PALETTE.success.soft};`);
    expect(stylesheet).toContain(`--color-warning-deep: ${PRECISION_PALETTE.warning.deep};`);
    expect(stylesheet).toContain(`--color-warning: ${PRECISION_PALETTE.warning.base};`);
    expect(stylesheet).toContain(`--color-warning-soft: ${PRECISION_PALETTE.warning.soft};`);
    expect(stylesheet).toContain(`--color-danger-deep: ${PRECISION_PALETTE.danger.deep};`);
    expect(stylesheet).toContain(`--color-danger: ${PRECISION_PALETTE.danger.base};`);
    expect(stylesheet).toContain(`--color-danger-soft: ${PRECISION_PALETTE.danger.soft};`);
  });

  it('defines the shared neutral graphite surface hierarchy', () => {
    expect(stylesheet).toContain('--color-deep: #0b0c0e;');
    expect(stylesheet).toContain('--color-page: #111215;');
    expect(stylesheet).toContain('--color-workspace: #15161a;');
    expect(stylesheet).toContain('--color-sidebar: #0e0f12;');
    expect(stylesheet).toContain('--color-input: #181a1e;');
    expect(stylesheet).toContain('--color-panel: #1c1e23;');
    expect(stylesheet).toContain('--color-card: #24272d;');
    expect(stylesheet).toContain('--color-elevated: #2d3037;');
    expect(stylesheet).toContain('--color-backdrop: rgb(0 0 0 / 0.66);');
  });

  it('defines the approved border, text, accent, and semantic ramps', () => {
    expect(stylesheet).toContain('--color-border-subtle: #2a2d33;');
    expect(stylesheet).toContain('--color-border-default: #3a3e46;');
    expect(stylesheet).toContain('--color-border-strong: #565b66;');
    expect(stylesheet).toContain('--color-primary: #eceef1;');
    expect(stylesheet).toContain('--color-secondary: #b4b9c2;');
    expect(stylesheet).toContain('--color-muted: #9298a4;');
    expect(stylesheet).toContain('--color-disabled: #5f6570;');
    expect(stylesheet).toContain('--color-placeholder: #7b828e;');
    expect(stylesheet).toContain('--color-accent: #6aaeff;');
    expect(stylesheet).toContain('--color-accent-soft: #a5cfff;');
    expect(stylesheet).toContain('--color-accent-deep: #3b7fd1;');
    expect(stylesheet).toContain('--color-accent-contrast: #07111f;');
    expect(stylesheet).toContain('--color-success: #62c49a;');
    expect(stylesheet).toContain('--color-success-soft: #9be0c0;');
    expect(stylesheet).toContain('--color-success-deep: #2f7a5a;');
    expect(stylesheet).toContain('--color-warning: #e0b45a;');
    expect(stylesheet).toContain('--color-warning-soft: #efd08e;');
    expect(stylesheet).toContain('--color-warning-deep: #8a6a22;');
    expect(stylesheet).toContain('--color-danger: #ee7b7b;');
    expect(stylesheet).toContain('--color-danger-soft: #f6a9a9;');
    expect(stylesheet).toContain('--color-danger-deep: #a14545;');
  });

  it('keeps RGB companions synchronized with the approved palette', () => {
    const requiredRgbCompanionExpectations = [
      ['--accent-rgb', PRECISION_PALETTE.accent.base],
      ['--accent-soft-rgb', PRECISION_PALETTE.accent.soft],
      ['--accent-deep-rgb', PRECISION_PALETTE.accent.deep],
      ['--success-rgb', PRECISION_PALETTE.success.base],
      ['--success-deep-rgb', PRECISION_PALETTE.success.deep],
      ['--warning-rgb', PRECISION_PALETTE.warning.base],
      ['--danger-rgb', PRECISION_PALETTE.danger.base],
      ['--danger-deep-rgb', PRECISION_PALETTE.danger.deep],
      ['--bg-page-rgb', PRECISION_PALETTE.surface.page],
      ['--bg-panel-rgb', PRECISION_PALETTE.surface.panel],
      ['--text-secondary-rgb', PRECISION_PALETTE.text.secondary],
    ] as const;

    for (const [variableName, expectedHexColor] of requiredRgbCompanionExpectations) {
      expect(stylesheet).toContain(
        `${variableName}: ${convertHexToRgbChannels(expectedHexColor)};`,
      );
    }

    assertOptionalRgbCompanion(
      stylesheet,
      '--warning-deep-rgb',
      PRECISION_PALETTE.warning.deep,
    );
  });

  it('keeps low-harshness elevation and focus contracts', () => {
    expect(stylesheet).toContain('--shadow-panel:');
    expect(stylesheet).toContain('--shadow-elevated:');
    expect(stylesheet).toContain('--focus-ring: 0 0 0 3px rgb(106 174 255 / 0.32);');
    expect(stylesheet).toContain('--ease-standard: cubic-bezier');
    expect(stylesheet).toContain('--ease-spring: cubic-bezier');
  });

  it('preserves legacy surface and semantic aliases', () => {
    expect(stylesheet).toContain('--bg-page: var(--color-page);');
    expect(stylesheet).toContain('--bg-panel: var(--color-panel);');
    expect(stylesheet).toContain('--surface-workspace: var(--color-workspace);');
    expect(stylesheet).toContain('--accent: var(--color-accent);');
    expect(stylesheet).toContain('--success: var(--color-success);');
    expect(stylesheet).toContain('--warning: var(--color-warning);');
    expect(stylesheet).toContain('--danger: var(--color-danger);');
  });

  it('rejects legacy blue shared shadow and highlight channels', () => {
    expect(stylesheet).not.toContain('rgb(2 8 14');
    expect(stylesheet).not.toContain('rgb(5 8 14');
    expect(stylesheet).not.toContain('rgb(224 241 255');
  });

  it('defines one responsive page and component spacing contract', () => {
    expect(stylesheet).toContain('--page-padding: 24px;');
    expect(stylesheet).toContain('--section-gap: 20px;');
    expect(stylesheet).toContain('--component-gap: 16px;');
    expect(stylesheet).toContain('--control-gap: 8px;');
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*1100px\)[\s\S]*?--page-padding:\s*20px;/,
    );
    expect(stylesheet).toMatch(
      /@media\s*\(max-width:\s*720px\)[\s\S]*?--page-padding:\s*16px;/,
    );
  });

  it('uses the native CJK-first system stack with no downloaded font', () => {
    expect(stylesheet).toContain("--font-sans: -apple-system, BlinkMacSystemFont, 'PingFang SC'");
    expect(stylesheet).not.toContain('@font-face');
    expect(stylesheet).not.toMatch(/https?:\/\//);
  });
});
