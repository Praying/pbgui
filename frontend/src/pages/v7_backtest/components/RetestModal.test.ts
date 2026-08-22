import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import RetestModal from './RetestModal.vue';

/*
 * RetestModal — retestReplaceSelectedArchive's parameter form
 * (:8095-8159): date mode + last-days fallback window, balance,
 * exchange multi-select, the pbgui-market-data + skip-liquidated
 * checkboxes, and the daily/weekly schedule grid (:8117-8123) with the
 * weekday row appearing only for weekly (:8054-8058).
 */

enableAutoUnmount(afterEach);

const error = vi.fn();

function mountModal(props: Partial<InstanceType<typeof RetestModal>['$props']> = {}) {
  return mount(RetestModal, {
    props: {
      open: true,
      defaults: { days: 10, balance: 750, exchanges: ['bybit'], usePbguiData: false },
      ...props,
    },
    global: { plugins: [createI18n('en')] },
    attrs: {},
  });
}

beforeEach(() => error.mockClear());

describe('RetestModal (:8095-8159)', () => {
  it('seeds the form from the config-derived defaults', () => {
    const wrapper = mountModal();
    expect((wrapper.find('[data-test="arr-date-mode"]').element as HTMLSelectElement).value).toBe('until_yesterday');
    expect((wrapper.find('[data-test="arr-last-days"]').element as HTMLInputElement).value).toBe('10');
    expect((wrapper.find('[data-test="arr-balance"]').element as HTMLInputElement).value).toBe('750');
    expect((wrapper.find('[data-test="arr-exchanges"]').element as HTMLSelectElement).selectedOptions[0]?.value).toBe('bybit');
    expect((wrapper.find('[data-test="arr-skip-liquidated"]').element as HTMLInputElement).checked).toBe(true);
    const marketDataLabel = wrapper.find('label[for="arr-pbgui-data"]');
    expect(marketDataLabel.text()).toBe('Use PBGui Market Data');
    expect(marketDataLabel.find('svg').exists()).toBe(true);
  });

  it('shows the weekday select only for weekly cadence (:8054-8058)', async () => {
    const wrapper = mountModal();
    expect(wrapper.find('[data-test="arr-weekday-wrap"]').attributes('style')).toContain('display: none');
    await wrapper.find('[data-test="arr-cadence"]').setValue('weekly');
    expect(wrapper.find('[data-test="arr-weekday-wrap"]').attributes('style')).not.toContain('display: none');
  });

  it('emits queue-now with the collected payload (:8126-8139)', async () => {
    const wrapper = mountModal({ onError: error });
    await wrapper.find('[data-test="arr-date-mode"]').setValue('last_x_days');
    await wrapper.find('[data-test="arr-last-days"]').setValue('30');
    await wrapper.find('[data-test="arr-balance"]').setValue('2500');
    await wrapper.find('[data-test="arr-ok"]').trigger('click');
    expect(wrapper.emitted('queue-now')).toEqual([
      [
        {
          dateMode: 'last_x_days',
          lastDays: 30,
          balance: 2500,
          exchanges: ['bybit'],
          usePbguiMarketData: false,
          skipLiquidated: true,
        },
      ],
    ]);
    expect(wrapper.emitted('close')).toBeTruthy();
    expect(error).not.toHaveBeenCalled();
  });

  it('emits create-schedule with cadence/time/weekday attached (:8140-8156)', async () => {
    const wrapper = mountModal();
    await wrapper.find('[data-test="arr-cadence"]').setValue('weekly');
    await wrapper.find('[data-test="arr-time"]').setValue('03:30');
    await wrapper.find('[data-test="arr-weekday"]').setValue('4');
    await wrapper.find('[data-test="arr-schedule"]').trigger('click');
    expect(wrapper.emitted('create-schedule')).toEqual([
      [
        {
          dateMode: 'until_yesterday',
          lastDays: 10,
          balance: 750,
          exchanges: ['bybit'],
          usePbguiMarketData: false,
          skipLiquidated: true,
        },
        { cadence: 'weekly', time: '03:30', weekday: 4 },
      ],
    ]);
  });

  it('rejects an empty exchange selection with the legacy toast (:8071)', async () => {
    const wrapper = mountModal({ defaults: { days: 10, balance: 1000, exchanges: [], usePbguiData: true }, onError: error });
    await wrapper.find('[data-test="arr-ok"]').trigger('click');
    expect(error).toHaveBeenCalledWith('Select at least one exchange');
    expect(wrapper.emitted('queue-now')).toBeUndefined();
  });

  it('renders the legacy replacement explainer line verbatim (:8097)', () => {
    const wrapper = mountModal();
    expect(wrapper.text()).toContain('The new backtest always ends at yesterday. Replacement happens only after the new result finished successfully; Git Push stays manual.');
  });

  it('renders nothing when closed', () => {
    const wrapper = mountModal({ open: false });
    expect(wrapper.find('[data-test="retest-modal"]').exists()).toBe(false);
  });
});
