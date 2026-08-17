import { describe, expect, it } from 'vitest';
import { createEditAdapter } from '../config';
import { buildKnownLiveParams } from './liveParams';
import type { EditFormState, ExtraLiveField } from './formModel';
import { collectConfig } from './collectConfig';
import { populateForm } from './populateForm';

/*
 * populate ↔ collect golden parity — the M-v7-1 acceptance contract from the
 * recon: "populate↔collect round-trip vs legacy golden configs (v7 + v8
 * shapes); unknown live.* keys preserved as extra fields". Every expectation
 * below was hand-derived from the legacy code paths
 * (v7_edit.html:2326-2579 populateForm, :2696-2905 collectConfig) — the
 * legacy file is the spec.
 */

const V7_ADAPTER = createEditAdapter('v7');
const V8_ADAPTER = createEditAdapter('v8');

const V7_KNOWN = buildKnownLiveParams('v7', []);
const V8_MANAGED = {
  live: [
    'leverage',
    'margin_mode_preference',
    'limit_order_create_max_market_dist_pct',
    'max_n_cancellations_per_batch',
    'max_n_creations_per_batch',
    'recv_window_ms',
    'startup_phase_budgets',
    'enable_forager_ws_candles',
  ],
  logging: [
    'level',
    'dir',
    'backup_count',
    'live_event_debug_profiles',
    'max_bytes_mb',
    'persist_to_file',
    'rotation',
    'memory_snapshot_interval_minutes',
    'volume_refresh_info_threshold_seconds',
  ],
  monitor: [
    'enabled',
    'root_dir',
    'snapshot_interval_seconds',
    'checkpoint_interval_minutes',
    'event_rotation_mb',
    'event_rotation_minutes',
    'max_total_bytes',
    'price_tick_min_interval_ms',
    'retain_days',
    'compress_rotated_segments',
    'emit_completed_candles',
    'include_raw_fill_payloads',
    'retain_candles',
    'retain_fills',
    'retain_price_ticks',
  ],
};
const V8_KNOWN = buildKnownLiveParams('v8', V8_MANAGED.live);

const GOLDEN_V7_CONFIG = {
  live: {
    user: 'alice',
    leverage: 25,
    minimum_coin_age_days: 3,
    approved_coins: { long: ['BTC', 'ETH'], short: [] },
    ignored_coins: { long: ['ETH'], short: [] },
    my_custom_flag: true,
    another_unknown: { nested: 1 },
  },
  logging: {
    level: 2,
    memory_snapshot_interval_minutes: 15,
    volume_refresh_info_threshold_seconds: 45,
  },
  pbgui: {
    version: 7,
    enabled_on: 'hostA',
    note: 'hi',
    market_cap: 100,
    vol_mcap: 5.5,
    tags: ['DeFi'],
    only_cpt: true,
    notices_ignore: false,
    dynamic_ignore: true,
  },
  bot: {
    long: { n_positions: 5, total_wallet_exposure_limit: 2.5, entries: { x: 1 } },
    short: { n_positions: 1, total_wallet_exposure_limit: 0.5 },
  },
  coin_overrides: { BTC: { long: { auto_unstack: true } } },
  backtest: { starting_balance: 1000 },
  optimize: { rounds: 10 },
  unknown_top: { keep: true },
} as const;

function collectFromPopulated(
  cfg: Record<string, unknown>,
  opts: { isV8: boolean; managed?: typeof V8_MANAGED; extraEdits?: (state: EditFormState, extra: ExtraLiveField[]) => void } = { isV8: false }
): { collected: Record<string, unknown>; state: EditFormState; extra: ExtraLiveField[] } {
  const isV8 = opts.isV8;
  const adapter = isV8 ? V8_ADAPTER : V7_ADAPTER;
  const managed = opts.managed ?? { live: [], logging: [], monitor: [] };
  const known = isV8 ? buildKnownLiveParams('v8', managed.live) : V7_KNOWN;
  const populated = populateForm(cfg, { adapter, known });
  opts.extraEdits?.(populated.state, populated.extraLive);
  const collected = collectConfig(populated.state, {
    adapter,
    cfg: populated.cfg,
    extraLive: populated.extraLive,
    managed,
    coinOverrides: (cfg.coin_overrides as Record<string, unknown>) ?? {},
  });
  return { collected, state: populated.state, extra: populated.extraLive };
}

