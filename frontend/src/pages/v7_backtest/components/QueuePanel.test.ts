import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueuePanel from './QueuePanel.vue';
import type { QueueItem } from '../types';

/*
 * Queue panel — renderQueue (:5136-5177), updateQueueBadge
 * (:5179-5188), row click-to-toggle + drag multi-select (:5787-5844),
 * selectAll/deselectAll (:5846-5851) and deleteSelectedQueue
 * (:5857-5871). Actions start/restart/stop/remove delegate to App
 * via events; the delete flow owns its confirm modal.
 */

const i18n = createI18n('en');

function items(): QueueItem[] {
  return [
    { filename: 'a.json', name: 'alpha', status: 'queued', exchange: ['binance', 'bybit'], created: '2026-01-01T10:00:00Z' },
    { filename: 'b.json', name: 'beta', status: 'running', exchange: 'okx', created: '2026-01-02T10:00:00Z' },
    { filename: 'c.json', name: 'gamma', status: 'backtesting', exchange: 'binance', created: '2026-01-03T10:00:00Z' },
    { filename: 'd.json', name: 'delta', status: 'complete', exchange: 'binance', created: '2026-01-04T10:00:00Z' },
    { filename: 'e.json', name: 'eps', status: 'error', exchange: 'binance', created: '2026-01-05T10:00:00Z' },
  ];
}

