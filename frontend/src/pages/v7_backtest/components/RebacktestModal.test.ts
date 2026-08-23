import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import RebacktestModal from './RebacktestModal.vue';

/*
 * RebacktestModal — the shared parameter popup of rebacktestSelected
 * (:7895-7956), rebacktestSelectedArchive (:7989-8040) and
 * rebacktestSelectedLegacy (:8192-8250): start/end dates, the balance
 * stepper, the exchange multi-select and the pbgui-market-data toggle.
 */

enableAutoUnmount(afterEach);

const error = vi.fn();

function mountModal(props: Partial<InstanceType<typeof RebacktestModal>['$props']> = {}) {
  return mount(RebacktestModal, {
    props: {
      open: true,
      defaults: { start: '2023-01-01', end: '2023-02-01', balance: 500, exchanges: ['bybit', 'okx'], usePbguiData: false },
      ...props,
    },
    global: { plugins: [createI18n('en')] },
  });
}

beforeEach(() => error.mockClear());

describe('RebacktestModal (:7895-7956)', () => {
  it('seeds every field from the defaults', () => {
    const wrapper = mountModal();
    expect((wrapper.find('[data-test="rbt-start"]').element as HTMLInputElement).value).toBe('2023-01-01');
    expect((wrapper.find('[data-test="rbt-end"]').element as HTMLInputElement).value).toBe('2023-02-01');
    expect((wrapper.find('[data-test="rbt-balance"]').element as HTMLInputElement).value).toBe('500');
    const selected = Array.from((wrapper.find('[data-test="rbt-exchanges"]').element as HTMLSelectElement).selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['bybit', 'okx']);
    expect((wrapper.find('[data-test="rbt-pbgui-data"]').element as HTMLInputElement).checked).toBe(false);
    const marketDataLabel = wrapper.find('label[for="rbt-pbgui-data"]');
    expect(marketDataLabel.text()).toBe('Use PBGui Market Data');
    expect(marketDataLabel.find('svg').exists()).toBe(true);
  });

  it('the balance stepper adjusts by 100 and never below 1 (:7904-7905)', async () => {
    const wrapper = mountModal();
    expect(wrapper.find('[data-test="rbt-balance-minus"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="rbt-balance-minus"]').attributes('aria-label')).toBe('Decrease starting balance');
    expect(wrapper.find('[data-test="rbt-balance-plus"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="rbt-balance-plus"]').attributes('aria-label')).toBe('Increase starting balance');
    await wrapper.find('[data-test="rbt-balance-minus"]').trigger('click');
    expect((wrapper.find('[data-test="rbt-balance"]').element as HTMLInputElement).value).toBe('400');
    await wrapper.find('[data-test="rbt-balance-plus"]').trigger('click');
    await wrapper.find('[data-test="rbt-balance-plus"]').trigger('click');
    expect((wrapper.find('[data-test="rbt-balance"]').element as HTMLInputElement).value).toBe('600');
  });

  it('emits confirm with the collected fields', async () => {
    const wrapper = mountModal({ onError: error });
    await wrapper.find('[data-test="rbt-end"]').setValue('2024-06-01');
    await wrapper.find('[data-test="rbt-balance"]').setValue('9000');
    await wrapper.find('[data-test="rbt-pbgui-data"]').setValue(true);
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    expect(wrapper.emitted('confirm')).toEqual([[{ start: '2023-01-01', end: '2024-06-01', balance: 9000, exchanges: ['bybit', 'okx'], usePbguiData: true }]]);
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('rejects an empty exchange selection with the legacy toast (:7926)', async () => {
    const wrapper = mountModal({ defaults: { start: '2023-01-01', end: '2023-02-01', balance: 500, exchanges: [], usePbguiData: false }, onError: error });
    await wrapper.find('[data-test="rbt-ok"]').trigger('click');
    expect(error).toHaveBeenCalledWith('Select at least one exchange');
    expect(wrapper.emitted('confirm')).toBeUndefined();
  });

  it('renders nothing when closed', () => {
    const wrapper = mountModal({ open: false });
    expect(wrapper.find('[data-test="rebacktest-modal"]').exists()).toBe(false);
  });

  it('toggles one exchange per click without clearing the other selections (v1.98.31)', async () => {
    const wrapper = mountModal();
    const select = wrapper.find('[data-test="rbt-exchanges"]').element as HTMLSelectElement;
    const bybit = Array.from(select.options).find((o) => o.value === 'bybit') as HTMLOptionElement;
    const binance = Array.from(select.options).find((o) => o.value === 'binance') as HTMLOptionElement;
    // 已选 bybit + okx；单击已选的 bybit → 仅移除 bybit，okx 保留
    bybit.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await wrapper.vm.$nextTick();
    let selected = Array.from(select.selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['okx']);
    // 单击未选的 binance → 追加，okx 保留
    binance.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    await wrapper.vm.$nextTick();
    selected = Array.from(select.selectedOptions).map((o) => o.value);
    expect(selected).toEqual(['binance', 'okx']); // selectedOptions 按 DOM 顺序
    // v-model 同步了 change 派发
    expect((wrapper.vm as unknown as { exchanges: string[] }).exchanges).toEqual(['binance', 'okx']);
    // 非左键不拦截
    bybit.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(Array.from(select.selectedOptions).map((o) => o.value)).toEqual(['binance', 'okx']);
  });

});
