import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { toggleSelectOptions } from '@/shared/testing/select';
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
    expect(wrapper.get('[data-test="rbt-exchanges"]').text()).toBe('bybit, okx');
    expect(wrapper.find('[data-test="rbt-pbgui-data"]').attributes('aria-checked')).toBe('false');
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
    // ui/ Checkbox renders a button with role="checkbox" — click toggles it
    await wrapper.find('[data-test="rbt-pbgui-data"]').trigger('click');
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
    const model = () => (wrapper.vm as unknown as { exchanges: string[] }).exchanges;
    // seeded bybit + okx; choosing the selected bybit removes only bybit, okx stays
    await toggleSelectOptions(wrapper, '[data-test="rbt-exchanges"]', ['bybit']);
    expect(model()).toEqual(['okx']);
    // choosing the unselected binance appends it, okx stays; options keep their own order
    await toggleSelectOptions(wrapper, '[data-test="rbt-exchanges"]', ['binance']);
    expect(model()).toEqual(['binance', 'okx']);
    expect(wrapper.get('[data-test="rbt-exchanges"]').text()).toBe('binance, okx');
  });

});
