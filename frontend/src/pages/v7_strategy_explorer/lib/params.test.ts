import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PARAM_FIELD_META,
  DEFAULT_SEGMENTS,
  normalizeParamGroups,
  paramBounds,
  paramFieldPath,
  paramLabel,
  paramNearBound,
  paramValue,
  setParamValue,
} from './params';

/* Parameter segments/metadata/paths — ports of :414-448, :450-466,
   :548-571, :1766-1811. */

describe('DEFAULT_SEGMENTS (:431-439)', () => {
  it('has the seven legacy segments with stable keys', () => {
    expect(DEFAULT_SEGMENTS.map((s) => s.key)).toEqual([
      'entry_grid',
      'entry_trailing',
      'close_grid',
      'close_trailing',
      'risk_state',
      'forager_unstuck',
      'hsl',
    ]);
  });

  it('risk_state includes the wallet exposure and enforcer fields', () => {
    const risk = DEFAULT_SEGMENTS.find((s) => s.key === 'risk_state')!;
    expect(risk.fields).toContain('total_wallet_exposure_limit');
    expect(risk.fields).toContain('risk_wel_enforcer_threshold');
  });
});

describe('normalizeParamGroups (:450-466)', () => {
  it('returns null for non-objects', () => {
    expect(normalizeParamGroups(null)).toBeNull();
    expect(normalizeParamGroups(undefined)).toBeNull();
    expect(normalizeParamGroups('x' as unknown as null)).toBeNull();
  });

  it('accepts the array form and fills key/label defaults', () => {
    const groups = normalizeParamGroups([{ fields: ['a', 'b'] }] as Parameters<typeof normalizeParamGroups>[0]);
    expect(groups).toEqual([{ key: 'group_0', label: 'Group 1', fields: ['a', 'b'] }]);
  });

  it('accepts the server object form (keyed map or {key,fields})', () => {
    const groups = normalizeParamGroups({ grids: ['x'], trail: { label: 'Trailing', fields: ['y'] } });
    expect(groups).toEqual([
      { key: 'grids', label: 'grids', fields: ['x'] },
      { key: 'trail', label: 'Trailing', fields: ['y'] },
    ]);
  });

  it('drops non-string fields and empty groups', () => {
    const groups = normalizeParamGroups([{ key: 'a', fields: ['ok', 5, '', null] as unknown as string[] }, { key: 'b', fields: [] }] as Parameters<typeof normalizeParamGroups>[0]);
    expect(groups).toEqual([{ key: 'a', label: 'a', fields: ['ok'] }]);
  });
});

describe('paramBounds (:548-571)', () => {
  it('honours explicit meta min/max/step', () => {
    expect(paramBounds('custom', 5, { min: 1, max: 3, step: 0.5 })).toEqual({ min: 1, max: 3, step: 0.5 });
  });

  it('n_positions is an integer range 1..50', () => {
    expect(paramBounds('n_positions', 3)).toEqual({ min: 1, max: 50, step: 1 });
  });

  it('total_wallet_exposure_limit steps by 0.05', () => {
    expect(paramBounds('total_wallet_exposure_limit', 4)).toEqual({ min: 0, max: 10, step: 0.05 });
  });

  it('ratio-style fields are -1..1 (:565)', () => {
    expect(paramBounds('entry_trailing_grid_ratio', 0.2)).toEqual({ min: -1, max: 1, step: 0.001 });
    expect(paramBounds('entry_initial_ema_dist', 0.1)).toEqual({ min: -1, max: 1, step: 0.001 });
  });

  it('unstuck_close_pct allows a negative lower bound (:566)', () => {
    expect(paramBounds('unstuck_close_pct', 0.2).min).toBe(-0.5);
    expect(paramBounds('close_grid_qty_pct', 0.2).min).toBe(0);
  });

  it('weight families scale their maxima (:567-569)', () => {
    expect(paramBounds('entry_grid_spacing_volatility_weight', 80)).toEqual({ min: 0, max: 400, step: 1 });
    expect(paramBounds('entry_grid_spacing_we_weight', 4)).toEqual({ min: 0, max: 20, step: 0.01 });
  });

  it('falls back to a 0..max(10, 2v) range', () => {
    expect(paramBounds('something_else', 3)).toEqual({ min: 0, max: 10, step: 0.001 });
  });
});

