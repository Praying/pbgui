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