describe('v7 golden round-trip (populate → collect)', () => {
  const { collected } = collectFromPopulated(GOLDEN_V7_CONFIG as unknown as Record<string, unknown>);

  it('normalizes live.* to the full structured set with legacy defaults', () => {
    expect(collected.live).toEqual({
      user: 'alice',
      leverage: 25,
      margin_mode_preference: 'cross',
      minimum_coin_age_days: 3,
      pnls_max_lookback_days: 30,
      warmup_ratio: 0,
      max_realized_loss_pct: 1,
      initial_entry_exec_max_market_dist_pct: 0.005,
      execution_delay_seconds: 2,
      market_order_near_touch_threshold: 0.001,
      filter_by_min_effective_cost: false,
      market_orders_allowed: true,
      auto_gs: false,
      hedge_mode: false,
      approved_coins: { long: ['BTC'], short: [] },
      ignored_coins: { long: ['ETH'], short: [] },
      max_n_cancellations_per_batch: 5,
      max_n_creations_per_batch: 3,
      fills_recent_overlap_minutes: 10,
      fills_confirmation_overlap_minutes: 60,
      forced_mode_long: '',
      forced_mode_short: '',
      hsl_signal_mode: 'unified',
      hsl_position_during_cooldown_policy: 'panic',
      max_n_restarts_per_day: 10,
      max_disk_candles_per_symbol_per_tf: 1000000,
      max_memory_candles_per_symbol: 200000,
      time_in_force: 'good_till_cancelled',
      inactive_coin_candle_ttl_minutes: 10,
      recv_window_ms: 10000,
      order_match_tolerance_pct: 0.0002,
      balance_override: null,
      balance_hysteresis_snap_pct: 0.02,
      warmup_jitter_seconds: 0,
      warmup_concurrency: 0,
      max_warmup_minutes: 0,
      max_concurrent_api_requests: null,
      defer_broad_candle_warmup: true,
      candle_lock_timeout_seconds: 10,
      enable_archive_candle_fetch: false,
      max_ohlcv_fetches_per_minute: 24,
      market_snapshot_ticker_strategy: 'auto',
      max_active_candle_tail_gap_minutes: 10,
      max_forager_candle_staleness_minutes: null,
      max_forager_candle_refresh_seconds: 45,
      forager_score_hysteresis_pct: 0.02,
      // unknown live.* keys preserved as extra fields (sorted)
      another_unknown: { nested: 1 },
      my_custom_flag: true,
    });
  });

  it('preserves unknown top-level sections via the raw-JSON base (:2697-2702, :2764)', () => {
    expect(collected.unknown_top).toEqual({ keep: true });
    expect(collected.backtest).toEqual({ starting_balance: 1000 });
    expect(collected.optimize).toEqual({ rounds: 10 });
    expect(collected.coin_overrides).toEqual({ BTC: { long: { auto_unstack: true } } });
  });

  it('keeps pbgui round-tripping with the starting_config passthrough (:2819-2831)', () => {
    expect(collected.pbgui).toEqual({
      version: 7,
      enabled_on: 'hostA',
      note: 'hi',
      market_cap: 100,
      vol_mcap: 5.5,
      tags: ['DeFi'],
      only_cpt: true,
      notices_ignore: false,
      dynamic_ignore: true,
      starting_config: false,
      from_backtest_config: undefined,
    });
  });

  it('keeps bot sections with TWE/n_positions driven by the dedicated inputs (:2704-2712)', () => {
    expect(collected.bot).toEqual({
      long: { n_positions: 5, total_wallet_exposure_limit: 2.5, entries: { x: 1 } },
      short: { n_positions: 1, total_wallet_exposure_limit: 0.5 },
    });
  });

  it('collects logging ints and passes monitor through untouched (:2813-2818)', () => {
    expect(collected.logging).toEqual({
      level: 2,
      memory_snapshot_interval_minutes: 15,
      volume_refresh_info_threshold_seconds: 45,
    });
    expect(collected.monitor).toEqual({});
  });
});

