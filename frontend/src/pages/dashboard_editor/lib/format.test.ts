import { afterEach, describe, expect, it } from 'vitest';
import {
  liveAgeText,
  liveBadgeText,
  liveSourceLabel,
  liveStatusText,
  positionEntryColor,
  positionsStatusText,
  signedFmt,
  tweBarPct,
  tweColor,
  upnlColor,
} from './format';
import { setDashTranslator } from './i18n';

describe('tweColor (render.js:372)', () => {
  it('is green below 100', () => {
    expect(tweColor(-50)).toBe('#8fb593');
    expect(tweColor(0)).toBe('#8fb593');
    expect(tweColor(99.99)).toBe('#8fb593');
  });

  it('is orange from 100 up to 200', () => {
    expect(tweColor(100)).toBe('#c4a67e');
    expect(tweColor(199.99)).toBe('#c4a67e');
  });

  it('is red from 200 up', () => {
    expect(tweColor(200)).toBe('#c58e8a');
    expect(tweColor(1000)).toBe('#c58e8a');
  });

  it('treats NaN as red (legacy: all comparisons false)', () => {
    expect(tweColor(Number.NaN)).toBe('#c58e8a');
  });

  it('treats Infinity as red', () => {
    expect(tweColor(Number.POSITIVE_INFINITY)).toBe('#c58e8a');
  });
});

describe('upnlColor (render.js:373)', () => {
  it('is green for zero and positive', () => {
    expect(upnlColor(0)).toBe('#8fb593');
    expect(upnlColor(-0)).toBe('#8fb593');
    expect(upnlColor(12.34)).toBe('#8fb593');
  });

  it('is red for negative', () => {
    expect(upnlColor(-0.01)).toBe('#c58e8a');
    expect(upnlColor(-500)).toBe('#c58e8a');
  });

  it('treats NaN as red (NaN >= 0 is false)', () => {
    expect(upnlColor(Number.NaN)).toBe('#c58e8a');
  });
});

describe('tweBarPct (render.js:397)', () => {
  it('maps 300 to 100.0%', () => {
    expect(tweBarPct(300)).toBe('100.0');
  });

  it('caps above 300 at 100.0', () => {
    expect(tweBarPct(301)).toBe('100.0');
    expect(tweBarPct(Number.POSITIVE_INFINITY)).toBe('100.0');
  });

  it('scales proportionally below 300', () => {
    expect(tweBarPct(0)).toBe('0.0');
    expect(tweBarPct(150)).toBe('50.0');
    expect(tweBarPct(50)).toBe('16.7');
  });

  it('keeps negative values negative (legacy does not clamp at 0)', () => {
    expect(tweBarPct(-60)).toBe('-20.0');
  });

  it('renders NaN as "NaN" (legacy toFixed passthrough)', () => {
    expect(tweBarPct(Number.NaN)).toBe('NaN');
  });
});

describe('signedFmt (render.js:398)', () => {
  it('prefixes non-negative values with +', () => {
    expect(signedFmt(0)).toBe('+0.00');
    expect(signedFmt(-0)).toBe('+0.00');
    expect(signedFmt(1)).toBe('+1.00');
  });

  it('rounds to two decimals', () => {
    expect(signedFmt(1.234)).toBe('+1.23');
    expect(signedFmt(-1.239)).toBe('-1.24');
  });

  it('renders NaN as "NaN" (legacy: false branch of the ternary is an empty string)', () => {
    expect(signedFmt(Number.NaN)).toBe('NaN');
  });
});

describe('positionEntryColor (render.js:375-382)', () => {
  it('is gray when entryPrice is falsy', () => {
    expect(positionEntryColor(100, undefined)).toBe('#a59eaf');
    expect(positionEntryColor(100, null)).toBe('#a59eaf');
    expect(positionEntryColor(100, 0)).toBe('#a59eaf');
  });

  it('long: profit when last >= entry', () => {
    expect(positionEntryColor(101, 100, 'long')).toBe('#8fb593');
    expect(positionEntryColor(100, 100, 'long')).toBe('#8fb593');
    expect(positionEntryColor(99, 100, 'long')).toBe('#c58e8a');
  });

  it('defaults to long when side is missing or empty', () => {
    expect(positionEntryColor(101, 100)).toBe('#8fb593');
    expect(positionEntryColor(99, 100, '')).toBe('#c58e8a');
  });

  it('short: profit when last <= entry', () => {
    expect(positionEntryColor(99, 100, 'short')).toBe('#8fb593');
    expect(positionEntryColor(100, 100, 'short')).toBe('#8fb593');
    expect(positionEntryColor(101, 100, 'short')).toBe('#c58e8a');
  });

  it('normalizes side case', () => {
    expect(positionEntryColor(99, 100, 'SHORT')).toBe('#8fb593');
    expect(positionEntryColor(101, 100, 'Long')).toBe('#8fb593');
  });

  it('treats unknown side values as long (loss when last < entry)', () => {
    expect(positionEntryColor(101, 100, 'sideways')).toBe('#8fb593');
    expect(positionEntryColor(99, 100, 'sideways')).toBe('#c58e8a');
  });
});

