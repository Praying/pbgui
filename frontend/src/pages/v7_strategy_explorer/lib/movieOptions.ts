import type { ExplorerOptions } from '../types';

export type DurationPreset = [label: string, minutes: number | null, anchorHour: number | null];

export interface DurationOption {
  value: string;
  minutes: number | null;
  anchor: number | null;
}

export interface ResolvedDuration {
  custom: boolean;
  minutes: number | null;
  anchor: number | null;
}

/** Step-conditional duration presets (:2265-2272). */
export function movieDurationPresets(stepLabel: string): DurationPreset[] {
  if (stepLabel === '1m')
    return [['Custom (Frames)', null, null], ['12h (00:00)', 720, 0], ['12h (12:00)', 720, 12], ['1 day (00:00)', 1440, 0], ['3 days (00:00)', 4320, 0], ['7 days (00:00)', 10080, 0]];
  if (stepLabel === '5m')
    return [['Custom (Frames)', null, null], ['6h', 360, null], ['12h', 720, null], ['1 day', 1440, null], ['3 days', 4320, null], ['7 days', 10080, null], ['14 days', 20160, null]];
  if (stepLabel === '15m')
    return [['Custom (Frames)', null, null], ['12h', 720, null], ['1 day', 1440, null], ['3 days', 4320, null], ['7 days', 10080, null], ['30 days', 43200, null]];
  if (stepLabel === '1h')
    return [['Custom (Frames)', null, null], ['3 days', 4320, null], ['7 days', 10080, null], ['30 days', 43200, null], ['90 days', 129600, null]];
  if (stepLabel === '4h')
    return [['Custom (Frames)', null, null], ['7 days', 10080, null], ['30 days', 43200, null], ['90 days', 129600, null], ['180 days', 259200, null]];
  return [['Custom (Frames)', null, null], ['30 days', 43200, null], ['90 days', 129600, null], ['180 days', 259200, null], ['365 days', 525600, null]];
}

/** Select options for a step; v8 drops presets needing 20000+ frames (:2273-2285). */
export function durationOptions(stepLabel: string, isV8: boolean): DurationOption[] {
  let presets: DurationPreset[] = movieDurationPresets(stepLabel);
  if (isV8) presets = presets.filter((item) => item[1] === null || Number(item[1]) < 20000);
  return presets.map((item) => ({
    value: item[0],
    minutes: item[1],
    anchor: item[2] === null ? null : Number(item[2]),
  }));
}

/** Resolve the selected option value → custom/minutes/anchor (:2287-2294). */
export function resolveDuration(options: DurationOption[], value: string): ResolvedDuration {
  const opt = options.find((o) => o.value === value) ?? options.find((o) => o.value === 'Custom (Frames)');
  if (!opt || opt.value === 'Custom (Frames)') return { custom: true, minutes: null, anchor: null };
  const minutes = Number(opt.minutes || 0);
  const anchor = opt.anchor === null || opt.anchor === undefined ? null : Number(opt.anchor);
  return { custom: false, minutes, anchor: isFinite(anchor as number) ? anchor : null };
}

/** Preset duration → frame count (:2295-2300). */
export function framesForDuration(minutes: number, stepMins: number): number {
  return Math.max(2, Math.floor(Number(minutes) / Math.max(1, stepMins)));
}

/** Step label → minutes with a 4h default (:2301-2303). */
export function movieStepLabelToMinutes(label: string): number {
  return ({ '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 })[label] || 240;
}

export interface HandoffWindow {
  overshoot: number;
  stepMin: number;
  stepLabel: string;
  durationLabel: string;
  frames: number;
}

/**
 * Pick the step/duration preset that covers a fills.csv span with the least
 * overshoot (ties: the smallest step) (:2304-2326).
 */
export function chooseMovieHandoffWindow(spanMinutes: number): HandoffWindow {
  spanMinutes = Math.max(1, Math.floor(Number(spanMinutes) || 1));
  let best: HandoffWindow | null = null;
  for (const stepLabel of ['1m', '5m', '15m', '1h', '4h', '1d']) {
    const stepMin = movieStepLabelToMinutes(stepLabel);
    for (const item of movieDurationPresets(stepLabel)) {
      const durMin = item[1];
      if (durMin === null || Number(durMin) < spanMinutes) continue;
      const frames = Math.max(2, Math.floor(Number(durMin) / stepMin));
      if (frames > 20000) continue;
      const cand: HandoffWindow = { overshoot: Number(durMin) - spanMinutes, stepMin, stepLabel, durationLabel: item[0], frames };
      if (!best || cand.overshoot < best.overshoot || (cand.overshoot === best.overshoot && cand.stepMin < best.stepMin)) best = cand;
    }
  }
  if (best) return best;
  // Extreme span: custom window around the frame cap
  const targetFrames = 1500;
  let chosen: { stepMin: number; stepLabel: string } = { stepMin: 1440, stepLabel: '1d' };
  for (const choice of [
    { stepMin: 1, stepLabel: '1m' },
    { stepMin: 5, stepLabel: '5m' },
    { stepMin: 15, stepLabel: '15m' },
    { stepMin: 60, stepLabel: '1h' },
    { stepMin: 240, stepLabel: '4h' },
    { stepMin: 1440, stepLabel: '1d' },
  ]) {
    if (Math.ceil(spanMinutes / choice.stepMin) + 2 <= targetFrames) {
      chosen = choice;
      break;
    }
  }
  return {
    overshoot: 0,
    stepMin: chosen.stepMin,
    stepLabel: chosen.stepLabel,
    durationLabel: 'Custom (Frames)',
    frames: Math.min(20000, Math.max(10, Math.ceil(spanMinutes / chosen.stepMin) + 2)),
  };
}

/** Anchor presets override the start hour (:2361-2366). */
export function applyMovieDurationAnchor(duration: ResolvedDuration, opts: ExplorerOptions): ExplorerOptions {
  if (duration.custom || duration.anchor === null || !opts.start_date) return opts;
  return { ...opts, start_time: String(duration.anchor).padStart(2, '0') + ':00' };
}

export interface MovieExportPresetValues {
  preset?: string;
  width?: number;
  height?: number;
  scale?: number;
  crf?: number;
  ffmpeg_preset?: string;
  codec?: string;
}

/** Export preset value maps (:2433-2438). */
export function movieExportPresetValues(name: string): MovieExportPresetValues {
  if (name === 'Fast') return { preset: 'Fast', width: 1280, height: 720, scale: 1, crf: 23, ffmpeg_preset: 'ultrafast', codec: 'auto' };
  if (name === 'Quality') return { preset: 'Quality', width: 1920, height: 1080, scale: 1, crf: 16, ffmpeg_preset: 'fast', codec: 'auto' };
  if (name === 'Balanced') return { preset: 'Balanced', width: 1600, height: 800, scale: 1, crf: 18, ffmpeg_preset: 'veryfast', codec: 'auto' };
  return { preset: 'Custom' };
}

/** Sanitized export filename from movie metadata (:2482-2488). */
export function movieExportFilename(meta: { exchange?: string; coin?: string; engine?: string; start_time?: string } | null): string {
  const m = meta || {};
  const parts = [m.exchange || '', m.coin || '', m.engine || '', m.start_time || ''];
  let raw = parts.filter(Boolean).join('_') || 'movie';
  raw = raw
    .replace(/[\\/:\x00\s]+/g, '_')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (raw || 'movie') + '.mp4';
}