describe('paramFieldPath (:1772-1779)', () => {
  it('strips bot.<side> prefixes from meta paths', () => {
    expect(paramFieldPath('long', 'entry_spacing_pct', { path: 'bot.long.entry_spacing_pct' })).toEqual({
      global: false,
      path: ['entry_spacing_pct'],
      side: 'long',
    });
  });

  it('flags live.* fields as global', () => {
    const field = paramFieldPath('long', 'live.hsl_signal_mode');
    expect(field.global).toBe(true);
    expect(field.path).toEqual(['live', 'hsl_signal_mode']);
  });

  it('honours meta.global without a live prefix', () => {
    const field = paramFieldPath('short', 'we_ratio', { global: true });
    expect(field.global).toBe(true);
    expect(field.path).toEqual(['we_ratio']);
  });
});

describe('paramValue / setParamValue (:1780-1792)', () => {
  const config = {
    bot: { long: { entry_qty: 5 }, short: { entry_qty: 7 } },
    live: { hsl_signal_mode: 'pside' },
  };

  it('reads side params for non-global fields', () => {
    expect(paramValue(config, { entry_qty: 5 }, 'entry_qty', 'long')).toBe(5);
    // legacy fallback for a missing side param is undefined (:1783), and the
    // global fallback for a missing config path is '' (:1782)
    expect(paramValue(config, {}, 'entry_qty', 'long')).toBeUndefined();
    expect(paramValue({}, {}, 'live.hsl_signal_mode', 'long')).toBe('');
  });

  it('reads global fields from the config root', () => {
    expect(paramValue(config, {}, 'live.hsl_signal_mode', 'long')).toBe('pside');
  });

  it('setParamValue writes under bot.<side> for side fields', () => {
    const cfg: Record<string, unknown> = { bot: { long: {} } };
    setParamValue(cfg, 'long', 'entry_qty', 9);
    expect((cfg.bot as Record<string, unknown>).long).toEqual({ entry_qty: 9 });
  });

  it('setParamValue writes the config root for global fields', () => {
    const cfg: Record<string, unknown> = {};
    setParamValue(cfg, 'long', 'live.hsl_signal_mode', 'unified');
    expect(cfg.live).toEqual({ hsl_signal_mode: 'unified' });
  });
});

describe('paramNearBound (:1793-1811)', () => {
  it('never flags on the v7 flavour', () => {
    expect(paramNearBound('v7', 'long', 'entry_qty', 0, {}, {})).toBe('');
  });

  it('flags values within the 5% tolerance of configured bounds (v8)', () => {
    const config = { optimize: { bounds: { long: { entry_qty: [0, 100] } } } };
    expect(paramNearBound('v8', 'long', 'entry_qty', 3, config, {})).toBe('lower');
    expect(paramNearBound('v8', 'long', 'entry_qty', 98, config, {})).toBe('upper');
    expect(paramNearBound('v8', 'long', 'entry_qty', 50, config, {})).toBe('');
  });

  it('skips global fields and non-finite values', () => {
    expect(paramNearBound('v8', 'long', 'live.hsl_signal_mode', 0, {}, {})).toBe('');
    expect(paramNearBound('v8', 'long', 'entry_qty', NaN, {}, {})).toBe('');
  });
});

describe('paramLabel (:1769-1771)', () => {
  it('uses meta label when present, else the field name', () => {
    expect(paramLabel('custom_field', { label: 'Custom!' })).toBe('Custom!');
    expect(paramLabel('entry_qty')).toBe('entry_qty');
  });
});
