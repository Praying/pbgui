import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/*
 * Backtest workbench shell — the M-v7-8 scaffold: boot chain
 * (:10012-10024), flavor gating (v8 drops the legacy panel),
 * connection banner (:1256-1262) and the queue badge (:5179-5188).
 */

const fetchMock = vi.fn();

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  url = '';
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
}

let sockets: FakeSocket[];

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function mountApp(): ReturnType<typeof mount> {
  sockets = [];
  vi.stubGlobal('WebSocket', class extends FakeSocket {
    constructor(public url: string) {
      super();
      sockets.push(this);
    }
  });
  return mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
  (window as unknown as { __BOOT__: unknown }).__BOOT__ = { origin: 'http://h:8000', token: 'tok', version: 'v9.9.9', serial: 's1' };
  vi.stubGlobal(
    'fetch',
    fetchMock.mockReset().mockImplementation((url: string) => {
      if (String(url).includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (String(url).includes('/configs')) return ok({ configs: [] });
      return ok({});
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  delete (window as { __BOOT__?: unknown }).__BOOT__;
});

describe('boot chain (:10012-10024)', () => {
  it('mounts the shell with all five v7 panels and restores configs by default', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    const navButtons = wrapper.findAll('.sb-section[data-panel]');
    expect(navButtons.map((b) => b.attributes('data-panel'))).toEqual(['configs', 'queue', 'results', 'archive', 'legacy']);
    expect(wrapper.find('#panel-configs').classes()).toContain('active');
    // boot loads settings + configs and opens the WS (:10015-10018)
    expect(fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/api/backtest'))).toEqual(
      expect.arrayContaining(['http://h:8000/api/backtest-v7/settings', 'http://h:8000/api/backtest-v7/configs'])
    );
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe('ws://h:8000/api/backtest-v7/ws/bt7');
    expect(document.title).toBe('PBGui — PBv7 Backtest');
    wrapper.unmount();
  });

  it('restores the panel from the URL hash (:10013, :10023)', async () => {
    window.history.replaceState({}, '', '/api/backtest-v7/main_page#queue');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-queue').classes()).toContain('active');
    expect(JSON.parse(localStorage.getItem('pbgui:v7_backtest:view_state')!).panel).toBe('queue');
    wrapper.unmount();
  });

  it('falls back to configs for a stored panel the flavor does not serve (:10023)', async () => {
    localStorage.setItem('pbgui:v8_backtest:view_state', JSON.stringify({ panel: 'legacy' }));
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-configs').classes()).toContain('active');
    wrapper.unmount();
  });

  it('v8 drops the legacy nav + panel and uses the v8 routers', async () => {
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.findAll('.sb-section[data-panel]').map((b) => b.attributes('data-panel'))).toEqual([
      'configs',
      'queue',
      'results',
      'archive',
    ]);
    expect(wrapper.find('#panel-legacy').exists()).toBe(false);
    expect(sockets[0]!.url).toBe('ws://h:8000/api/backtest-v8/ws/bt7');
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toContain('http://h:8000/api/backtest-v8/settings');
    expect(document.title).toBe('PBGui — PBv8 Backtest');
    wrapper.unmount();
  });

  it('v8 writes its own view-state key (:1068)', async () => {
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(JSON.parse(localStorage.getItem('pbgui:v8_backtest:view_state')!).panel).toBe('configs');
    wrapper.unmount();
  });

  it('restores the panel AND sorts from the actual frozen storage key (write-legacy/read-Vue parity, R2)', async () => {
    // no URL hash: the stored view state alone must drive the restore —
    // sorts are storage-only (never in the hash), so this test fails if
    // the boot read uses any key other than pbgui:v7_backtest:view_state
    localStorage.setItem(
      'pbgui:v7_backtest:view_state',
      JSON.stringify({ panel: 'archive', archive: 'repo', archiveMode: 'optimize', sorts: { configs: { col: 'name', asc: true }, results: { col: 'gain', asc: true } } })
    );
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-archive').classes()).toContain('active');
    // the boot selectPanel re-persists the restored state — the sorts must
    // survive the round-trip (a defaulted read would write col:'modified')
    const persisted = JSON.parse(localStorage.getItem('pbgui:v7_backtest:view_state')!) as {
      panel: string;
      archive: string;
      archiveMode: string;
      sorts: { configs: { col: string; asc: boolean }; results: { col: string; asc: boolean } };
    };
    expect(persisted.panel).toBe('archive');
    expect(persisted.archive).toBe('repo');
    expect(persisted.archiveMode).toBe('optimize');
    expect(persisted.sorts.configs).toEqual({ col: 'name', asc: true });
    expect(persisted.sorts.results).toEqual({ col: 'gain', asc: true });
    wrapper.unmount();
  });

  it('renders the configs list rows (renderConfigs :1654-1712)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4, hsl_signal_modes: ['coin', 'pside'] });
      if (String(url).includes('/configs')) {
        return ok({ configs: [{ name: 'alpha', exchanges: ['bybit'], coins: 3, twe_long: 1, twe_short: 0, start_date: '2021-01-01', end_date: 'now', results: 2, modified: '2026-08-01' }] });
      }
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    const rows = wrapper.findAll('#panel-configs tbody tr');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.text()).toContain('alpha');
    expect(rows[0]!.text()).toContain('bybit');
    wrapper.unmount();
  });

  it('opens the editor from the ctx New Config button and closes via Home (:721, :2563)', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#sidebar-editor').exists()).toBe(false);
    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#sidebar-editor').exists()).toBe(true);
    expect(wrapper.find('[data-test="configs-editor"]').exists()).toBe(true);
    await wrapper.find('#sidebar-editor .sb-btn').trigger('click'); // Home
    await nextTick();
    expect(wrapper.find('#sidebar-editor').exists()).toBe(false);
    wrapper.unmount();
  });

  it('opens the editor for a row edit action (editConfig :1739-1745)', async () => {
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs/alpha')) return ok({ name: 'alpha', config: { backtest: { start_date: '2021-01-01', exchanges: ['bybit'] }, bot: { long: {}, short: {} } }, param_status: {} });
      if (target.includes('/configs')) return ok({ configs: [{ name: 'alpha', exchanges: ['bybit'] }] });
      if (target.includes('/symbols')) return ok({ symbols: [] });
      if (target.includes('/tags')) return ok({ tags: [] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-test="cfg-edit"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#sidebar-editor').exists()).toBe(true);
    const nameInput = wrapper.find('[data-test="cfg-name"]').element as HTMLInputElement;
    expect(nameInput.value).toBe('alpha');
    wrapper.unmount();
  });

  it('Save folds an open suite scenario draft into the PUT body (:183-184, :4769)', async () => {
    const calls: string[] = [];
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      calls.push(String(url) + ' ' + String(init?.method ?? 'GET'));
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4, hsl_signal_modes: ['coin', 'pside'] });
      if (target.includes('/configs/mycfg')) return ok({ name: 'mycfg', config: { backtest: { start_date: '2021-01-01', exchanges: ['bybit'] }, bot: { long: {}, short: {} } }, param_status: {} });
      if (target.includes('/configs')) return ok({ configs: [{ name: 'mycfg', exchanges: ['bybit'] }] });
      if (target.includes('/symbols')) return ok({ symbols: [] });
      if (target.includes('/tags')) return ok({ tags: [] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    // open the editor, enable suite mode, add a scenario (opens the draft form)
    await wrapper.find('[data-test="cfg-edit"]').trigger('click');
    await flush();
    await nextTick();
    await wrapper.find('#suite-enabled').setValue(true);
    await nextTick();
    await wrapper.find('[data-test="suite-add-scenario"]').trigger('click');
    await nextTick();
    // type a label mid-flight — NO Done click — then hit sidebar Save
    await wrapper.find('[data-test="suite-sc-label"]').setValue('typed mid-flight');
    await nextTick();
    calls.length = 0;
    await wrapper.findAll('#sidebar-editor .sb-btn').find((b) => b.text().includes('Save') && !b.text().includes('Queue'))!.trigger('click');
    await flush();
    await nextTick();
    const put = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT');
    expect(put).toBeDefined();
    const body = JSON.parse(String(put![1]!.body)) as { backtest: { suite_enabled?: boolean; scenarios?: { label: string }[] } };
    expect(body.backtest.suite_enabled).toBe(true);
    // scenario 0 is 'base' (enable-seeded); the open draft (scenario 1) folds in
    expect(body.backtest.scenarios!.map((sc) => sc.label)).toEqual(['base', 'typed mid-flight']);
    wrapper.unmount();
  });

  it('opens the queue-draft modal from the queue_draft_id deep link (:2147-2161)', async () => {
    window.history.replaceState({}, '', '/api/backtest-v7/main_page?queue_draft_id=q1');
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/queue-draft/')) return ok({ items: [{ name: 'q1', config: { backtest: { exchanges: ['bybit'] } } }] });
      if (target.includes('/configs')) return ok({ configs: [] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('[data-test="queue-draft-modal"]').exists()).toBe(true);
    // legacy leaves ?queue_draft_id in the URL (only the draft_id path clears, :2054 vs :2147-2161)
    wrapper.unmount();
  });

  it('restores the v8 panel from the v8 flavor key (:1068)', async () => {
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    localStorage.setItem('pbgui:v8_backtest:view_state', JSON.stringify({ panel: 'queue', sorts: {} }));
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-queue').classes()).toContain('active');
    wrapper.unmount();
  });
});

describe('connection banner (:1256-1262)', () => {
  it('starts waiting, turns ok on open and lost on close', async () => {
    const wrapper = mountApp();
    await flush();
    const banner = wrapper.find('#conn-banner');
    expect(banner.classes()).toContain('conn-waiting');
    expect(banner.text()).toBe('Connecting…');
    sockets[0]!.readyState = 1;
    sockets[0]!.onopen?.();
    await nextTick();
    expect(banner.classes()).toContain('conn-ok');
    expect(banner.text()).toBe('Connected');
    sockets[0]!.onclose?.();
    await nextTick();
    expect(banner.classes()).toContain('conn-lost');
    expect(banner.text()).toBe('Connection lost — reconnecting…');
    wrapper.unmount();
  });
});

describe('queue live updates (:1267-1330)', () => {
  it('renders WS queue items and the running/total badge', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onopen?.();
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'queue_update',
        items: [
          { filename: 'a.json', name: 'a', status: 'running' },
          { filename: 'b.json', name: 'b', status: 'queued' },
          { filename: 'c.json', name: 'c', status: 'complete' },
        ],
      }),
    });
    await nextTick();
    await nextTick();
    expect(wrapper.findAll('#queue-list tbody tr')).toHaveLength(3);
    expect(wrapper.find('#queue-count-badge').text()).toBe('1/2');
    wrapper.unmount();
  });

  it('hides the badge when nothing is pending (:5186-5187)', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'complete' }] }),
    });
    await nextTick();
    await nextTick();
    expect(wrapper.find('#queue-count-badge').text()).toBe('');
    wrapper.unmount();
  });

  it('just-completed jobs reload the configs list (:1285-1293)', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'running' }] }),
    });
    await nextTick();
    const configsCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/configs')).length;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'complete' }] }),
    });
    await flush();
    await nextTick();
    const configsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/configs'));
    expect(configsCalls.length).toBe(configsCallsBefore + 1);
    wrapper.unmount();
  });

  it('WS settings pushes update the settings store (:1296-1303)', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'queue_update',
        items: [],
        settings: { autostart: 'True', cpu: '3', hlcvs_cleanup_days: '10' },
      }),
    });
    await nextTick();
    // open the settings modal and read the synced fields
    await wrapper.find('[data-test="open-settings"]').trigger('click');
    await nextTick();
    expect((wrapper.find('#set-cpu-val').element as HTMLInputElement).value).toBe('3');
    expect((wrapper.find('#set-autostart').element as HTMLInputElement).checked).toBe(true);
    expect((wrapper.find('#set-cleanup-days').element as HTMLInputElement).value).toBe('10');
    wrapper.unmount();
  });
});

