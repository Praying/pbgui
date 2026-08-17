import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import ArchivePanel from './ArchivePanel.vue';
import { useArchive } from '../composables/useArchive';
import { useViewState } from '../composables/useViewState';
import type { ResultsStore } from '../composables/useResults';
import type { ArchiveStore } from '../composables/useArchive';

/*
 * ArchivePanel — the DOM port of the archive panel (:875-917): the list
 * view (:8864-8888), the results-view chrome (tabs :884-886, config +
 * coin + text filters :887-895, count label :896, select/deselect/pin
 * :898-900, wrap + resize handle :902-908) and the mode-gated action
 * visibility (:8969-8997, :9131-9146).
 */

enableAutoUnmount(afterEach);

const fetchMock = vi.fn();
const notify = vi.fn();
const wsRefresh = vi.fn();
const chooseMock = vi.fn(async () => 'copy');

function ok(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function fakeResults(): ResultsStore {
  return {
    version: 'v7',
    results: { value: [] },
    dataApi: {
      beForCompare: async () => ({ path: 'p', version: 'v7', be: { time: [], balance: [], equity: [], balance_btc: [], equity_btc: [] } }),
    },
  } as unknown as ResultsStore;
}

function makeStore(): ArchiveStore {
  return useArchive({
    archiveBase: 'http://h:8000/api/backtest-v7',
    version: 'v7',
    t: (key: string, params?: Record<string, unknown>) => i18n.global.t(key, params ?? {}),
    notify,
    getCurrentPanel: () => 'archive',
    view: useViewState({
      version: 'v7',
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } as unknown as Storage,
      history: { replaceState: () => {} },
      initial: { panel: 'archive', sorts: { configs: { col: 'modified', asc: false }, results: { col: 'modified', asc: false }, archive: { col: 'adg', asc: false }, legacy: { col: 'adg', asc: false } } },
    }),
    results: fakeResults(),
    wsRefresh,
    getSettings: () => ({ use_pbgui_market_data: false }),
    getPbguiDataPath: async () => '',
    fetchFn: fetchMock as unknown as typeof fetch,
    confirm: async () => true,
    choose: chooseMock,
  });
}

const i18n = createI18n('en');

function mountPanel(store: ArchiveStore) {
  return mount(ArchivePanel, { props: { archive: store, active: true, version: 'v7' }, global: { plugins: [i18n] }, attachTo: document.body });
}

