import { readonly, ref } from 'vue';

/**
 * Colour theme — `dark` (the original and default) or `light`.
 *
 * The palette itself lives entirely in CSS: tailwind.css defines the dark
 * tokens at :root and overrides them under `[data-theme='light']`, so every
 * utility and legacy alias re-resolves with no per-component code. This
 * module only owns the attribute and the stored preference.
 *
 * Preference order: an explicit stored choice, else the OS `prefers-color-scheme`
 * for first-time visitors, else dark. A stored choice always wins, so a user
 * who picked dark on a light-OS machine is not overridden on the next visit.
 */
export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'pbgui-theme';

function storedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** The theme to start in: stored choice, else system preference, else dark. */
export function readThemePreference(): Theme {
  return storedTheme() ?? systemTheme();
}

/**
 * Apply to <html>. Dark is the :root default, so it removes the attribute
 * instead of writing a redundant value (keeps the override block matching
 * only when it is needed).
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'light') root.dataset.theme = 'light';
  else delete root.dataset.theme;
}

/** One document per page, so a module-scoped ref is the whole store. */
const theme = ref<Theme>('dark');

export function useTheme() {
  function setTheme(next: Theme): void {
    theme.value = next;
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting is best-effort; this page still applies it.
    }
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'light' ? 'dark' : 'light');
  }

  return { theme: readonly(theme), setTheme, toggleTheme };
}

/**
 * Call once at shell setup. A stored choice is applied as-is; with no stored
 * choice the system preference is applied for this page *without* persisting
 * it, so the OS setting is followed until the user decides.
 */
export function initTheme(): void {
  theme.value = readThemePreference();
  applyTheme(theme.value);
}
