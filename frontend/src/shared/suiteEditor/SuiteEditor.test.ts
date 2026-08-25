import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import SuiteEditor from './SuiteEditor.vue';
import type { SuiteState } from './suiteModel';
import { pickSelectOption } from '@/shared/testing/select';

/*
 * SuiteEditor — the component port of js/suite_editor.js (975 L): the
 * enable toggle (:508-516), templates (:518-546), the scenarios table
 * with edit/remove/move (:558-647), the scenario editor form
 * (:650-696), overrides (:698-798) and aggregate settings (:861-953).
 */

const i18n = createI18n('en');

function state(overrides: Partial<SuiteState> = {}): SuiteState {
  return { enabled: false, scenarios: [], editIdx: -1, aggregate: { default: 'mean' }, ...overrides };
}

function mountSuite(props: Record<string, unknown> = {}) {
  return mount(SuiteEditor, {
    global: { plugins: [i18n] },
    props: {
      modelValue: state(),
      exchanges: ['binance', 'bybit', 'okx'],
      availableCoins: ['BTC', 'ETH', 'DOGE'],
      botParams: ['total_wallet_exposure_limit', 'n_positions'],
      isV8: false,
      exchangeOptions: ['binance', 'bybit'],
      loadSymbols: () => Promise.resolve({ symbols: ['BTC', 'ETH'] }),
      ...props,
    },
  });
}

function current(wrapper: ReturnType<typeof mountSuite>): SuiteState {
  return wrapper.emitted('update:modelValue')!.slice(-1)[0]![0] as SuiteState;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('enable toggle (:508-516)', () => {
  it('renders collapsed when disabled', () => {
    const wrapper = mountSuite();
    expect(wrapper.find('#suite-enabled').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('+ Add Scenario');
  });

  it('enabling seeds a base scenario; the header shows the scenario count', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'base' }] }) });
    expect(wrapper.find('[data-test="suite-header"]').text()).toContain('1');
    expect(wrapper.find('[data-test="suite-header"]').text()).toContain('ENABLED');
    const fresh = mountSuite();
    await fresh.find('#suite-enabled').trigger('click');
    expect(current(fresh).scenarios).toEqual([{ label: 'base' }]);
  });

  it('unchecking stays unchecked and visible: the header only folds, it never re-enables', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'base' }] }) });
    expect(wrapper.find('[data-test="suite-expander"]').classes()).toContain('open');

    await wrapper.find('#suite-enabled').trigger('click');
    expect(current(wrapper).enabled).toBe(false);
    // unchecking no longer folds the card away with the toggle inside it
    expect(wrapper.find('[data-test="suite-expander"]').classes()).toContain('open');
    expect(wrapper.find('#suite-enabled').attributes('data-state')).toBe('unchecked');

    // the header is a pure fold toggle now — it never flips enabled
    await wrapper.find('[data-test="suite-header"]').trigger('click');
    expect(wrapper.find('[data-test="suite-expander"]').classes()).not.toContain('open');
    expect(current(wrapper).enabled).toBe(false);
    await wrapper.find('[data-test="suite-header"]').trigger('click');
    expect(wrapper.find('[data-test="suite-expander"]').classes()).toContain('open');
    expect(current(wrapper).enabled).toBe(false);

    // re-checking works through the same header toggle
    await wrapper.find('#suite-enabled').trigger('click');
    expect(current(wrapper).enabled).toBe(true);
  });
});

describe('templates (:518-546)', () => {
  it('applies a template and emits the exchanges the base config still needs', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'base' }] }) });
    await wrapper.find('[data-test="suite-template-Exchange Comparison"]').trigger('click');
    const next = current(wrapper);
    expect(next.scenarios.map((s) => s.label)).toEqual(['binance_only', 'bybit_only']);
    expect(next.aggregate).toEqual({ default: 'mean' });
    expect(wrapper.emitted('template-exchanges')![0]).toEqual([['binance', 'bybit']]);
  });

  it('resets to a single base scenario (:549-556)', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'a' }, { label: 'b' }], aggregate: { default: 'max' } }) });
    await wrapper.find('[data-test="suite-reset"]').trigger('click');
    expect(current(wrapper)).toMatchObject({ scenarios: [{ label: 'base' }], aggregate: { default: 'mean' }, editIdx: -1 });
  });
});

describe('scenario CRUD (:611-647)', () => {
  it('adds a scenario and opens it for editing', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'base' }] }) });
    await wrapper.find('[data-test="suite-add-scenario"]').trigger('click');
    const next = current(wrapper);
    expect(next.scenarios).toHaveLength(2);
    expect(next.scenarios[1]!.label).toBe('scenario_2');
    expect(next.editIdx).toBe(1);
  });

  it('removes and reindexes editIdx (:629-635)', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'a' }, { label: 'b' }, { label: 'c' }], editIdx: 2 }) });
    await wrapper.findAll('[data-test="suite-remove"]')[0]!.trigger('click');
    expect(current(wrapper).scenarios.map((s) => s.label)).toEqual(['b', 'c']);
    expect(current(wrapper).editIdx).toBe(1);
  });

  it('moves a scenario up/down (:637-647)', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'a' }, { label: 'b' }] }) });
    await wrapper.find('[data-test="suite-move-down-0"]').trigger('click');
    expect(current(wrapper).scenarios.map((s) => s.label)).toEqual(['b', 'a']);
  });
});

