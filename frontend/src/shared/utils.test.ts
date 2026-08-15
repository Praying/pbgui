import { describe, expect, it } from 'vitest';
import { esc } from './utils';

describe('esc', () => {
  it('escapes html special characters like the legacy esc()', () => {
    expect(esc('<a href="x">&')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;');
  });
  it('stringifies non-string input', () => {
    expect(esc(42)).toBe('42');
    expect(esc(null)).toBe('null');
    expect(esc(undefined)).toBe('undefined');
  });
});
