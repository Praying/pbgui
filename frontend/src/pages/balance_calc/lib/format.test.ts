import { describe, expect, it } from 'vitest';
import { fmtPrice, instanceLabel } from './format';

/* Verbatim ports of balance_calc.html :303, :499-503. */

describe('fmtPrice (:499-503)', () => {
  it('formats by magnitude', () => {
    expect(fmtPrice(1.5)).toBe('1.50');
    expect(fmtPrice(0.5)).toBe('0.5000');
    expect(fmtPrice(0.000012345)).toBe('0.00001234'); // toFixed(8) of the float literal
  });

  it('passes non-numeric input through as text', () => {
    expect(fmtPrice('n/a')).toBe('n/a');
  });
});

describe('instanceLabel (:303)', () => {
  it('marks PB8 and PB7 instances', () => {
    expect(instanceLabel({ name: 'main', version: 'v8' })).toBe('[PB8] main');
    expect(instanceLabel({ name: 'bot', version: 'v7' })).toBe('[PB7] bot');
  });
});