async function openArchive(store: ArchiveStore, own = true): Promise<void> {
  store.archives.value = [{ name: 'mine', is_own: own, url: 'https://github.com/o/r' }];
  fetchMock.mockImplementation((url: unknown) => {
    const u = String(url);
    if (u.endsWith('/archives/mine/results'))
      return ok({
        results: [
          { path: '/archives/mine/a', config_name: 'alpha', result_name: 'r1', backtest_version: 'v7', adg: 2, coins: ['BTC'], coins_text: 'BTC' },
          { path: '/archives/mine/b', config_name: 'beta', result_name: 'r2', backtest_version: 'v8', adg: 1 },
        ],
        migration_status: { label: 'layout-v2' },
      });
    if (u.endsWith('/optimize-configs')) return ok({ configs: [{ path: 'o1', name: 'opt', optimize_version: 'v7', relative_path: 'x.json' }] });
    if (u.endsWith('/retest-schedules')) return ok({ schedules: [{ id: 's1', cadence: 'daily', time: '02:00', targets: [{}, {}] }], runs: [] });
    return ok({});
  });
  await store.viewArchive('mine');
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(() => ok({}));
  notify.mockClear();
  wsRefresh.mockClear();
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('archive list view (:8864-8888)', () => {
  it('renders the empty state with flattened legacy html (no v-html)', async () => {
    const store = makeStore();
    store.archives.value = [];
    const wrapper = mountPanel(store);
    expect(wrapper.find('#archive-list-view').exists()).toBe(true);
    expect(wrapper.find('#archive-results-view').exists()).toBe(false);
    expect(wrapper.find('[data-test="archive-empty"]').text()).toContain('No archives yet.\nClick + Add Archive to clone one.');
    expect(wrapper.html()).not.toContain('<br>');
  });

  it('renders the name/url/counts/layout/actions columns and opens on dblclick', async () => {
    const store = makeStore();
    store.archives.value = [{ name: 'mine', is_own: true, url: 'https://github.com/o/r', results: 4, optimize_configs: 2, migration_status: { label: 'layout-v2' } }];
    const wrapper = mountPanel(store);
    const row = wrapper.find('#archive-list-container tbody tr');
    expect(row.text()).toContain('mine');
    expect(row.text()).toContain('https://github.com/o/r');
    expect(row.text()).toContain('4');
    expect(row.text()).toContain('2');
    expect(row.text()).toContain('layout-v2');
    await row.trigger('dblclick');
    expect(store.selectedName.value).toBe('mine');
  });
});

describe('archive results chrome (:879-913)', () => {
  it('shows the migration status + counter line and the mode tabs', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    expect(wrapper.find('#archive-layout-status').text()).toBe('layout-v2 · Optimize settings: 1 · Retest schedules: 1');
    expect(wrapper.find('[data-test="arc-tab-backtests"]').text()).toBe('Backtest Results');
    expect(wrapper.find('[data-test="arc-tab-optimize"]').text()).toBe('Optimize Settings');
    expect(wrapper.find('[data-test="arc-tab-schedules"]').text()).toBe('Retest Schedules');
  });

  it('hides the schedules tab for a foreign archive (:9141-9144)', async () => {
    const store = makeStore();
    await openArchive(store, false);
    const wrapper = mountPanel(store);
    expect(wrapper.find('[data-test="arc-tab-schedules"]').attributes('style')).toContain('display: none');
  });

  it('hides the config/coin filters + count + select buttons outside backtests mode (:9053-9057, :9137-9146)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    expect(wrapper.find('#arc-results-config-filter').isVisible()).toBe(true);
    expect(wrapper.find('#arc-results-coin-filter').isVisible()).toBe(true);
    expect(wrapper.find('[data-test="arc-btn-select-all"]').isVisible()).toBe(true);
    store.setMode('optimize');
    await nextTick();
    expect(wrapper.find('#arc-results-config-filter').isVisible()).toBe(false);
    expect(wrapper.find('#arc-results-coin-filter').isVisible()).toBe(false);
    expect(wrapper.find('[data-test="arc-btn-select-all"]').isVisible()).toBe(false);
  });

  it('swaps the search placeholder per mode (:9057)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    expect(wrapper.find('#arc-results-filter').attributes('placeholder')).toBe('Search name…');
    store.setMode('schedules');
    await nextTick();
    expect(wrapper.find('#arc-results-filter').attributes('placeholder')).toBe('Search schedule…');
    store.setMode('optimize');
    await nextTick();
    expect(wrapper.find('#arc-results-filter').attributes('placeholder')).toBe('Search optimize…');
  });

  it('renders the shared results table with the version column and rows', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    const header = wrapper.find('#archive-results-table thead').text();
    expect(header).toContain('Version');
    expect(header).toContain('ADG');
    expect(wrapper.findAll('#archive-results-table tbody tr')).toHaveLength(2);
    expect(wrapper.find('#archive-results-table tbody tr').text()).toContain('PBV7');
  });

  it('shows the archive empty state when no row matches (:9111-9113)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    await wrapper.find('#arc-results-filter').setValue('zzz-no-match');
    await nextTick();
    expect(wrapper.find('#archive-results-table').text()).toContain('No results in this archive.');
  });

  it('select-all / deselect drive the path-keyed selection', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    await wrapper.find('[data-test="arc-btn-select-all"]').trigger('click');
    expect(store.getSelected().sort()).toEqual(['/archives/mine/a', '/archives/mine/b']);
    await wrapper.find('[data-test="arc-btn-deselect"]').trigger('click');
    expect(store.getSelected()).toEqual([]);
  });

  it('drives the unpinned class through the pin button (:6384-6397)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    expect(wrapper.find('#panel-archive').classes()).not.toContain('arc-unpinned');
    await wrapper.find('#archive-results-pin-btn').trigger('click');
    expect(wrapper.find('#panel-archive').classes()).toContain('arc-unpinned');
  });

  it('renders the schedules table with cadence/mode/status columns (:9163-9187)', async () => {
    const store = makeStore();
    await openArchive(store);
    store.setMode('schedules');
    const wrapper = mountPanel(store);
    await nextTick();
    const row = wrapper.find('#archive-results-table tbody tr');
    expect(row.text()).toContain('Daily 02:00');
    expect(row.text()).toContain('2');
    expect(row.text()).toContain('Same length → yesterday');
    expect(wrapper.find('[data-test="archive-sched-run"]').exists()).toBe(true);
  });

  it('renders the optimize-configs table with a selectable, dblclickable row (:9243-9266)', async () => {
    const store = makeStore();
    await openArchive(store);
    store.setMode('optimize');
    const wrapper = mountPanel(store);
    await nextTick();
    const row = wrapper.find('#archive-results-table tbody tr[data-path="o1"]');
    expect(row.text()).toContain('opt');
    expect(row.text()).toContain('V7'); // the owner column (:9249)
    expect(row.attributes('title')).toContain('Double-click');
    await row.trigger('dblclick');
    expect(store.selectedOptimize.value).toMatchObject({ path: 'o1', name: 'opt', version: 'v7' });
  });

  it('closes back to the list view (:8922-8948)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    store.closeArchive();
    await nextTick();
    expect(store.selectedName.value).toBe('');
    expect(wrapper.find('#archive-list-view').exists()).toBe(true);
  });
});