describe('scenario editor (:650-696, :800-859)', () => {
  it('edits label/dates/exchanges and commits on Done', async () => {
    const wrapper = mountSuite({
      modelValue: state({ enabled: true, scenarios: [{ label: 's1', start_date: '2024-01-01' }], editIdx: 0 }),
    });
    expect((wrapper.find('[data-test="suite-sc-label"]').element as HTMLInputElement).value).toBe('s1');
    await wrapper.find('[data-test="suite-sc-label"]').setValue('renamed');
    await wrapper.find('[data-test="suite-sc-ex-binance"]').trigger('click');
    await wrapper.find('[data-test="suite-done"]').trigger('click');
    const next = current(wrapper);
    expect(next.scenarios[0]).toMatchObject({ label: 'renamed', exchanges: ['binance'], start_date: '2024-01-01' });
    expect(next.editIdx).toBe(-1);
  });

  it('drops empty optional fields from the committed scenario (:813-823)', async () => {
    const wrapper = mountSuite({
      modelValue: state({ enabled: true, scenarios: [{ label: 's', start_date: '', end_date: '' }], editIdx: 0 }),
    });
    await wrapper.find('[data-test="suite-done"]').trigger('click');
    const scenario = current(wrapper).scenarios[0]!;
    expect(scenario).not.toHaveProperty('start_date');
    expect(scenario).not.toHaveProperty('end_date');
    expect(scenario).not.toHaveProperty('exchanges');
  });
});

describe('overrides (:698-798)', () => {
  function editingWrapper() {
    return mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 's' }], editIdx: 0 }) });
  }

  it('adds an override with the parsed value and the dotted bot path (:763-783)', async () => {
    const wrapper = editingWrapper();
    await wrapper.find('[data-test="suite-add-override"]').trigger('click');
    await pickSelectOption(wrapper, '[data-test="suite-ov-side"]', 'short');
    await pickSelectOption(wrapper, '[data-test="suite-ov-param"]', 'n_positions');
    await wrapper.find('[data-test="suite-ov-value"]').setValue('7');
    await wrapper.find('[data-test="suite-ov-confirm"]').trigger('click');
    expect(current(wrapper).scenarios[0]!.overrides).toEqual({ 'bot.short.n_positions': 7 });
  });

  it('parses true/false and keeps strings (:771-775)', async () => {
    const wrapper = editingWrapper();
    await wrapper.find('[data-test="suite-add-override"]').trigger('click');
    await pickSelectOption(wrapper, '[data-test="suite-ov-param"]', 'total_wallet_exposure_limit');
    await wrapper.find('[data-test="suite-ov-value"]').setValue('true');
    await wrapper.find('[data-test="suite-ov-confirm"]').trigger('click');
    expect(current(wrapper).scenarios[0]!.overrides).toEqual({ 'bot.long.total_wallet_exposure_limit': true });

    await wrapper.find('[data-test="suite-add-override"]').trigger('click');
    await pickSelectOption(wrapper, '[data-test="suite-ov-param"]', 'n_positions');
    await wrapper.find('[data-test="suite-ov-value"]').setValue('custom');
    await wrapper.find('[data-test="suite-ov-confirm"]').trigger('click');
    expect(current(wrapper).scenarios[0]!.overrides).toMatchObject({ 'bot.long.n_positions': 'custom' });
  });

  it('removes an override (:785-793)', async () => {
    const wrapper = mountSuite({
      modelValue: state({ enabled: true, scenarios: [{ label: 's', overrides: { 'bot.long.n_positions': 5 } }], editIdx: 0 }),
    });
    await wrapper.find('[data-test="suite-ov-remove"]').trigger('click');
    expect(current(wrapper).scenarios[0]).not.toHaveProperty('overrides');
  });
});

describe('foldDraft — suiteCollect auto-save (:183-184, called at :4769)', () => {
  it('commits open scenario edits into the model without closing the editor', async () => {
    const wrapper = mountSuite({
      modelValue: state({ enabled: true, scenarios: [{ label: 'old' }], editIdx: 0 }),
    });
    await nextTick();
    await wrapper.find('[data-test="suite-sc-label"]').setValue('typed mid-flight');
    wrapper.vm.foldDraft();
    await nextTick();
    const next = current(wrapper);
    expect(next.scenarios[0]!.label).toBe('typed mid-flight');
    expect(next.editIdx).toBe(0); // still editing — collect never closes
  });

  it('is a no-op when no scenario is open', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'a' }], editIdx: -1 }) });
    await nextTick();
    wrapper.vm.foldDraft();
    await nextTick();
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });
});

describe('aggregate (:861-953)', () => {
  it('changes the default method and adds/removes per-metric overrides', async () => {
    const wrapper = mountSuite({ modelValue: state({ enabled: true, scenarios: [{ label: 'base' }] }) });
    await pickSelectOption(wrapper, '[data-test="suite-agg-default"]', 'max');
    expect(current(wrapper).aggregate).toEqual({ default: 'max' });

    await wrapper.find('[data-test="suite-agg-add"]').trigger('click');
    await pickSelectOption(wrapper, '[data-test="suite-agg-sel"]', 'drawdown_worst_strategy_eq');
    await pickSelectOption(wrapper, '[data-test="suite-agg-method"]', 'min');
    await wrapper.find('[data-test="suite-agg-confirm"]').trigger('click');
    expect(current(wrapper).aggregate).toEqual({ default: 'max', drawdown_worst_strategy_eq: 'min' });

    await wrapper.find('[data-test="suite-agg-remove"]').trigger('click');
    expect(current(wrapper).aggregate).toEqual({ default: 'max' });
  });
});
