import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ActionResult from './ActionResult.vue';
import type { TradfiActionResult } from '../../composables/useTradfiMap';

/* ActionResult — legacy renderTradfiActionResult (market_data_main.html
   :5754-5803): the feedback box, detail lines, expandable count groups and
   the close button (:5801-5802 clearTradfiActionResult). */

function mountResult(props: { result: TradfiActionResult; onClose?: () => void }) {
  return mount(ActionResult, {
    props: { onClose: () => undefined, ...props },
    global: { plugins: [createI18n('en')] },
  });
}

describe('renderTradfiActionResult (:5754-5803)', () => {
  it('renders the box with level class, title and detail lines', () => {
    const wrapper = mountResult({
      result: { level: 'success', title: 'Auto-Map completed.', details: ['a', 'b'], groups: [] },
    });
    expect(wrapper.find('.tradfi-feedback').classes()).toContain('success');
    expect(wrapper.find('.tradfi-search-title').text()).toBe('Auto-Map completed.');
    expect(wrapper.findAll('.tradfi-search-meta')).toHaveLength(2);
    expect(wrapper.find('.tradfi-feedback-group').exists()).toBe(false);
  });

  it('renders count groups with an expandable item list (:5782-5799)', () => {
    const wrapper = mountResult({
      result: {
        level: 'warn',
        title: 'T',
        details: [],
        groups: [
          { label: 'Equities', count: 2, items: ['TSLA', 'AAPL'] },
          { label: 'Not found', count: 0, items: [] },
        ],
      },
    });
    const groups = wrapper.findAll('details.tradfi-feedback-group');
    expect(groups).toHaveLength(1); // the empty group renders as a plain line
    expect(groups[0]!.find('.tradfi-feedback-group-title').text()).toBe('Equities: 2');
    expect(groups[0]!.find('.tradfi-feedback-group-hint').text()).toBe('Click to expand');
    expect(groups[0]!.findAll('.tradfi-feedback-group-item').map((i) => i.text())).toEqual([
      'TSLA',
      'AAPL',
    ]);
    const plainLines = wrapper.findAll('.tradfi-feedback > .tradfi-search-meta');
    expect(plainLines.at(-1)?.text()).toBe('Not found: 0');
  });

  it('renders an empty group as a plain summary line (:5784-5786)', () => {
    const wrapper = mountResult({
      result: { level: 'error', title: 'T', details: [], groups: [{ label: 'Skipped', count: 3, items: [] }] },
    });
    expect(wrapper.find('details.tradfi-feedback-group').exists()).toBe(false);
    expect(wrapper.find('.tradfi-search-meta').text()).toBe('Skipped: 3');
  });

  it('closes through the ✕ button (:5801-5802)', async () => {
    const onClose = vi.fn();
    const wrapper = mountResult({
      result: { level: 'success', title: 'T', details: [], groups: [] },
      onClose,
    });
    await wrapper.find('.tradfi-feedback-close').trigger('click');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
