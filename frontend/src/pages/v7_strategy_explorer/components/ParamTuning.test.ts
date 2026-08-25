import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick, reactive } from 'vue';
import { createI18n } from '@/shared/i18n';
import ParamTuning from './ParamTuning.vue';
import { DEFAULT_SEGMENTS } from '../lib/params';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { ParamFieldMeta } from '../types';

/* The value-relative slider-bounds freeze (2026-08-25 fix): several
   paramBounds branches scale max to the current value (max: v*2), so a
   bounds recomputation on every render let each right-end click double
   the cap — entry_grid_spacing_pct / entry_grid_spacing_we_weight could
   grow without bound. Bounds must derive from the value at first sight
   and only re-derive when a fresh snapshot loads. */

function makeStore(
  initial: Record<string, number>,
  flavor: 'v7' | 'v8' = 'v7',
  optimizeBounds?: Record<string, [number, number]>
): { store: ExplorerStore; config: Record<string, unknown> } {
  const config = reactive<Record<string, unknown>>({
    long: { ...initial },
    short: { ...initial },
    ...(optimizeBounds ? { optimize: { bounds: { long: optimizeBounds } } } : {}),
  });
  const state = reactive({
    longSegment: 'entry_grid',
    shortSegment: 'entry_grid',
    config: config as never,
    snapshot: {} as never,
  });
  const store = {
    state,
    segments: { value: DEFAULT_SEGMENTS },
    fieldMeta: (name: string): ParamFieldMeta => ({ type: 'number' } as ParamFieldMeta),
    paramValueFor: (name: string, sideKey: string): unknown => (state.config as Record<string, Record<string, unknown>>)[sideKey]?.[name],
    setParam: (sideKey: string, name: string, value: unknown): void => {
      (state.config as Record<string, Record<string, unknown>>)[sideKey]![name] = value;
    },
    recalculate: (): void => {},
    adapter: { flavor } as never,
    strategyLabel: { value: 'TEST' },
  } as unknown as ExplorerStore;
  return { store, config };
}

function thumb(wrapper: ReturnType<typeof mount>, name: string) {
  return wrapper.get(`[data-slot="slider-thumb"][aria-label="${name}"]`);
}

describe('ParamTuning slider bounds freeze', () => {
  it('keeps the initial max when the value grows (no doubling cap)', async () => {
    // we_weight 30 → paramBounds gives max = max(20, 30*2) = 60
    const { store } = makeStore({ entry_grid_spacing_we_weight: 30 });
    const wrapper = mount(ParamTuning, {
      props: { store, sideKey: 'long' },
      global: { plugins: [createI18n('en')] },
    });

    expect(thumb(wrapper, 'entry_grid_spacing_we_weight').attributes('aria-valuemax')).toBe('60');

    // the user clicks the right end: value jumps to the cap
    store.setParam('long', 'entry_grid_spacing_we_weight', 60);
    await nextTick();
    // the cap must NOT re-derive to 120 from the new value
    expect(thumb(wrapper, 'entry_grid_spacing_we_weight').attributes('aria-valuemax')).toBe('60');
  });

  it('re-derives bounds when a fresh snapshot loads', async () => {
    const { store } = makeStore({ entry_grid_spacing_we_weight: 30 });
    const wrapper = mount(ParamTuning, {
      props: { store, sideKey: 'long' },
      global: { plugins: [createI18n('en')] },
    });
    expect(thumb(wrapper, 'entry_grid_spacing_we_weight').attributes('aria-valuemax')).toBe('60');

    // a new backtest snapshot arrives with a bigger configured value
    store.state.config = { long: { entry_grid_spacing_we_weight: 100 }, short: {} } as never;
    store.state.snapshot = { id: 'fresh' } as never;
    await nextTick();
    // max = max(20, 100*2) = 200, derived from the newly loaded value
    expect(thumb(wrapper, 'entry_grid_spacing_we_weight').attributes('aria-valuemax')).toBe('200');
  });

  it('freezes the fallback-branch bounds of entry_grid_spacing_pct too', async () => {
    // spacing_pct 0.005 → final fallback branch: max = max(10, 0.01) = 10
    const { store } = makeStore({ entry_grid_spacing_pct: 0.005 });
    const wrapper = mount(ParamTuning, {
      props: { store, sideKey: 'long' },
      global: { plugins: [createI18n('en')] },
    });
    expect(thumb(wrapper, 'entry_grid_spacing_pct').attributes('aria-valuemax')).toBe('10');

    store.setParam('long', 'entry_grid_spacing_pct', 10);
    await nextTick();
    expect(thumb(wrapper, 'entry_grid_spacing_pct').attributes('aria-valuemax')).toBe('10');
  });
});

describe('ParamTuning near-bound hint (:1819-1821)', () => {
  it('renders the badge near a configured v8 optimize bound', async () => {
    const { store } = makeStore({ entry_grid_spacing_we_weight: 60 }, 'v8', {
      entry_grid_spacing_we_weight: [0, 60],
    });
    const wrapper = mount(ParamTuning, {
      props: { store, sideKey: 'long' },
      global: { plugins: [createI18n('en')] },
    });

    const field = wrapper
      .findAll('[data-slot="slider-thumb"]')
      .map((el) => el.attributes('aria-label'))
      .length; // smoke: thumbs render
    expect(field).toBeGreaterThan(0);
    expect(wrapper.text()).toContain('Near upper bound');

    // moving away from the bound clears the badge
    store.setParam('long', 'entry_grid_spacing_we_weight', 30);
    await nextTick();
    expect(wrapper.text()).not.toContain('Near upper bound');
  });
});
