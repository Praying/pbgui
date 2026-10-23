import { readonly, ref } from 'vue';

/**
 * Control density — `comfortable` (28/32/38px controls) or `compact`
 * (24/28/32px). The geometry itself lives entirely in CSS: the
 * `[data-density='compact']` block in styles/tailwind.css overrides
 * --control-height-*, and every page and ui/ component sizes itself from
 * those variables. This module only owns the attribute and the stored
 * preference, so there is exactly one source of truth.
 */
export type Density = 'comfortable' | 'compact';

const STORAGE_KEY = 'pbgui-density';

/** Read the stored preference. Anything unrecognised means comfortable. */
export function readDensityPreference(): Density {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'compact' ? 'compact' : 'comfortable';
  } catch {
    // Storage blocked (private mode, sandboxed frame) — use the default.
    return 'comfortable';
  }
}

/**
 * Apply the density to <html>. Comfortable is the default geometry, so it
 * removes the attribute rather than writing a redundant value; that keeps
 * the CSS override block matching only when it is actually needed.
 */
export function applyDensity(density: Density): void {
  const root = document.documentElement;
  if (density === 'compact') {
    root.dataset.density = 'compact';
  } else {
    delete root.dataset.density;
  }
}

/**
 * The rail and the density control both live in AppShell, which mounts
 * once per page document (every PBGui page is its own entry), so a
 * module-scoped ref is the whole store — no provide/inject needed.
 */
const density = ref<Density>('comfortable');

export function useDensity() {
  function setDensity(next: Density): void {
    density.value = next;
    applyDensity(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Persisting is best-effort; the current page still applies it.
    }
  }

  function toggleDensity(): void {
    setDensity(density.value === 'compact' ? 'comfortable' : 'compact');
  }

  return {
    density: readonly(density),
    setDensity,
    toggleDensity,
  };
}

/**
 * Call once at shell mount, before first paint where possible. Lives apart
 * from useDensity() so unit tests can exercise the store without touching
 * the document.
 */
export function initDensity(): void {
  density.value = readDensityPreference();
  applyDensity(density.value);
}