describe('v7 round-trip stability', () => {
  it('is idempotent: collect(populate(collected)) === collected', () => {
    const first = collectFromPopulated(GOLDEN_V7_CONFIG as unknown as Record<string, unknown>).collected;
    const second = collectFromPopulated(first).collected;
    expect(second).toEqual(first);
  });

  it('edit a field then collect reflects the edit (form is the source of truth)', () => {
    const { collected } = collectFromPopulated(GOLDEN_V7_CONFIG as unknown as Record<string, unknown>, {
      isV8: false,
      extraEdits: (state) => {
        state.longTwe = '3.3';
        state.maxCancel = '9';
        state.note = 'changed';
        state.ignoredLong = ['ETH', 'BTC'];
      },
    });
    expect((collected.bot as Record<string, Record<string, number>>).long!.total_wallet_exposure_limit).toBe(3.3);
    expect((collected.live as Record<string, unknown>).max_n_cancellations_per_batch).toBe(9);
    expect((collected.pbgui as Record<string, unknown>).note).toBe('changed');
    // ignored wins over approved for BOTH coins now
    expect((collected.live as { approved_coins: { long: string[] } }).approved_coins!.long).toEqual([]);
  });
});

describe('v8 golden round-trip (populate → collect)', () => {
  const GOLDEN_V8_CONFIG = {
    live: {
      user: 'bob',
      strategy_kind: 'neat',
      approved_coins: { long: 'all', short: [] },
      ignored_coins: { long: [], short: ['DOGE'] },
      leverage: 15,
      margin_mode_preference: 'isolated',
      limit_order_create_max_market_dist_pct: 0.007,
      max_n_cancellations_per_batch: 8,
      max_n_creations_per_batch: 6,
      recv_window_ms: 8000,
      v8_extra_string: 'keep-me',
    },
    logging: {
      level: 2,
      dir: 'logs8',
      backup_count: 3,
      live_event_debug_profiles: ['maker'],
      max_bytes_mb: 20,
      persist_to_file: true,
      rotation: false,
      memory_snapshot_interval_minutes: 20,
      volume_refresh_info_threshold_seconds: 40,
    },
    monitor: {
      enabled: true,
      root_dir: 'mon8',
      snapshot_interval_seconds: 2,
      checkpoint_interval_minutes: 11,
      event_rotation_mb: 64,
      event_rotation_minutes: 30,
      max_total_bytes: 536870912,
      price_tick_min_interval_ms: 250,
      retain_days: 3,
      compress_rotated_segments: true,
      emit_completed_candles: false,
      include_raw_fill_payloads: true,
      retain_candles: false,
      retain_fills: true,
      retain_price_ticks: false,
    },
    pbgui: {
      version: 2,
      enabled_on: 'disabled',
      note: '',
      market_cap: 0,
      vol_mcap: 10,
      tags: [],
      only_cpt: false,
      notices_ignore: false,
      dynamic_ignore: true,
    },
    bot: {
      long: { strategy: { neat: { grids: 8 } }, risk: { n_positions: 6, total_wallet_exposure_limit: 1.9 } },
      short: { strategy: { neat: { grids: 2 } }, risk: { n_positions: 0, total_wallet_exposure_limit: 0 } },
    },
    coin_overrides: {},
    backtest: {},
    optimize: {},
  } as unknown as Record<string, unknown>;

  const { collected } = collectFromPopulated(GOLDEN_V8_CONFIG, { isV8: true, managed: V8_MANAGED });

  it('collects only user/strategy_kind/coins/extras/managed live keys (v8 shape, :2854-2863)', () => {
    expect(collected.live).toEqual({
      user: 'bob',
      strategy_kind: 'neat',
      approved_coins: { long: 'all', short: [] },
      ignored_coins: { long: [], short: ['DOGE'] },
      leverage: 15,
      margin_mode_preference: 'isolated',
      limit_order_create_max_market_dist_pct: 0.007,
      max_n_cancellations_per_batch: 8,
      max_n_creations_per_batch: 6,
      recv_window_ms: 8000,
      startup_phase_budgets: {},
      enable_forager_ws_candles: false,
      v8_extra_string: 'keep-me',
    });
  });

  it('aliases limit_order_create… from the price-dist field value (readLiveValue round-trip)', () => {
    const live = collected.live as Record<string, unknown>;
    expect(live.limit_order_create_max_market_dist_pct).toBe(0.007);
    expect('initial_entry_exec_max_market_dist_pct' in live).toBe(false);
  });

  it('keeps only managed logging keys (:2864-2875)', () => {
    expect(collected.logging).toEqual(GOLDEN_V8_CONFIG.logging);
  });

  it('keeps only managed monitor keys (:2876-2896)', () => {
    expect(collected.monitor).toEqual(GOLDEN_V8_CONFIG.monitor);
  });

  it('stamps pbgui.runtime pb8 and preserves dynamic_ignore (:2897-2902)', () => {
    expect((collected.pbgui as Record<string, unknown>).runtime).toBe('pb8');
    expect((collected.pbgui as Record<string, unknown>).dynamic_ignore).toBe(true);
  });

  it('drops dynamic_ignore when the base pbgui never carried it', () => {
    const noDyn = { ...(GOLDEN_V8_CONFIG as Record<string, unknown>) };
    noDyn.pbgui = { ...(GOLDEN_V8_CONFIG.pbgui as Record<string, unknown>) };
    delete (noDyn.pbgui as Record<string, unknown>).dynamic_ignore;
    const result = collectFromPopulated(noDyn, { isV8: true, managed: V8_MANAGED }).collected;
    expect('dynamic_ignore' in (result.pbgui as Record<string, unknown>)).toBe(false);
  });

  it('writes bot params under risk.* and keeps the extracted strategy block', () => {
    expect(collected.bot).toEqual(GOLDEN_V8_CONFIG.bot);
  });

  it('is idempotent across a full v8 round-trip', () => {
    const second = collectFromPopulated(collected, { isV8: true, managed: V8_MANAGED }).collected;
    expect(second).toEqual(collected);
  });
});