describe('queue panel actions (App wiring, :5190-5226)', () => {
  it('start posts to /queue/{name}/start and pulls a refresh (:5191-5193)', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'queued' }] }),
    });
    await nextTick();
    await nextTick();
    const start = wrapper.findAll('#queue-list td.actions-cell button').find((b) => b.attributes('title') === 'Start')!;
    await start.trigger('click');
    await flush();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/queue/a.json/start'));
    expect(call?.[1]?.method).toBe('POST');
    expect(sockets[0]!.sent).toContain(JSON.stringify({ type: 'refresh' }));
    wrapper.unmount();
  });

  it('stop-all posts a stop for every running/backtesting item (:5220-5226)', async () => {
    const wrapper = mountApp();
    await flush();
    await wrapper.find('.sb-section[data-panel="queue"]').trigger('click');
    await nextTick();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'queue_update',
        items: [
          { filename: 'a.json', name: 'a', status: 'running' },
          { filename: 'b.json', name: 'b', status: 'backtesting' },
          { filename: 'c.json', name: 'c', status: 'complete' },
        ],
      }),
    });
    await nextTick();
    await nextTick();
    await wrapper.find('[data-test="stop-all"]').trigger('click');
    await flush();
    const stops = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/stop'));
    expect(stops.map((c) => String(c[0])).sort()).toEqual([
      'http://h:8000/api/backtest-v7/queue/a.json/stop',
      'http://h:8000/api/backtest-v7/queue/b.json/stop',
    ]);
    wrapper.unmount();
  });

  it('clear-finished posts the bulk endpoint (:5214-5218)', async () => {
    const wrapper = mountApp();
    await flush();
    await wrapper.find('.sb-section[data-panel="queue"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-test="clear-finished"]').trigger('click');
    await flush();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/queue/clear-finished'));
    expect(call?.[1]?.method).toBe('POST');
    wrapper.unmount();
  });

  it('delete-selected confirms then deletes each item and pulls a refresh (:5857-5871)', async () => {
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'queue_update',
        items: [
          { filename: 'a.json', name: 'a', status: 'complete' },
          { filename: 'b.json', name: 'b', status: 'complete' },
        ],
      }),
    });
    await nextTick();
    await nextTick();
    await wrapper.find('.sb-section[data-panel="queue"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-test="queue-select-all"]').trigger('click');
    await wrapper.find('[data-test="delete-selected"]').trigger('click');
    await nextTick();
    expect(wrapper.find('#modal-root.open').exists()).toBe(true);
    const confirm = wrapper.findAll('#modal-root .modal-btn').find((b) => b.text() === 'Delete')!;
    await confirm.trigger('click');
    await flush();
    const deletes = fetchMock.mock.calls.filter((c) => c?.[1]?.method === 'DELETE');
    expect(deletes.map((c) => String(c[0])).sort()).toEqual([
      'http://h:8000/api/backtest-v7/queue/a.json',
      'http://h:8000/api/backtest-v7/queue/b.json',
    ]);
    expect(sockets[0]!.sent).toContain(JSON.stringify({ type: 'refresh' }));
    wrapper.unmount();
  });
});

