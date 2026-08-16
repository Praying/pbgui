import { describe, expect, it } from 'vitest';
import {
  collectSettingsRequest,
  type CollectSettingsRequestInput,
} from './settingsRequest';
import { SETTINGS_NUMBER_DEFAULTS, createSettingsFieldValues } from './settingsFields';

/* collectSettingsRequest — the POST payload CONTRACT (legacy
   market_data_main.html:8900-8928). Byte-level fidelity: the JSON string
   (property insertion order included) must be identical to the legacy
   serializer's output. */

function makeInput(overrides: Partial<CollectSettingsRequestInput> = {}): CollectSettingsRequestInput {
  return {
    exchange: 'hyperliquid',
    autoEnableNewCoins: false,
    selectedCoins: ['ETH', 'BTC'],
    allCoins: ['BTC', 'ETH', 'SOL'],
    fields: createSettingsFieldValues(),
    ...overrides,
  };
}

function filledHyperliquidFields() {
  return {
    ...createSettingsFieldValues(),
    intervalSeconds: '3600',
    coinPauseSeconds: '1.25',
    apiTimeoutSeconds: '45',
    minLookbackDays: '3',
    maxLookbackDays: '7',
    awsProfile: 'my-profile',
    awsAccessKeyId: 'AKIA123',
    awsSecretAccessKey: 'secret',
    awsRegion: 'eu-west-1',
    scanTimeout: '12.5',
    scanWorkers: '16',
    archiveEnabled: true,
    archiveDir: '/mnt/nas/l2books',
  };
}

