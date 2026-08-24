import { mount } from '@vue/test-utils';
import { reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createI18n } from '@/shared/i18n';
import ExchangeStatePanel from './ExchangeStatePanel.vue';
import type { ExplorerStore } from '../composables/useStrategyExplorer';

/*
 * Exchange/State panel contracts: the debug accordion actually toggles, the
 * reset button clears overrides and re-enables autofill, and stepper
 * tooltips resolve through i18n (not the English FIELD_TOOLTIPS dict).
 */

function makeStore() {
  return {
    state: reactive({
      snapshot: {
        market: { metadata: { market_metadata: { derived: { min_cost_from_limits: { cost: { min: 0.01 } } } } } },
        config: { backtest: { starting_balance: 1500 } },
        sides: {
          long: {
            debug: {
              exchange_params: { min_cost: 0.01, price_step: 0.001, min_qty: 0.001, qty_step: 0.001, c_mult: 1 },
              state_params: { balance: 1500, entry_volatility_logrange_ema_1h: 0.01 },
            },
          },
        },
      },
      exchangeParamOverrides: {},
      stateParamOverrides: {},
      autoExchangeParams: true,
    }),
    controls: reactive({ balance: 1500 }),
    strategyLabel: ref('PB7'),
    recalculate: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExplorerStore;
}

function mountPanel(store: ExplorerStore, lang: 'en' | 'zh' = 'en') {
  return mount(ExchangeStatePanel, {
    props: { store },
    global: { plugins: [createI18n(lang)] },
  });
}

describe('ExchangeStatePanel', () => {
  it('renders steppers from the snapshot debug params', () => {
    const wrapper = mountPanel(makeStore());

    expect((wrapper.get('#ep-min-cost').element as HTMLInputElement).value).toBe('0.01');
    expect((wrapper.get('#state-balance').element as HTMLInputElement).value).toBe('1500');
  });

  it('expands and collapses the debug data sources accordion', async () => {
    const wrapper = mountPanel(makeStore());
    const card = wrapper.get('.accordion-card');

    expect(card.classes()).toContain('collapsed');

    await wrapper.get('.accordion-head').trigger('click');

    expect(card.classes()).not.toContain('collapsed');

    await wrapper.get('.accordion-head').trigger('click');

    expect(card.classes()).toContain('collapsed');
  });

  it('clears overrides, re-enables autofill and recalculates on reset', async () => {
    const store = makeStore();
    store.state.exchangeParamOverrides = { min_cost: 5 };
    store.state.autoExchangeParams = false;
    const wrapper = mountPanel(store);

    await wrapper.get('#btn-reset-exchange-params').trigger('click');

    expect(store.state.exchangeParamOverrides).toEqual({});
    expect(store.state.autoExchangeParams).toBe(true);
    expect(store.recalculate).toHaveBeenCalledTimes(1);
  });

  it('writes stepper edits into the matching override slot', async () => {
    const store = makeStore();
    const wrapper = mountPanel(store);

    const input = wrapper.get('#ep-min-cost');
    (input.element as HTMLInputElement).value = '5';
    await input.trigger('change');

    expect(store.state.exchangeParamOverrides.min_cost).toBe(5);
    expect(store.recalculate).toHaveBeenCalledTimes(1);
  });

  it('resolves stepper tooltips through i18n in Chinese', () => {
    const wrapper = mountPanel(makeStore(), 'zh');

    const tip = wrapper.get('label[for="ep-min-cost"]').attributes('data-tip');
    expect(tip).toBe('交易所接受的最小下单金额。用于 Rust 订单数量调整和最小有效金额检查。');
    expect(tip).not.toMatch(/^[A-Za-z]/);
  });
});