describe('settings modal (App wiring, :1560-1566)', () => {
  it('opens from the queue context and saves via POST /settings (:1602-1618)', async () => {
    const wrapper = mountApp();
    await flush();
    await wrapper.find('[data-test="open-settings"]').trigger('click');
    await nextTick();
    expect(wrapper.find('#modal-root.open').exists()).toBe(true);
    await wrapper.find('[data-test="cpu-plus"]').trigger('click');
    const save = wrapper.findAll('.modal-btn').find((b) => b.text() === 'Save')!;
    await save.trigger('click');
    await flush();
    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/settings') && c?.[1]?.method === 'POST');
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ cpu: 2, autostart: false });
    expect(wrapper.find('#modal-root.open').exists()).toBe(false);
    wrapper.unmount();
  });

  it('a failed settings load still opens the modal with defaults + error toast (:1563-1565)', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith('/settings')) return Promise.resolve(new Response(JSON.stringify({ detail: 'offline' }), { status: 500 }));
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await wrapper.find('[data-test="open-settings"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#modal-root.open').exists()).toBe(true);
    expect(wrapper.find('.toast-msg').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('results panel (M-v7-10, :834-869)', () => {
  it('lazy-loads results on panel switch and renders the rows (:1434-1462, :5514-5577)', async () => {
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs')) return ok({ configs: [] });
      if (target.includes('/results')) {
        return ok({ results: [{ path: 'backtests/alpha/binance/r1', config_name: 'alpha', result_name: 'r1', modified: '2024-01-02T03:04:05Z', adg: 0.01, gain: 12 }] });
      }
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/results'))).toBe(false);
    await wrapper.find('.sb-section[data-panel="results"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/api/backtest-v7/results'))).toBe(true);
    expect(wrapper.find('#panel-results').classes()).toContain('active');
    expect(wrapper.findAll('#results-list tbody tr')).toHaveLength(1);
    expect(wrapper.find('#results-list').text()).toContain('alpha');
    wrapper.unmount();
  });

  it('a just-completed WS job reloads the results list too (:1285-1293)', async () => {
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs')) return ok({ configs: [] });
      if (target.includes('/results')) return ok({ results: [{ path: 'p1', config_name: 'c', result_name: 'r', modified: '2024-01-02T00:00:00Z' }] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    sockets[0]!.readyState = 1;
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'running' }] }) });
    await nextTick();
    const resultsCallsBefore = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/results')).length;
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'complete' }] }) });
    await flush();
    await nextTick();
    const resultsCalls = fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/results'));
    expect(resultsCalls.length).toBe(resultsCallsBefore + 1);
    wrapper.unmount();
  });

  it('the results ctx bar carries the cross-version Compare + Delete buttons (:732-743)', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('[data-test="results-compare"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-delete"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="queue-compare"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it("a config's results-count cell opens the filtered results panel (:4983-5006)", async () => {
    fetchMock.mockImplementation((url: string) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs')) return ok({ configs: [{ name: 'alpha', exchanges: ['bybit'], results: 2 }] });
      if (target.includes('/results')) return ok({ results: [{ path: 'p1', config_name: 'alpha', result_name: 'r', modified: '2024-01-02T00:00:00Z' }, { path: 'p2', config_name: 'beta', result_name: 'r', modified: '2024-01-03T00:00:00Z' }] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-test="cfg-results"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-results').classes()).toContain('active');
    expect((wrapper.find('#results-config-filter').element as HTMLSelectElement).value).toBe('alpha');
    expect(wrapper.findAll('#results-list tbody tr')).toHaveLength(1);
    wrapper.unmount();
  });
});

  it('the results pin button unpins the panel chrome (:6415-6419, shell.js:326-334)', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    const panel = wrapper.find('#panel-results');
    expect(panel.classes()).not.toContain('unpinned');
    await wrapper.find('#results-pin-btn').trigger('click');
    await nextTick();
    expect(panel.classes()).toContain('unpinned');
    await wrapper.find('#results-pin-btn').trigger('click');
    await nextTick();
    expect(panel.classes()).not.toContain('unpinned');
    wrapper.unmount();
  });