describe('collect fallbacks (:2696-2712)', () => {
  it('falls back to an empty base when the raw JSON does not parse', () => {
    const populated = populateForm(GOLDEN_V7_CONFIG as unknown as Record<string, unknown>, {
      adapter: V7_ADAPTER,
      known: V7_KNOWN,
    });
    populated.state.rawJson = '{broken';
    const collected = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg: populated.cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect(collected.unknown_top).toBeUndefined();
    expect((collected.live as Record<string, string>).user).toBe('alice');
  });

  it('falls back to the loaded cfg.bot side when a bot JSON textarea does not parse', () => {
    const populated = populateForm(GOLDEN_V7_CONFIG as unknown as Record<string, unknown>, {
      adapter: V7_ADAPTER,
      known: V7_KNOWN,
    });
    populated.state.longJson = '{broken';
    const collected = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg: GOLDEN_V7_CONFIG as unknown as Record<string, unknown>,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect(collected.bot).toEqual(GOLDEN_V7_CONFIG.bot);
  });

  it('keeps unknown live null values round-tripping through the json extra kind', () => {
    const cfg = { live: { user: 'x', maybe: null, tagsy: ['a'] } } as unknown as Record<string, unknown>;
    const populated = populateForm(cfg, { adapter: V7_ADAPTER, known: V7_KNOWN });
    expect(populated.extraLive.map((f) => [f.key, f.kind])).toEqual([
      ['maybe', 'json'],
      ['tagsy', 'json'],
    ]);
    const collected = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect(collected.live).toMatchObject({ maybe: null, tagsy: ['a'] });
  });

  it('edits to extra fields flow through (number, boolean, string kinds)', () => {
    const cfg = {
      live: { user: 'x', extra_num: 5, extra_flag: false, extra_str: 'a' },
    } as unknown as Record<string, unknown>;
    const populated = populateForm(cfg, { adapter: V7_ADAPTER, known: V7_KNOWN });
    const byKind = new Map(populated.extraLive.map((f) => [f.key, f]));
    byKind.get('extra_num')!.text = '9';
    byKind.get('extra_flag')!.checked = true;
    byKind.get('extra_str')!.text = 'b';
    const collected = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect(collected.live).toMatchObject({ extra_num: 9, extra_flag: true, extra_str: 'b' });
  });

  it('collapses approved coins to canonical all when both sides are bare all', () => {
    const cfg = {
      live: { user: 'x', approved_coins: 'all', ignored_coins: { long: [], short: [] } },
    } as unknown as Record<string, unknown>;
    const populated = populateForm(cfg, { adapter: V7_ADAPTER, known: V7_KNOWN });
    const collected = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect((collected.live as Record<string, unknown>).approved_coins).toBe('all');
  });

  it('collects balance_override only when positive (:2797)', () => {
    const cfg = { live: { user: 'x', balance_override: 500 } } as unknown as Record<string, unknown>;
    const populated = populateForm(cfg, { adapter: V7_ADAPTER, known: V7_KNOWN });
    const withValue = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect((withValue.live as Record<string, unknown>).balance_override).toBe(500);
    populated.state.balOverride = '0';
    const zeroed = collectConfig(populated.state, {
      adapter: V7_ADAPTER,
      cfg,
      extraLive: populated.extraLive,
      managed: { live: [], logging: [], monitor: [] },
    });
    expect((zeroed.live as Record<string, unknown>).balance_override).toBeNull();
  });
});

