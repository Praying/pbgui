import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, useTheme } from './useTheme';

const KEY = 'pbgui-theme';

function stubSystem(light: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-color-scheme: light') ? light : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });
  afterEach(() => vi.unstubAllGlobals());

  it('defaults to dark when nothing is stored and the system is dark', () => {
    stubSystem(false);
    expect(readThemePreference()).toBe('dark');
  });

  it('follows a light system preference for first-time visitors', () => {
    stubSystem(true);
    expect(readThemePreference()).toBe('light');
  });

  it('lets a stored choice beat the system preference in both directions', () => {
    stubSystem(true);
    localStorage.setItem(KEY, 'dark');
    expect(readThemePreference()).toBe('dark');
    stubSystem(false);
    localStorage.setItem(KEY, 'light');
    expect(readThemePreference()).toBe('light');
  });

  it('ignores an unrecognised stored value', () => {
    stubSystem(false);
    localStorage.setItem(KEY, 'sepia');
    expect(readThemePreference()).toBe('dark');
  });

  it('writes the attribute only for light', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('persists the choice when toggled', () => {
    stubSystem(false);
    const { theme, setTheme, toggleTheme } = useTheme();
    setTheme('light');
    expect(theme.value).toBe('light');
    expect(localStorage.getItem(KEY)).toBe('light');
    toggleTheme();
    expect(theme.value).toBe('dark');
    expect(localStorage.getItem(KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
