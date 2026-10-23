import { afterEach, describe, expect, it } from 'vitest';
import { PRECISION_PALETTE } from './precisionPalette';
import { currentTheme, themeColors } from './themeColors';

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute('style');
});

describe('themeColors', () => {
  it('falls back to the dark palette literals when no stylesheet is present', () => {
    const c = themeColors();
    expect(c.success).toBe(PRECISION_PALETTE.success.base);
    expect(c.danger).toBe(PRECISION_PALETTE.danger.base);
    expect(c.surface).toBe(PRECISION_PALETTE.surface.page);
    expect(c.textSecondary).toBe(PRECISION_PALETTE.text.secondary);
  });

  it('reads the live CSS variable so a theme switch changes the ink', () => {
    document.documentElement.style.setProperty('--color-success', '#1c7350');
    expect(themeColors().success).toBe('#1c7350');
  });

  it('builds grid ink from the overlay channels, white on dark and dark on light', () => {
    expect(themeColors().grid).toBe('rgba(255,255,255,0.12)');
    document.documentElement.style.setProperty('--overlay-rgb', '15 31 39');
    expect(themeColors().grid).toBe('rgba(15,31,39,0.12)');
  });

  it('reports the current theme from the attribute', () => {
    expect(currentTheme()).toBe('dark');
    document.documentElement.dataset.theme = 'light';
    expect(currentTheme()).toBe('light');
  });
});
