import { describe, expect, it } from 'vitest';
import { TOAST_VISIBLE_MS } from './toast';

describe('shared toast constant', () => {
  it('standardizes toast display duration to 4000ms', () => {
    expect(TOAST_VISIBLE_MS).toBe(4000);
  });
});
