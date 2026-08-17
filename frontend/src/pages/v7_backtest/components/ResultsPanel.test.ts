import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ResultsPanel from './ResultsPanel.vue';
import { useResults, type ResultsStore } from '../composables/useResults';

/*
 * ResultsPanel — the results view chrome of :834-869: version/config/text
 * toolbar, count label (:5493-5503), the sticky pin (:6415-6419), the
 * list resize handle, the compare area and the charts area. Takes the
 * results store as its single prop (App owns the store).
 */

enableAutoUnmount(afterEach);

const fetchMock = vi.fn();
const notify = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

const i18n = createI18n('en');

function makeStore(version: 'v7' | 'v8' = 'v7', panel = 'results'): ResultsStore {
  return useResults({
    apiBase: `http://h:8000/api/backtest-${version}`,
    version,
    t: (key, params) => i18n.global.t(key, params ?? {}),
    notify,
    getCurrentPanel: () => panel,
    fetchFn: fetchMock as unknown as typeof fetch,
  });
}

async function loadedStore(): Promise<ResultsStore> {
  const store = makeStore();
  fetchMock.mockImplementationOnce(() =>
    ok({
      results: [
        { path: 'p1', config_name: 'alpha', result_name: 'r1', modified: '2024-01-01T00:00:00Z' },
        { path: 'p2', config_name: 'beta', result_name: 'r2', modified: '2024-01-02T00:00:00Z' },
      ],
    })
  );
  await store.loadResults();
  return store;
}

function mountPanel(store: ResultsStore, props: Record<string, unknown> = {}) {
  return mount(ResultsPanel, {
    props: { results: store, versionBoundActions: false, ...props },
    global: { plugins: [i18n] },
    attachTo: document.body,
  });
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(() => ok({ results: [] }));
  notify.mockClear();
  document.body.innerHTML = '';
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('toolbar (:837-852)', () => {
  it('renders the version/config filters, search box and select-all controls', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    const versionOptions = wrapper.findAll('#results-version-filter option');
    expect(versionOptions.map((o) => o.attributes('value'))).toEqual(['v7', 'v8', 'both']);
    const configOptions = wrapper.findAll('#results-config-filter option');
    expect(configOptions.map((o) => o.attributes('value'))).toEqual(['', 'alpha', 'beta']);
    expect(wrapper.find('#results-filter').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-select-all"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-deselect"]').exists()).toBe(true);
  });

  it('changing the version filter reloads through the store (:839)', async () => {
    const store = await loadedStore();
    fetchMock.mockClear();
    const wrapper = mountPanel(store);
    await wrapper.find('#results-version-filter').setValue('both');
    expect(store.versionFilter.value).toBe('both');
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toEqual(expect.arrayContaining(['http://h:8000/api/backtest-v7/results', 'http://h:8000/api/backtest-v8/results']));
  });

  it('the config filter and search wire into the store and update the count label', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    // legacy quirk kept: shown + ' ' + '{n} results' (:5499) doubles the count
    expect(wrapper.find('#results-count-label').text()).toBe('2 2 results');
    await wrapper.find('#results-config-filter').setValue('alpha');
    expect(store.configFilter.value).toBe('alpha');
    expect(wrapper.find('#results-count-label').text()).toBe('Showing 1 of 2 2 results');
    await wrapper.find('#results-filter').setValue('zzz');
    expect(wrapper.find('#results-count-label').text()).toBe('Showing 0 of 2 2 results');
  });

  it('select-all selects the visible rows only; deselect clears (:849-850)', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    await wrapper.find('#results-config-filter').setValue('alpha');
    await wrapper.find('[data-test="results-select-all"]').trigger('click');
    expect(store.getSelected()).toEqual(['p1']);
    await wrapper.find('[data-test="results-deselect"]').trigger('click');
    expect(store.getSelected()).toEqual([]);
  });

  it('the pin button toggles the sticky table (:6415-6419)', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    const top = wrapper.find('#results-fixed-top');
    expect(top.classes()).toContain('sticky');
    await wrapper.find('#results-pin-btn').trigger('click');
    expect(top.classes()).not.toContain('sticky');
  });
});

describe('table area (:853-859)', () => {
  it('shows the checking state while the retry ladder waits (:5400)', async () => {
    const store = makeStore();
    void store.loadResults().catch(() => undefined);
    await vi.waitFor(() => expect(store.checking.value).toBe(true));
    const wrapper = mountPanel(store);
    expect(wrapper.find('#results-list').text()).toContain('Checking for results');
    store.dispose();
  });

  it('renders the results table rows', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    expect(wrapper.findAll('#results-list tbody tr')).toHaveLength(2);
    expect(wrapper.find('#results-list').text()).toContain('alpha');
  });

  it('the resize handle drag grows the list wrap (:856-858)', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    const wrap = wrapper.find('#results-list-wrap').element as HTMLElement;
    const before = wrap.getBoundingClientRect().height;
    vi.spyOn(wrap, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: before, height: before } as DOMRect);
    const handle = wrapper.find('#results-resize-handle');
    handle.element.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientY: 300, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mousemove', { clientY: 380, bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('mouseup', { clientY: 380, bubbles: true }));
    await vi.waitFor(() => {
      expect(Number.parseInt(wrap.style.height, 10)).toBeGreaterThan(Number.parseInt(String(before), 10) || 0);
    });
  });
});

describe('charts + compare areas (:861-866)', () => {
  it('passes active action sections through to the charts component', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    expect(wrapper.find('#results-charts').attributes('style')).toContain('display: none');
    store.toggleAction('p1', 'view');
    await vi.waitFor(() => expect(wrapper.find('#results-charts').attributes('style')).not.toContain('display: none'));
  });

  it('the compare area renders traces when the compare plot opens', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    expect(wrapper.find('#compare-chart-area').attributes('style')).toContain('display: none');
    store.compareTraces.value = [{ x: [], y: [], name: 'eq' }];
    store.compareOpen.value = true;
    await vi.waitFor(() => expect(wrapper.find('#compare-chart-area').attributes('style')).not.toContain('display: none'));
  });
});

describe('delete flow (:8509-8532) — App ctx button calls the exposed flow', () => {
  it('confirms then DELETEs each selected result via its flavor base and reloads', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    store.setSelected(['p1', 'p2']);
    (wrapper.vm as unknown as { deleteSelectedFlow: () => void }).deleteSelectedFlow();
    await vi.waitFor(() => expect(wrapper.find('[data-test="results-delete-confirm"]').exists()).toBe(true));
    fetchMock.mockClear();
    await wrapper.find('[data-test="results-delete-confirm"]').trigger('click');
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3)); // 2 DELETEs + reload
    const calls = fetchMock.mock.calls.map((c) => String(c[0]) + ' ' + String((c[1] as RequestInit | undefined)?.method ?? 'GET'));
    expect(calls).toContain('http://h:8000/api/backtest-v7/results?path=p1 DELETE');
    expect(calls).toContain('http://h:8000/api/backtest-v7/results?path=p2 DELETE');
    expect(store.getSelected()).toEqual([]);
    expect(store.activeResults.value).toHaveLength(0); // sections closed for deleted rows
  });

  it('toasts when nothing is selected', async () => {
    const store = await loadedStore();
    const wrapper = mountPanel(store);
    (wrapper.vm as unknown as { deleteSelectedFlow: () => void }).deleteSelectedFlow();
    expect(notify.mock.calls[0]?.[0]).toContain('Nothing selected');
    expect(wrapper.find('[data-test="results-delete-confirm"]').exists()).toBe(false);
  });
});
