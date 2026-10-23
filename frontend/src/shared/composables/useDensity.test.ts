import { beforeEach, describe, expect, it } from 'vitest';
import { applyDensity, readDensityPreference, useDensity } from './useDensity';

const STORAGE_KEY = 'pbgui-density';

describe('density preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.density;
  });

  it('defaults to comfortable when nothing is stored', () => {
    expect(readDensityPreference()).toBe('comfortable');
  });

  it('reads a stored compact preference', () => {
    localStorage.setItem(STORAGE_KEY, 'compact');
    expect(readDensityPreference()).toBe('compact');
  });

  it('falls back to comfortable for unrecognised values', () => {
    localStorage.setItem(STORAGE_KEY, 'dense');
    expect(readDensityPreference()).toBe('comfortable');
  });

  it('writes the attribute only when compact', () => {
    applyDensity('compact');
    expect(document.documentElement.dataset.density).toBe('compact');

    applyDensity('comfortable');
    // Comfortable is the :root default, so the override attribute is removed
    // rather than written with a redundant value.
    expect(document.documentElement.dataset.density).toBeUndefined();
  });

  it('persists the choice when toggled', () => {
    const { density, setDensity, toggleDensity } = useDensity();
    setDensity('compact');
    expect(density.value).toBe('compact');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('compact');
    expect(document.documentElement.dataset.density).toBe('compact');

    toggleDensity();
    expect(density.value).toBe('comfortable');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('comfortable');
    expect(document.documentElement.dataset.density).toBeUndefined();
  });
});