describe('review round 1 fixes', () => {
  it('flattens the html-carrying confirm keys — no literal <b>/<br> reaches the user (Fix 3)', async () => {
    const store = makeStore();
    await openArchive(store);
    const wrapper = mountPanel(store);
    const vm = wrapper.vm as unknown as {
      openDeleteResults(): void;
      openCleanup(kind: 'liquidated' | 'duplicates'): Promise<void>;
      openDeleteOptimize(): void;
    };
    // delete-archive confirm (list-view trash)
    store.closeArchive();
    await nextTick();
    await wrapper.find('#archive-list-container .act-btn-danger').trigger('click');
    await nextTick();
    const archiveModal = wrapper.find('[data-test="delete-archive-modal"]');
    expect(archiveModal.text()).toContain('Delete archive mine from disk?\nThis cannot be undone.');
    expect(archiveModal.html()).not.toContain('<b>');
    await wrapper.find('[data-test="delete-archive-modal"] .modal-btn').trigger('click'); // cancel

    // delete-results confirm
    await store.viewArchive('mine');
    store.selectedPaths.value = new Set(['/archives/mine/a']);
    vm.openDeleteResults();
    await nextTick();
    const resultsModal = wrapper.find('[data-test="delete-archive-results-modal"]');
    expect(resultsModal.text()).toContain('Delete 1 result(s) from archive mine?');
    expect(resultsModal.html()).not.toContain('<b>');
    await wrapper.find('[data-test="delete-archive-results-modal"] .modal-btn').trigger('click'); // cancel

    // remove-liquidated preview confirm (dry-run fixture)
    fetchMock.mockImplementationOnce(() => ok({ items: [{ path: '/archives/mine/a', reason: 'liq' }] }));
    await vm.openCleanup('liquidated');
    await nextTick();
    const liquidatedModal = wrapper.find('[data-test="cleanup-liquidated-modal"]');
    expect(liquidatedModal.text()).toContain('Remove 1 liquidated archive result(s) from mine?');
    expect(liquidatedModal.html()).not.toContain('<b>');
    await wrapper.find('[data-test="cleanup-liquidated-modal"] .modal-btn').trigger('click'); // cancel

    // delete-optimize confirm
    store.setMode('optimize');
    store.selectedOptimize.value = { path: 'o1', name: 'opt', version: 'v7' };
    await nextTick();
    vm.openDeleteOptimize();
    await nextTick();
    const optimizeModal = wrapper.find('[data-test="delete-optimize-modal"]');
    expect(optimizeModal.text()).toContain('Delete archived Optimize config opt from mine?');
    expect(optimizeModal.html()).not.toContain('<b>');

    // remove-duplicates shares the treatment (same builder)
    fetchMock.mockImplementationOnce(() => ok({ items: [{ path: '/archives/mine/a', keep_path: '/archives/mine/b' }] }));
    await vm.openCleanup('duplicates');
    await nextTick();
    expect(wrapper.find('[data-test="cleanup-duplicates-modal"]').html()).not.toContain('<b>');
  });

  it('the rename/cleanup/delete-optimize flows gate on own-archive (:6088, :6125, :9408)', async () => {
    const store = makeStore();
    await openArchive(store, false);
    const wrapper = mountPanel(store);
    const vm = wrapper.vm as unknown as {
      openRename(): void;
      openCleanup(kind: 'liquidated' | 'duplicates'): Promise<void>;
      openDeleteOptimize(): void;
    };
    store.selectedPaths.value = new Set(['/archives/mine/a']);
    store.selectedOptimize.value = { path: 'o1', name: 'opt', version: 'v7' };
    vm.openRename();
    expect(notify).toHaveBeenCalledWith('Rename is only available for your own archive', 'err');
    await vm.openCleanup('liquidated');
    expect(notify).toHaveBeenCalledWith('Liquidated cleanup is only available for your own archive', 'err');
    vm.openDeleteOptimize();
    expect(notify).toHaveBeenCalledWith('Optimize config deletion is only available for your own archive', 'err');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/remove-liquidated'))).toBe(false);
  });
});
