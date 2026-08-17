import { describe, expect, it } from 'vitest';
import {
  applyMovieDurationAnchor,
  chooseMovieHandoffWindow,
  durationOptions,
  framesForDuration,
  movieDurationPresets,
  movieExportFilename,
  movieExportPresetValues,
  movieStepLabelToMinutes,
  resolveDuration,
} from './movieOptions';

/* Movie Builder duration/step/export option math — ports of :2261-2326,
   :2361-2366, :2433-2447, :2482-2488. */

describe('movieDurationPresets (:2265-2272)', () => {
  it('each preset list starts with Custom (Frames)', () => {
    for (const label of ['1m', '5m', '15m', '1h', '4h', '1d']) {
      expect(movieDurationPresets(label)[0]).toEqual(['Custom (Frames)', null, null]);
    }
  });

  it('1m keeps anchored day-start presets', () => {
    expect(movieDurationPresets('1m').slice(1, 3)).toEqual([
      ['12h (00:00)', 720, 0],
      ['12h (12:00)', 720, 12],
    ]);
  });

  it('unknown step labels fall back to the 30d+ ladder', () => {
    expect(movieDurationPresets('weird').map((p) => p[0])).toEqual([
      'Custom (Frames)',
      '30 days',
      '90 days',
      '180 days',
      '365 days',
    ]);
  });
});

describe('durationOptions + resolveDuration (:2273-2299)', () => {
  it('v8 filters presets of 20000+ minutes (:2278)', () => {
    const v8 = durationOptions('1m', true).map((o) => o.value);
    expect(v8).not.toContain('365 days');
    expect(v8[0]).toBe('Custom (Frames)');
    const v7 = durationOptions('1d', false).map((o) => o.value);
    expect(v7).toContain('365 days');
  });

  it('resolves minutes/anchor for a preset and custom otherwise', () => {
    const options = durationOptions('1m', false);
    expect(resolveDuration(options, '12h (12:00)')).toEqual({ custom: false, minutes: 720, anchor: 12 });
    expect(resolveDuration(options, 'Custom (Frames)')).toEqual({ custom: true, minutes: null, anchor: null });
    // unknown values fall back to Custom
    expect(resolveDuration(options, 'nope')).toEqual({ custom: true, minutes: null, anchor: null });
  });
});

describe('framesForDuration (:2295-2300)', () => {
  it('divides duration minutes by the step with a floor of 2', () => {
    expect(framesForDuration(1440, 240)).toBe(6);
    expect(framesForDuration(1, 240)).toBe(2);
  });
});

describe('movieStepLabelToMinutes (:2301-2303)', () => {
  it('maps labels with a 4h default', () => {
    expect(movieStepLabelToMinutes('1m')).toBe(1);
    expect(movieStepLabelToMinutes('1d')).toBe(1440);
    expect(movieStepLabelToMinutes('?')).toBe(240);
  });
});

describe('chooseMovieHandoffWindow (:2304-2326)', () => {
  it('prefers the smallest overshoot then the smallest step', () => {
    // 12h span with 1m steps: the 720-minute preset is exact
    const choice = chooseMovieHandoffWindow(720);
    expect(choice.stepLabel).toBe('1m');
    expect(choice.durationLabel).toBe('12h (00:00)');
    expect(choice.frames).toBe(720);
    expect(choice.overshoot).toBe(0);
  });

  it('falls back to a custom window for extreme spans', () => {
    const choice = chooseMovieHandoffWindow(60 * 24 * 400); // ~400 days
    expect(choice.durationLabel).toBe('Custom (Frames)');
    expect(choice.frames).toBeLessThanOrEqual(20000);
  });
});

describe('applyMovieDurationAnchor (:2361-2366)', () => {
  it('overrides start_time with the preset anchor', () => {
    const opts = applyMovieDurationAnchor({ custom: false, minutes: 720, anchor: 12 }, { start_date: '2024-01-01', start_time: '00:00' });
    expect(opts.start_time).toBe('12:00');
  });

  it('leaves custom durations and missing dates untouched', () => {
    expect(applyMovieDurationAnchor({ custom: true, minutes: null, anchor: null }, { start_date: '2024-01-01', start_time: '05:00' }).start_time).toBe('05:00');
    expect(applyMovieDurationAnchor({ custom: false, minutes: 720, anchor: 0 }, { start_date: '', start_time: '06:00' }).start_time).toBe('06:00');
  });
});

describe('movieExportPresetValues (:2433-2438)', () => {
  it('maps the three presets and falls back to Custom', () => {
    expect(movieExportPresetValues('Fast')).toMatchObject({ width: 1280, height: 720, crf: 23, ffmpeg_preset: 'ultrafast' });
    expect(movieExportPresetValues('Balanced')).toMatchObject({ width: 1600, height: 800, crf: 18, ffmpeg_preset: 'veryfast' });
    expect(movieExportPresetValues('Quality')).toMatchObject({ width: 1920, height: 1080, crf: 16, ffmpeg_preset: 'fast' });
    expect(movieExportPresetValues('Custom')).toEqual({ preset: 'Custom' });
    expect(movieExportPresetValues('Balanced').codec).toBe('auto');
  });
});

describe('movieExportFilename (:2482-2488)', () => {
  it('joins metadata parts and sanitizes for a filename', () => {
    expect(movieExportFilename({ exchange: 'binance', coin: 'BTC/USDT:USDT', engine: 'pb8_engine', start_time: '2024-01-02 03:04' })).toBe(
      'binance_BTC_USDT_USDT_pb8_engine_2024-01-02_03_04.mp4'
    );
  });

  it('falls back to movie.mp4 without metadata', () => {
    expect(movieExportFilename({})).toBe('movie.mp4');
  });
});