function mountPanel(props: Partial<InstanceType<typeof QueuePanel>['$props']> = {}) {
  return mount(QueuePanel, {
    props: { items: items(), ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

function rows(wrapper: ReturnType<typeof mountPanel>) {
  return wrapper.findAll('#queue-list tbody tr');
}

function rowByFilename(wrapper: ReturnType<typeof mountPanel>, filename: string) {
  const row = rows(wrapper).find((r) => r.attributes('data-filename') === filename);
  if (!row) throw new Error('row not found: ' + filename);
  return row;
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('renderQueue (:5136-5177)', () => {
  it('renders the themed queue hierarchy and status summary', () => {
    const wrapper = mountPanel();
    expect(wrapper.find('.queue-workbench-head').text()).toContain('Backtest Queue');
    expect(wrapper.find('[data-queue-stat="queued"]').text()).toBe('1');
    expect(wrapper.find('[data-queue-stat="active"]').text()).toBe('2');
    expect(wrapper.find('[data-queue-stat="complete"]').text()).toBe('1');
    expect(wrapper.find('[data-queue-stat="attention"]').text()).toBe('1');
    expect(wrapper.find('.queue-table').classes()).toContain('min-w-[820px]');
    expect(wrapper.find('[data-test="queue-selected-count"]').text()).toBe('0');
    wrapper.unmount();
  });

  it('renders one row per item with status badges', () => {
    const wrapper = mountPanel();
    const badges = wrapper.findAll('#queue-list .badge');
    // default sort: created descending (:5126)
    expect(badges.map((b) => b.text())).toEqual(['error', 'complete', 'backtesting', 'running', 'queued']);
    expect(badges[0]!.classes()).toContain('badge-error');
    expect(badges[1]!.classes()).toContain('badge-complete');
    expect(badges[2]!.classes()).toContain('badge-backtesting');
    expect(badges[3]!.classes()).toContain('badge-running');
    expect(badges[4]!.classes()).toContain('badge-queued');
    wrapper.unmount();
  });

  it('joins array exchanges (:5156)', () => {
    const wrapper = mountPanel();
    expect(rowByFilename(wrapper, 'a.json').findAll('td')[2]!.text()).toBe('binance, bybit');
    expect(rowByFilename(wrapper, 'b.json').findAll('td')[2]!.text()).toBe('okx');
    wrapper.unmount();
  });

  it('shows the empty state when the queue is empty (:5138-5140)', () => {
    const wrapper = mountPanel({ items: [] });
    expect(wrapper.find('.empty-state').exists()).toBe(true);
    // the emptyQueueHtml key renders its two <br>-split lines without v-html
    expect(wrapper.find('.empty-state').text()).toContain('Queue is empty.');
    expect(wrapper.find('.empty-state').text()).toContain('Add configs to start backtesting.');
    wrapper.unmount();
  });

  it('renders the per-status action buttons (:5159-5172)', () => {
    const wrapper = mountPanel();
    const actionsOf = (filename: string) => rowByFilename(wrapper, filename).findAll('td.actions-cell button');
    // queued → start
    expect(actionsOf('a.json').map((b) => b.attributes('title'))).toContain('Start');
    // running → stop (danger)
    expect(actionsOf('b.json').map((b) => b.attributes('title'))).toContain('Stop');
    // backtesting → stop
    expect(actionsOf('c.json').map((b) => b.attributes('title'))).toContain('Stop');
    // complete → view results
    expect(actionsOf('d.json').map((b) => b.attributes('title'))).toContain('View Results');
    // error → restart
    expect(actionsOf('e.json').map((b) => b.attributes('title'))).toContain('Restart');
    // every row has the log + remove buttons (:5171-5172)
    for (const filename of ['a.json', 'b.json', 'c.json', 'd.json', 'e.json']) {
      const buttons = actionsOf(filename);
      const titles = buttons.map((button) => button.attributes('title'));
      expect(titles).toContain('Remove');
      expect(titles).toContain('Log');
      for (const button of buttons) {
        expect(button.attributes('aria-label')).toBe(button.attributes('title'));
        expect(button.find('svg').exists()).toBe(true);
      }
    }
    wrapper.unmount();
  });

  it('emits the queue actions with the item filename (:5190-5212)', async () => {
    const wrapper = mountPanel();
    const buttons = rowByFilename(wrapper, 'a.json').findAll('td.actions-cell button');
    const start = buttons.find((b) => b.attributes('title') === 'Start')!;
    await start.trigger('click');
    expect(wrapper.emitted('start')).toEqual([['a.json']]);
    const remove = buttons.find((b) => b.attributes('title') === 'Remove')!;
    await remove.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['a.json']]);
    wrapper.unmount();
  });

  it('emits view-results for a complete item and show-log with the filename', async () => {
    const wrapper = mountPanel();
    const complete = rowByFilename(wrapper, 'd.json').findAll('td.actions-cell button');
    await complete.find((b) => b.attributes('title') === 'View Results')!.trigger('click');
    expect(wrapper.emitted('viewResults')).toEqual([['delta']]);
    const log = complete.find((b) => b.attributes('title') === 'Log')!;
    await log.trigger('click');
    expect(wrapper.emitted('showLog')).toEqual([['d.json']]);
    wrapper.unmount();
  });

  it('sorts by the clicked header (:5127-5135, local _queueSort)', async () => {
    const wrapper = mountPanel();
    const nameHeader = wrapper.findAll('#queue-list thead th').find((th) => th.text().startsWith('Name'))!;
    // a NEW column starts descending (:5129) — unlike the configs table
    await nameHeader.trigger('click');
    // name descending: gamma > eps > delta > beta > alpha
    expect(rows(wrapper).map((r) => r.attributes('data-filename'))).toEqual([
      'c.json',
      'e.json',
      'd.json',
      'b.json',
      'a.json',
    ]);
    await nameHeader.trigger('click'); // toggle → ascending
    // alpha < beta < delta < eps < gamma
    expect(rows(wrapper).map((r) => r.attributes('data-filename'))).toEqual([
      'a.json',
      'b.json',
      'd.json',
      'e.json',
      'c.json',
    ]);
    wrapper.unmount();
  });

  it('defaults to newest-first by created (:5126)', () => {
    const wrapper = mountPanel();
    expect(rows(wrapper).map((r) => r.attributes('data-filename'))).toEqual([
      'e.json',
      'd.json',
      'c.json',
      'b.json',
      'a.json',
    ]);
    wrapper.unmount();
  });
});

describe('row selection (:5787-5855)', () => {
  it('a plain click toggles one row (:5838-5840)', async () => {
    const wrapper = mountPanel();
    const row = rowByFilename(wrapper, 'b.json');
    await row.trigger('mousedown');
    await row.trigger('mouseup');
    await nextTick();
    expect(row.classes()).toContain('selected');
    expect(wrapper.vm.selectedFilenames()).toEqual(['b.json']);
    wrapper.unmount();
  });

  it('Enter toggles a focused queue row', async () => {
    const wrapper = mountPanel();
    const row = rowByFilename(wrapper, 'b.json');
    expect(row.attributes('tabindex')).toBe('0');
    await row.trigger('keydown', { key: 'Enter' });
    expect(row.classes()).toContain('selected');
    expect(wrapper.find('[data-test="queue-selected-count"]').text()).toBe('1');
    wrapper.unmount();
  });

  it('select-all / deselect-all operate on the visible rows (:5846-5851)', async () => {
    const wrapper = mountPanel();
    await wrapper.find('[data-test="queue-select-all"]').trigger('click');
    expect(wrapper.vm.selectedFilenames()).toHaveLength(5);
    await wrapper.find('[data-test="queue-deselect-all"]').trigger('click');
    expect(wrapper.vm.selectedFilenames()).toHaveLength(0);
    wrapper.unmount();
  });

  it('a mousedown-drag across rows selects the range (:5809-5834)', async () => {
    const wrapper = mountPanel();
    const list = rows(wrapper);
    await list[0]!.trigger('mousedown');
    // >5px of movement engages range mode; rows hovered while selecting apply
    await wrapper.find('#queue-list').trigger('mousemove', { clientY: 100 });
    await list[2]!.trigger('mouseenter');
    await list[2]!.trigger('mouseup');
    await nextTick();
    expect(wrapper.vm.selectedFilenames()).toEqual(['e.json', 'd.json', 'c.json']);
    wrapper.unmount();
  });

  it('action-cell clicks never change selection (:5817)', async () => {
    const wrapper = mountPanel();
    const cell = rows(wrapper)[0]!.find('td.actions-cell');
    await cell.trigger('mousedown');
    await cell.trigger('mouseup');
    expect(wrapper.vm.selectedFilenames()).toEqual([]);
    wrapper.unmount();
  });
});

describe('deleteSelectedQueue (:5857-5871)', () => {
  it('toasts when nothing is selected (:5859)', async () => {
    const wrapper = mountPanel();
    await wrapper.vm.deleteSelected();
    expect(wrapper.find('#modal-root').exists()).toBe(false);
    expect(wrapper.emitted('nothingSelected')).toHaveLength(1);
    wrapper.unmount();
  });

  it('asks for confirmation, then emits deletes for every selected file', async () => {
    const wrapper = mountPanel();
    const first = rowByFilename(wrapper, 'e.json');
    await first.trigger('mousedown');
    await first.trigger('mouseup');
    const second = rowByFilename(wrapper, 'd.json');
    await second.trigger('mousedown');
    await second.trigger('mouseup');
    await wrapper.vm.deleteSelected();
    await nextTick();
    expect(wrapper.find('#modal-root').exists()).toBe(true);
    const confirmButton = wrapper.findAll('#modal-root .modal-btn').find((b) => b.text() === 'Delete')!;
    await confirmButton.trigger('click');
    const deletes = wrapper.emitted('delete');
    expect(deletes).toEqual([[['e.json', 'd.json']]]);
    expect(wrapper.find('#modal-root').exists()).toBe(false);
    wrapper.unmount();
  });

  it('cancel keeps the queue untouched', async () => {
    const wrapper = mountPanel();
    await rows(wrapper)[0]!.trigger('mousedown');
    await rows(wrapper)[0]!.trigger('mouseup');
    await wrapper.vm.deleteSelected();
    await nextTick();
    const cancel = wrapper.findAll('#modal-root .modal-btn').find((b) => b.text() === 'Cancel')!;
    await cancel.trigger('click');
    expect(wrapper.emitted('delete')).toBeUndefined();
    wrapper.unmount();
  });
});
