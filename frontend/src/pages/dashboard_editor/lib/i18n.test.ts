import { afterEach, describe, expect, it, vi } from 'vitest';
import { dashT, setDashTranslator } from './i18n';

describe('dashT (render.js _t:31-44)', () => {
  afterEach(() => {
    setDashTranslator(null);
    vi.restoreAllMocks();
  });

  it('uses the English fallback literal when no translator is set (legacy fragment/test VM path)', () => {
    expect(dashT('dash.secondsAgo', '{n}s ago', { n: 5 })).toBe('5s ago');
    expect(dashT('dash.nowShort', 'now')).toBe('now');
  });

  it('substitutes only own params and only {word} placeholders', () => {
    expect(dashT('k', '{n}s ago', { n: 5, extra: 'x' })).toBe('5s ago');
    // legacy uses hasOwnProperty — inherited names must NOT substitute
    expect(dashT('k', '{toString}', {})).toBe('{toString}');
    expect(dashT('k', '{missing}', { n: 1 })).toBe('{missing}');
  });

  it('stringifies param values', () => {
    expect(dashT('k', '{n}', { n: 0 })).toBe('0');
    expect(dashT('k', '{n}', { n: null })).toBe('null');
  });

  it('does not substitute when params are omitted', () => {
    expect(dashT('k', '{n}s ago')).toBe('{n}s ago');
  });

  it('prefers the translator result when it differs from the key', () => {
    setDashTranslator((key, params) => (key === 'dash.secondsAgo' ? `${params?.n as number} 秒前` : key));
    expect(dashT('dash.secondsAgo', '{n}s ago', { n: 5 })).toBe('5 秒前');
  });

  it('falls back to the literal when the translator returns the key (missing translation)', () => {
    setDashTranslator((key) => key);
    expect(dashT('dash.unknownKey', 'Fallback {n}', { n: 3 })).toBe('Fallback 3');
  });

  it('receives params through the translator', () => {
    const t = vi.fn((key: string, params?: Record<string, unknown>) => `T(${key},${params?.n ?? '-'})`);
    setDashTranslator(t);
    expect(dashT('k', 'fallback', { n: 7 })).toBe('T(k,7)');
  });

  it('can be reset to the untranslated mode', () => {
    setDashTranslator((key) => `T:${key}`);
    expect(dashT('k', 'f')).toBe('T:k');
    setDashTranslator(null);
    expect(dashT('k', 'f')).toBe('f');
  });
});
