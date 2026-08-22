import { describe, expect, it } from 'vitest';
import {
  createSettingsFieldValues,
  readNumberValue,
  SETTINGS_FIELD_IDS,
  toFieldValue,
} from './settingsFields';

/* Field IO — legacy setFieldValue/readFieldValue/readNumberValue
   (market_data_main.html:5551-5573) plus the input-id registry for the
   rendered DOM (:2986-3072, ids kept verbatim for CSS parity). */

describe('toFieldValue — setFieldValue text branch (:5551-5559)', () => {
  it('stringifies numbers', () => {
    expect(toFieldValue(1800)).toBe('1800');
    expect(toFieldValue(0.5)).toBe('0.5');
  });

  it('renders null and undefined as empty string', () => {
    expect(toFieldValue(null)).toBe('');
    expect(toFieldValue(undefined)).toBe('');
  });

  it('stringifies booleans like String() does', () => {
    expect(toFieldValue(true)).toBe('true');
    expect(toFieldValue(false)).toBe('false');
  });
});

describe('readNumberValue (:5568-5573)', () => {
  it('returns the fallback for empty raw input', () => {
    expect(readNumberValue('', 1800, true)).toBe(1800);
    expect(readNumberValue('', 0.5, false)).toBe(0.5);
  });

  it('parses integers with radix 10', () => {
    expect(readNumberValue('3600', 1800, true)).toBe(3600);
    expect(readNumberValue('08', 2, true)).toBe(8);
  });

  it('parses floats', () => {
    expect(readNumberValue('1.5', 0.5, false)).toBe(1.5);
    expect(readNumberValue('30', 30, false)).toBe(30);
  });

  it('falls back when the parse yields NaN', () => {
    expect(readNumberValue('abc', 1800, true)).toBe(1800);
    expect(readNumberValue('abc', 5, false)).toBe(5);
  });

  it('keeps the legacy lenient parseInt/parseFloat prefixes (:5571-5572)', () => {
    expect(readNumberValue('12abc', 1800, true)).toBe(12);
    expect(readNumberValue('0.5x', 0.5, false)).toBe(0.5);
  });

  it('accepts zero (does not treat 0 as empty)', () => {
    expect(readNumberValue('0', 2, true)).toBe(0);
  });

  it('returns the fallback for negative-result inputs like legacy (no clamping)', () => {
    expect(readNumberValue('-5', 2, true)).toBe(-5);
  });
});

describe('SETTINGS_FIELD_IDS (:2986-3072)', () => {
  it('maps every legacy settings input id verbatim', () => {
    expect(SETTINGS_FIELD_IDS).toEqual({
      intervalSeconds: 'settings-interval-seconds',
      coinPauseSeconds: 'settings-coin-pause-seconds',
      apiTimeoutSeconds: 'settings-api-timeout-seconds',
      minLookbackDays: 'settings-min-lookback-days',
      maxLookbackDays: 'settings-max-lookback-days',
      awsProfile: 'settings-aws-profile',
      awsAccessKeyId: 'settings-aws-access-key-id',
      awsSecretAccessKey: 'settings-aws-secret-access-key',
      awsRegion: 'settings-aws-region',
      scanTimeout: 'settings-scan-timeout',
      scanWorkers: 'settings-scan-workers',
      archiveEnabled: 'settings-archive-enabled',
      archiveDir: 'settings-archive-dir',
    });
  });
});

describe('createSettingsFieldValues', () => {
  it('starts every text field empty and the checkbox unchecked', () => {
    expect(createSettingsFieldValues()).toEqual({
      intervalSeconds: '',
      coinPauseSeconds: '',
      apiTimeoutSeconds: '',
      minLookbackDays: '',
      maxLookbackDays: '',
      awsProfile: '',
      awsAccessKeyId: '',
      awsSecretAccessKey: '',
      awsAccessKeyConfigured: false,
      awsSecretAccessKeyConfigured: false,
      awsRegion: '',
      scanTimeout: '',
      scanWorkers: '',
      archiveEnabled: false,
      archiveDir: '',
    });
  });
});