describe('populate specifics (:2326-2578)', () => {
  it('reads the entry distance through the adapter alias', () => {
    const v7 = populateForm(
      { live: { user: 'x', initial_entry_exec_max_market_dist_pct: 0.012 } } as Record<string, unknown>,
      { adapter: V7_ADAPTER, known: V7_KNOWN }
    );
    expect(v7.state.priceDist).toBe('0.012');
    const v8 = populateForm(
      { live: { user: 'x', limit_order_create_max_market_dist_pct: 0.03 } } as Record<string, unknown>,
      { adapter: V8_ADAPTER, known: V8_KNOWN }
    );
    expect(v8.state.priceDist).toBe('0.03');
  });

  it('always resets apply_filters and clears dynamic_ignore on v8 (:2447-2448)', () => {
    const populated = populateForm(
      { pbgui: { dynamic_ignore: true }, live: { user: 'x' } } as Record<string, unknown>,
      { adapter: V8_ADAPTER, known: V8_KNOWN }
    );
    expect(populated.state.applyFilters).toBe(false);
    expect(populated.state.dynamicIgnore).toBe(false);
  });

  it('writes the raw JSON pretty-printed and reports the extras in sorted order', () => {
    const cfg = { live: { user: 'x', zeta: 1, alpha: 2 } } as Record<string, unknown>;
    const populated = populateForm(cfg, { adapter: V7_ADAPTER, known: V7_KNOWN });
    expect(populated.rawJson).toBe(JSON.stringify(cfg, null, 2));
    expect(populated.extraLive.map((f) => f.key)).toEqual(['alpha', 'zeta']);
  });

  it('skips the raw JSON update when asked (syncEditorFromParsed, :2630)', () => {
    const cfg = { live: { user: 'x' } } as Record<string, unknown>;
    const populated = populateForm(cfg, {
      adapter: V7_ADAPTER,
      known: V7_KNOWN,
      skipRawUpdate: true,
      rawJson: 'keep-me',
    });
    expect(populated.rawJson).toBe('keep-me');
  });

  it('seeds host list with the configured host (populateHosts :2340-2344)', () => {
    const populated = populateForm(
      { pbgui: { enabled_on: 'hostX' }, live: { user: 'x' } } as Record<string, unknown>,
      { adapter: V7_ADAPTER, known: V7_KNOWN }
    );
    expect(populated.state.enabledOn).toBe('hostX');
  });
});
