import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(resolve(process.cwd(), 'src/styles/tailwind.css'), 'utf8');

describe('precision engineering visual tokens', () => {
  it('defines the shared deep blue-grey surface hierarchy', () => {
    expect(stylesheet).toContain('--color-page: #0d151e;');
    expect(stylesheet).toContain('--color-workspace: #111c27;');
    expect(stylesheet).toContain('--color-panel: #1a2a38;');
    expect(stylesheet).toContain('--color-card: #203344;');
    expect(stylesheet).toContain('--color-elevated: #263b4d;');
    expect(stylesheet).toContain('--color-accent: #9bbfff;');
    expect(stylesheet).toContain('--color-success: #72d5b3;');
    expect(stylesheet).toContain('--color-warning: #efbd72;');
    expect(stylesheet).toContain('--color-danger: #e9817c;');
  });

  it('keeps low-harshness elevation and focus contracts', () => {
    expect(stylesheet).toContain('--shadow-panel:');
    expect(stylesheet).toContain('--shadow-elevated:');
    expect(stylesheet).toContain('--focus-ring:');
    expect(stylesheet).toContain('--ease-standard: cubic-bezier');
    expect(stylesheet).toContain('--ease-spring: cubic-bezier');
  });

  it('preserves legacy surface and semantic aliases', () => {
    expect(stylesheet).toContain('--bg-page: var(--color-page);');
    expect(stylesheet).toContain('--bg-panel: var(--color-panel);');
    expect(stylesheet).toContain('--surface-workspace: var(--color-workspace);');
    expect(stylesheet).toContain('--accent: var(--color-accent);');
    expect(stylesheet).toContain('--success: var(--color-success);');
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

  it('keeps the offline Space Grotesk font setup', () => {
    expect(stylesheet).toContain("font-family: 'Space Grotesk';");
    expect(stylesheet).toContain("url('/app/vendor/fonts/space-grotesk-var.woff2')");
    expect(stylesheet).not.toMatch(/https?:\/\//);
  });
});