describe('base request shape (:8904-8914)', () => {
  it('collects the five numeric settings with trimmed values', () => {
    const request = collectSettingsRequest(makeInput({
      fields: {
        ...createSettingsFieldValues(),
        intervalSeconds: ' 3600 ',
        coinPauseSeconds: '1.25',
        apiTimeoutSeconds: '45',
        minLookbackDays: '3',
        maxLookbackDays: '7',
      },
    }));
    expect(request.settings).toMatchObject({
      interval_seconds: 3600,
      coin_pause_seconds: 1.25,
      api_timeout_seconds: 45,
      min_lookback_days: 3,
      max_lookback_days: 7,
    });
  });

  it('falls back to the legacy defaults for empty/invalid fields (:8908-8912)', () => {
    const request = collectSettingsRequest(makeInput());
    expect(request.settings.interval_seconds).toBe(SETTINGS_NUMBER_DEFAULTS.intervalSeconds);
    expect(request.settings.coin_pause_seconds).toBe(SETTINGS_NUMBER_DEFAULTS.coinPauseSeconds);
    expect(request.settings.api_timeout_seconds).toBe(SETTINGS_NUMBER_DEFAULTS.apiTimeoutSeconds);
    expect(request.settings.min_lookback_days).toBe(SETTINGS_NUMBER_DEFAULTS.minLookbackDays);
    expect(request.settings.max_lookback_days).toBe(SETTINGS_NUMBER_DEFAULTS.maxLookbackDays);

    const invalid = collectSettingsRequest(makeInput({
      fields: { ...createSettingsFieldValues(), intervalSeconds: 'not-a-number' },
    }));
    expect(invalid.settings.interval_seconds).toBe(1800);
  });

  it('uses the raw (unsorted-insertion-order) selectedCoins sorted (:8903)', () => {
    const request = collectSettingsRequest(makeInput({ selectedCoins: ['SOL', 'BTC', 'ETH'] }));
    expect(request.enabled_coins).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('sorts an empty selection to an empty array', () => {
    const request = collectSettingsRequest(makeInput({ selectedCoins: [] }));
    expect(request.enabled_coins).toEqual([]);
  });
});

describe('auto-enable expansion (:8901-8903)', () => {
  it('expands to ALL coins sorted when autoEnableNewCoins is on', () => {
    const request = collectSettingsRequest(makeInput({
      autoEnableNewCoins: true,
      selectedCoins: ['BTC'],
      allCoins: ['SOL', 'BTC', 'ETH'],
    }));
    expect(request.auto_enable_new_coins).toBe(true);
    expect(request.enabled_coins).toEqual(['BTC', 'ETH', 'SOL']);
  });

  it('uses default JS sort (UTF-16 code units), not localeCompare', () => {
    const request = collectSettingsRequest(makeInput({
      autoEnableNewCoins: true,
      allCoins: ['bTC', 'BTC', 'Atop'],
    }));
    // 'A'(65) < 'B'(66) < 'b'(98)
    expect(request.enabled_coins).toEqual(['Atop', 'BTC', 'bTC']);
  });
});

describe('hyperliquid-only AWS/archive fields (:8916-8925)', () => {
  it('appends the eight AWS/archive fields after the base five', () => {
    const request = collectSettingsRequest(makeInput({ fields: filledHyperliquidFields() }));
    expect(Object.keys(request.settings)).toEqual([
      'interval_seconds',
      'coin_pause_seconds',
      'api_timeout_seconds',
      'min_lookback_days',
      'max_lookback_days',
      'aws_profile',
      'aws_access_key_id',
      'aws_secret_access_key',
      'aws_region',
      'l2book_scan_timeout_s',
      'l2book_scan_workers',
      'l2book_archive_enabled',
      'l2book_archive_dir',
    ]);
    expect(request.settings).toEqual({
      interval_seconds: 3600,
      coin_pause_seconds: 1.25,
      api_timeout_seconds: 45,
      min_lookback_days: 3,
      max_lookback_days: 7,
      aws_profile: 'my-profile',
      aws_access_key_id: 'AKIA123',
      aws_secret_access_key: 'secret',
      aws_region: 'eu-west-1',
      l2book_scan_timeout_s: 12.5,
      l2book_scan_workers: 16,
      l2book_archive_enabled: true,
      l2book_archive_dir: '/mnt/nas/l2books',
    });
  });

  it("defaults aws_profile to 'pbgui-hyperliquid' when empty (:8917)", () => {
    const request = collectSettingsRequest(makeInput());
    expect(request.settings.aws_profile).toBe('pbgui-hyperliquid');
  });

  it('keeps a whitespace-only aws_profile as the default (trim then fallback)', () => {
    const request = collectSettingsRequest(makeInput({
      fields: { ...createSettingsFieldValues(), awsProfile: '   ' },
    }));
    expect(request.settings.aws_profile).toBe('pbgui-hyperliquid');
  });

  it('passes through the archive checkbox state untouched (:8923)', () => {
    expect(collectSettingsRequest(makeInput()).settings.l2book_archive_enabled).toBe(false);
    expect(
      collectSettingsRequest(makeInput({ fields: { ...createSettingsFieldValues(), archiveEnabled: true } }))
        .settings.l2book_archive_enabled
    ).toBe(true);
  });

  it('falls back to the scan defaults (5.0s / 8 workers) on empty fields (:8921-8922)', () => {
    const request = collectSettingsRequest(makeInput());
    expect(request.settings.l2book_scan_timeout_s).toBe(5);
    expect(request.settings.l2book_scan_workers).toBe(8);
  });

  it('trims text fields like readFieldValue (:8918-8920, :8924)', () => {
    const request = collectSettingsRequest(makeInput({
      fields: {
        ...createSettingsFieldValues(),
        awsAccessKeyId: ' AKIA ',
        awsRegion: ' us-east-1 ',
        archiveDir: ' /mnt/x ',
      },
    }));
    expect(request.settings.aws_access_key_id).toBe('AKIA');
    expect(request.settings.aws_region).toBe('us-east-1');
    expect(request.settings.l2book_archive_dir).toBe('/mnt/x');
  });
});

describe('non-hyperliquid request (:8916 branch skipped)', () => {
  it('omits every AWS/archive key', () => {
    const request = collectSettingsRequest(makeInput({
      exchange: 'bybit',
      fields: filledHyperliquidFields(),
    }));
    expect(Object.keys(request.settings)).toEqual([
      'interval_seconds',
      'coin_pause_seconds',
      'api_timeout_seconds',
      'min_lookback_days',
      'max_lookback_days',
    ]);
  });
});

describe('golden JSON parity — byte-level (:8934 JSON.stringify)', () => {
  it('serializes a fully-populated hyperliquid request in exact legacy byte order', () => {
    const request = collectSettingsRequest(makeInput({ fields: filledHyperliquidFields() }));
    expect(JSON.stringify(request)).toBe(
      '{"auto_enable_new_coins":false,"enabled_coins":["BTC","ETH"],'
        + '"settings":{"interval_seconds":3600,"coin_pause_seconds":1.25,'
        + '"api_timeout_seconds":45,"min_lookback_days":3,"max_lookback_days":7,'
        + '"aws_profile":"my-profile","aws_access_key_id":"AKIA123",'
        + '"aws_secret_access_key":"secret","aws_region":"eu-west-1",'
        + '"l2book_scan_timeout_s":12.5,"l2book_scan_workers":16,'
        + '"l2book_archive_enabled":true,"l2book_archive_dir":"/mnt/nas/l2books"}}'
    );
  });

  it('serializes an untouched hyperliquid request with all defaults', () => {
    const request = collectSettingsRequest(makeInput());
    expect(JSON.stringify(request)).toBe(
      '{"auto_enable_new_coins":false,"enabled_coins":["BTC","ETH"],'
        + '"settings":{"interval_seconds":1800,"coin_pause_seconds":0.5,'
        + '"api_timeout_seconds":30,"min_lookback_days":2,"max_lookback_days":4,'
        + '"aws_profile":"pbgui-hyperliquid","aws_access_key_id":"",'
        + '"aws_secret_access_key":"","aws_region":"",'
        + '"l2book_scan_timeout_s":5,"l2book_scan_workers":8,'
        + '"l2book_archive_enabled":false,"l2book_archive_dir":""}}'
    );
  });

  it('serializes a non-hyperliquid request without the AWS block', () => {
    const request = collectSettingsRequest(makeInput({
      exchange: 'binance',
      selectedCoins: [],
      fields: { ...createSettingsFieldValues(), intervalSeconds: '900' },
    }));
    expect(JSON.stringify(request)).toBe(
      '{"auto_enable_new_coins":false,"enabled_coins":[],'
        + '"settings":{"interval_seconds":900,"coin_pause_seconds":0.5,'
        + '"api_timeout_seconds":30,"min_lookback_days":2,"max_lookback_days":4}}'
    );
  });
});