describe('liveAgeText (render.js:383-390 / editor _ageLabel)', () => {
  const NOW = 1_700_000_000_000;

  it('is "now" when ts is missing (legacy ts || now)', () => {
    expect(liveAgeText(undefined, NOW)).toBe('now');
    expect(liveAgeText(null, NOW)).toBe('now');
  });

  it('treats ts=0 as "now" (falsy ts coerced to now)', () => {
    expect(liveAgeText(0, NOW)).toBe('now');
  });

  it('is "now" for ages up to 1s', () => {
    expect(liveAgeText(NOW, NOW)).toBe('now');
    expect(liveAgeText(NOW - 1000, NOW)).toBe('now');
  });

  it('is "now" for future timestamps (age clamped to 0)', () => {
    expect(liveAgeText(NOW + 5000, NOW)).toBe('now');
  });

  it('formats seconds', () => {
    expect(liveAgeText(NOW - 1500, NOW)).toBe('2s ago');
    expect(liveAgeText(NOW - 59_400, NOW)).toBe('59s ago');
  });

  it('formats minutes', () => {
    expect(liveAgeText(NOW - 60_000, NOW)).toBe('1m ago');
    expect(liveAgeText(NOW - 61_000, NOW)).toBe('1m ago');
    expect(liveAgeText(NOW - 3_599_000, NOW)).toBe('59m ago');
  });

  it('formats hours', () => {
    expect(liveAgeText(NOW - 3_600_000, NOW)).toBe('1h ago');
    expect(liveAgeText(NOW - 3_660_000, NOW)).toBe('1h ago');
    expect(liveAgeText(NOW - 7_200_000, NOW)).toBe('2h ago');
    expect(liveAgeText(NOW - 36_000_000, NOW)).toBe('10h ago');
  });

  it('uses the dash translator when a translation is available', () => {
    // like vue-i18n, the translator performs its own {n} substitution
    setDashTranslator((key, params) => (key === 'dash.secondsAgo' ? `${params?.n as number} 秒前` : key));
    expect(liveAgeText(NOW - 5000, NOW)).toBe('5 秒前');
    setDashTranslator(null);
  });
});

describe('positionsStatusText (render.js:391-396)', () => {
  const NOW = 1_700_000_000_000;

  it('prefixes live sources with "Live"', () => {
    expect(positionsStatusText('live', NOW - 5000, NOW)).toBe('Live: 5s ago');
  });

  it('is case-insensitive on source', () => {
    expect(positionsStatusText('LIVE', NOW - 5000, NOW)).toBe('Live: 5s ago');
  });

  it('defaults to db fallback for missing source', () => {
    expect(positionsStatusText(undefined, NOW, NOW)).toBe('DB fallback: now');
    expect(positionsStatusText('', NOW, NOW)).toBe('DB fallback: now');
  });

  it('falls back to db label for unknown sources', () => {
    expect(positionsStatusText('cached', NOW - 60_000, NOW)).toBe('DB fallback: 1m ago');
  });

  it('labels mixed sources', () => {
    expect(positionsStatusText('mixed', NOW - 65_000, NOW)).toBe('Mixed live/DB: 1m ago');
    expect(positionsStatusText('MIXED', NOW - 65_000, NOW)).toBe('Mixed live/DB: 1m ago');
  });
});

describe('live source/badge labels (editor:1048-1062)', () => {
  const NOW = 1_700_000_000_000;

  it('maps sources to labels like editor _sourceLabel', () => {
    expect(liveSourceLabel('live')).toBe('Live');
    expect(liveSourceLabel('LIVE')).toBe('Live');
    expect(liveSourceLabel('mixed')).toBe('Mixed live/DB');
    expect(liveSourceLabel('db')).toBe('DB fallback');
    expect(liveSourceLabel(undefined)).toBe('DB fallback');
    expect(liveSourceLabel('other')).toBe('DB fallback');
  });

  it('builds status text like editor _setSourceStatus', () => {
    expect(liveStatusText('live', NOW - 3000, NOW)).toBe('Live: 3s ago');
    expect(liveStatusText('db', NOW, NOW)).toBe('DB fallback: now');
  });

  it('labels a fresh badge like editor _setBadge', () => {
    expect(liveBadgeText(0, NOW)).toBe('● Live · connecting…');
    expect(liveBadgeText(NOW, NOW)).toBe('● Live · now');
    expect(liveBadgeText(NOW - 7000, NOW)).toBe('● Live · 7s ago');
  });

  afterEach(() => {
    setDashTranslator(null);
  });
});
