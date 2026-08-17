import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ConfigsPanel from './ConfigsPanel.vue';
import type { ConfigSummary } from '../types';

/*
 * ConfigsPanel — the configs list of renderConfigs (:1654-1712): name
 * filter, sortable headers (thSort/setSort :1714-1724), row selection
 * (selectAll/deselect), per-row edit/queue/results actions and the v8
 * strategy column (:1679-1690). The v7 Convert-to-V8 button is M-v7-12.
 */

const i18n = createI18n('en');

function config(overrides: Partial<ConfigSummary> = {}): ConfigSummary {
  return { name: 'cfg', exchanges: ['bybit'], coins: 5, twe_long: 1, twe_short: 0, start_date: '2021-01-01', end_date: '2022-01-01', results: 2, modified: '2026-08-01', ...overrides };
}

function mountPanel(props: Partial<{ configs: ConfigSummary[]; sort: { col: string; asc: boolean }; isV8: boolean }> = {}) {
  return mount(ConfigsPanel, {
    global: { plugins: [i18n] },
    props: { configs: [], sort: { col: 'modified', asc: false }, isV8: false, ...props },
    attachTo: document.body,
  });
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rendering (:1677-1705)', () => {
  it('renders rows with the columns and the version-gated strategy column', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'alpha' }), config({ name: 'beta' })] });
    await nextTick();
    const rows = wrapper.findAll('tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain('alpha');
    expect(rows[0]!.text()).toContain('bybit');
    expect(rows[0]!.text()).toContain('2021-01-01');
    expect(wrapper.text()).not.toContain('strategy-col-header');

    const v8 = mountPanel({ configs: [config()], isV8: true });
    await nextTick();
    expect(v8.find('[data-test="strategy-col-header"]').exists()).toBe(true);
  });

  it('shows the empty state when there are no configs (:1667-1670)', async () => {
    const wrapper = mountPanel({ configs: [] });
    await nextTick();
    expect(wrapper.find('.empty-state').exists()).toBe(true);
  });
});

describe('filter + sort (:1665-1672, :1714-1737)', () => {
  it('filters by name (case-insensitive substring)', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'alpha' }), config({ name: 'beta' })] });
    await nextTick();
    await wrapper.find('[data-test="configs-filter"]').setValue('ALP');
    expect(wrapper.findAll('tbody tr')).toHaveLength(1);
    expect(wrapper.findAll('tbody tr')[0]!.text()).toContain('alpha');
  });

  it('shows the no-match state (:1673-1676)', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'alpha' })] });
    await nextTick();
    await wrapper.find('[data-test="configs-filter"]').setValue('zzz');
    expect(wrapper.text()).toContain('No configs match your search.');
  });

  it('sorts by the clicked column and toggles direction', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'b' }), config({ name: 'a' })] });
    await nextTick();
    await wrapper.find('th[data-col="name"]').trigger('click');
    expect(wrapper.emitted('sort')![0]).toEqual(['name']);
    const sorted = mountPanel({ configs: [config({ name: 'b' }), config({ name: 'a' })], sort: { col: 'name', asc: true } });
    await nextTick();
    expect(sorted.findAll('tbody tr')[0]!.text()).toContain('a');
  });
});

describe('selection (:816-817, :5109-5123)', () => {
  it('select all / deselect toggle the visible rows', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'a' }), config({ name: 'b' })] });
    await nextTick();
    await wrapper.find('[data-test="configs-select-all"]').trigger('click');
    expect(wrapper.findAll('tbody tr.selected')).toHaveLength(2);
    await wrapper.find('[data-test="configs-deselect"]').trigger('click');
    expect(wrapper.findAll('tbody tr.selected')).toHaveLength(0);
  });

  it('clicking a row toggles its selection', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'a' })] });
    await nextTick();
    await wrapper.find('tbody tr').trigger('click');
    expect(wrapper.findAll('tbody tr.selected')).toHaveLength(1);
  });
});

describe('row actions (:1697-1702)', () => {
  it('emits edit / queue / view-results', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'a' })] });
    await nextTick();
    expect(wrapper.find('[data-test="cfg-edit"]').exists()).toBe(true);
    await wrapper.find('[data-test="cfg-edit"]').trigger('click');
    await wrapper.find('[data-test="cfg-queue"]').trigger('click');
    await wrapper.find('[data-test="cfg-results"]').trigger('click');
    expect(wrapper.emitted('edit')![0]).toEqual(['a']);
    expect(wrapper.emitted('queue')![0]).toEqual(['a']);
    expect(wrapper.emitted('view-results')![0]).toEqual(['a']);
  });
});

describe('delete flow (:5109-5123)', () => {
  it('confirming the modal runs the delete with the also-results flag', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'a' })] });
    await nextTick();
    await wrapper.find('tbody tr').trigger('click');
    const run = vi.fn();
    wrapper.vm.deleteSelectedFlow(run);
    await nextTick();
    await wrapper.find('[data-test="configs-delete-confirm"]').trigger('click');
    expect(run).toHaveBeenCalledWith(['a'], false);
    expect(wrapper.findAll('tbody tr.selected')).toHaveLength(0);
  });

  it('emits nothing-selected when the Delete flow runs with no rows picked', async () => {
    const wrapper = mountPanel({ configs: [config({ name: 'a' })] });
    await nextTick();
    wrapper.vm.deleteSelectedFlow(vi.fn());
    await nextTick();
    expect(wrapper.emitted('nothing-selected')).toHaveLength(1);
  });
});
