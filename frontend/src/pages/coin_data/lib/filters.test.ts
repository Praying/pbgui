import { describe, expect, it } from 'vitest';
import {
  commitFilterNumberDraft,
  formatStepperValue,
  getDynamicVolMcapStepValue,
  isIncompleteFilterNumber,
  normalizeFilterNumberText,
  parseFilterNumber,
  stepFixedValue,
} from './filters';

/* Verbatim ports of coin_data.html :2402-2525. */

describe('normalizeFilterNumberText (:2402-2404)', () => {
  it('trims and converts decimal commas', () => {
    expect(normalizeFilterNumberText(' 1,5 ')).toBe('1.5');
    expect(normalizeFilterNumberText(null)).toBe('');
  });
});

describe('parseFilterNumber (:2406-2411)', () => {
  it('treats empty text as zero', () => {
    expect(parseFilterNumber('', 5)).toBe(0);
    expect(parseFilterNumber(null, 5)).toBe(0);
  });

  it('falls back on garbage and accepts comma decimals', () => {
    expect(parseFilterNumber('abc', 7)).toBe(7);
    expect(parseFilterNumber('2,5', 0)).toBe(2.5);
  });
});

describe('isIncompleteFilterNumber (:2413-2416)', () => {
  it('flags sign-only, dot-only and trailing-dot drafts', () => {
    for (const draft of ['+', '-', '.', '+.', '-.', '5.', '-5.']) {
      expect(isIncompleteFilterNumber(draft)).toBe(true);
    }
    expect(isIncompleteFilterNumber('5')).toBe(false);
    expect(isIncompleteFilterNumber('5.5')).toBe(false);
    expect(isIncompleteFilterNumber('')).toBe(false);
  });
});

describe('commitFilterNumberDraft (:2432-2443)', () => {
  it('commits zero for cleared drafts', () => {
    const commits: number[] = [];
    expect(commitFilterNumberDraft('', 3, (v) => commits.push(v))).toBe(true);
    expect(commits).toEqual([0]);
  });

  it('returns false without committing for incomplete drafts', () => {
    const commits: number[] = [];
    expect(commitFilterNumberDraft('5.', 3, (v) => commits.push(v))).toBe(false);
    expect(commits).toEqual([]);
  });

  it('commits parsed values', () => {
    const commits: number[] = [];
    expect(commitFilterNumberDraft('2,5', 3, (v) => commits.push(v))).toBe(true);
    expect(commits).toEqual([2.5]);
  });
});

describe('formatStepperValue (:2472-2479)', () => {
  it('renders integers without decimals', () => {
    expect(formatStepperValue(10)).toBe('10');
  });

  it('trims trailing zeros from fractional values', () => {
    expect(formatStepperValue(2.5)).toBe('2.5');
    expect(formatStepperValue(0.30000000000000004)).toBe('0.3');
  });
});

describe('getDynamicVolMcapStepValue (:2481-2500)', () => {
  const ladder = [0.1, 0.5, 1, 5, 10];

  it('returns null without a ladder', () => {
    expect(getDynamicVolMcapStepValue(5, 1, [])).toBeNull();
    expect(getDynamicVolMcapStepValue(5, 1, null)).toBeNull();
  });

  it('steps up to the next ladder value', () => {
    expect(getDynamicVolMcapStepValue(0.5, 1, ladder)).toBe(1);
    expect(getDynamicVolMcapStepValue(1, 1, ladder)).toBe(5);
  });

  it('steps down to the previous ladder value', () => {
    expect(getDynamicVolMcapStepValue(5, -1, ladder)).toBe(1);
    expect(getDynamicVolMcapStepValue(1, -1, ladder)).toBe(0.5);
  });

  it('returns the current value at the ladder ends', () => {
    expect(getDynamicVolMcapStepValue(10, 1, ladder)).toBe(10);
    expect(getDynamicVolMcapStepValue(0.1, -1, ladder)).toBe(0.1);
  });

  it('skips non-positive and non-numeric ladder entries', () => {
    expect(getDynamicVolMcapStepValue(1, 1, [0, -3, 'x', 5])).toBe(5);
  });
});

describe('stepFixedValue (stepFilterField :2502-2525, market_cap input)', () => {
  it('steps by the input step and clamps to min', () => {
    expect(stepFixedValue('250', 250, 0, Infinity, 1)).toBe(500);
    expect(stepFixedValue('0', 250, 0, Infinity, -1)).toBe(0);
    expect(stepFixedValue('', 250, 0, Infinity, 1)).toBe(250);
  });

  it('honors a max bound', () => {
    expect(stepFixedValue('900', 250, 0, 1000, 1)).toBe(1000);
  });
});
