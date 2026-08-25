import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import KvCoinSources from './KvCoinSources.vue';
import { pickSelectOption } from '@/shared/testing/select';

/*
 * KvCoinSources — the kv chip editor port (v7_backtest.html:3808-4012):
 * coin → exchange map rendered as sorted chips, an exchange select and a
 * coin search dropdown fed by /symbols?exchange= (kvLoadCoins). v7
 * upper-cases coin keys (:3854); v8 preserves identifiers. Used for
 * backtest coin_sources, market_settings_sources and suite
 * scenario coin_sources.
 */

const symbols: Record<string, string[]> = { binance: ['BTC', 'ETH', 'SOL'], bybit: ['DOGE', 'PEPE'] };

function mountKv(props: Record<string, unknown> = {}) {
  return mount(KvCoinSources, {
    global: { plugins: [createI18n('en')] },
    props: {
      modelValue: {},
      exchangeOptions: ['binance', 'bybit'],
      preserveCase: false,
      loadSymbols: (exchange: string) => Promise.resolve({ symbols: symbols[exchange] ?? [] }),
      ...props,
    },
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

describe('chips (:3825-3849)', () => {
  it('renders entries sorted by coin with the exchange prefix and the count', async () => {
    const wrapper = mountKv({ modelValue: { ZEC: 'bybit', BTC: 'binance' } });
    await nextTick();
    const chips = wrapper.findAll('.kv-chip');
    expect(chips.map((c) => c.text())).toEqual(['binance BTC ×', 'bybit ZEC ×']);
    expect(wrapper.find('[data-test="kv-count"]').text()).toContain('2');
  });

  it('removes one chip via × and clears all via × all (:3839-3849, :4000-4005)', async () => {
    const wrapper = mountKv({ modelValue: { BTC: 'binance', ETH: 'binance' } });
    await nextTick();
    await wrapper.findAll('.kv-chip .ms-x')[0]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([{ ETH: 'binance' }]);
    await wrapper.find('[data-test="kv-clear-all"]').trigger('click');
    const emitted = wrapper.emitted('update:modelValue')!;
    expect(emitted[emitted.length - 1]).toEqual([{}]);
  });
});

describe('add via dropdown (:3851-3863, :3942-3994)', () => {
  it('upper-cases and adds on v7, swaps the exchange when the coin exists elsewhere', async () => {
    const wrapper = mountKv({ modelValue: { DOGE: 'bybit' } });
    await nextTick();
    const input = wrapper.find('.ms-input');
    await input.setValue('btc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const option = wrapper.findAll('.ms-option').find((o) => o.text().includes('BTC'))!;
    expect(option.text()).toContain('BTC');
    await option.trigger('mousedown');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([{ DOGE: 'bybit', BTC: 'binance' }]);
  });

  it('marks chips already mapped to another exchange with ⇄ (:3964-3967)', async () => {
    const wrapper = mountKv({ modelValue: { BTC: 'bybit' } });
    await nextTick();
    const input = wrapper.find('.ms-input');
    await input.setValue('BTC');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const option = wrapper.findAll('.ms-option').find((o) => o.text().includes('BTC'))!;
    expect(option.classes()).toContain('in-other');
    expect(option.text()).toContain('@ bybit');
  });

  it('shows no matches for an unknown filter (:3974)', async () => {
    const wrapper = mountKv();
    await nextTick();
    await wrapper.find('.ms-input').setValue('NOSUCH');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(wrapper.find('.ms-dropdown').text()).toContain('No matches');
  });

  it('keeps the coin identifier as typed on v8 (:3854)', async () => {
    const wrapper = mountKv({ preserveCase: true, loadSymbols: () => Promise.resolve({ symbols: ['binance:btcusd'] }) });
    await nextTick();
    await wrapper.find('.ms-input').setValue('btc');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    const option = wrapper.findAll('.ms-option').find((o) => o.text().includes('btcusd'));
    await option!.trigger('mousedown');
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([{ 'binance:btcusd': 'binance' }]);
  });
});

describe('symbol loading (:3881-3940)', () => {
  it('re-uses the cached symbols per exchange and follows the select', async () => {
    const calls: string[] = [];
    const wrapper = mountKv({ loadSymbols: (exchange: string) => (calls.push(exchange), Promise.resolve({ symbols: symbols[exchange] ?? [] })) });
    await nextTick();
    await wrapper.find('.ms-input').setValue('do');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls).toEqual(['binance']);
    await pickSelectOption(wrapper, 'select, [data-slot="select-trigger"]', 'bybit');
    await wrapper.find('.ms-input').setValue('dog');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(calls).toEqual(['binance', 'bybit']);
    expect(wrapper.find('.ms-dropdown').text()).toContain('DOGE');
  });

  it('survives a failing symbols fetch with an empty list (:3936-3939)', async () => {
    const wrapper = mountKv({ loadSymbols: () => Promise.reject(new Error('boom')) });
    await nextTick();
    await wrapper.find('.ms-input').setValue('BTC');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
    expect(wrapper.find('.ms-dropdown').text()).toContain('No matches');
  });
});
