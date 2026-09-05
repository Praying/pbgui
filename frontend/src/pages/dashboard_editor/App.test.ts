import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';
import { resetDashboardStore, useDashboardStore } from './stores/dashboardStore';
import { isMselOpen, openMselDropdown, resetMselRegistry } from './lib/mselRegistry';
import { resetLivePositionsRegistry, setLivePositionsActive } from './lib/livePositionsRegistry';
import type { WebSocketLike } from './composables/useDashboardWs';

/* Port of the editor shell: init (editor:2636-2705), save/cancel + the
   postMessage contract (editor:2707-2742, locked by dashboard_main's tests),
   the dropdown close-on-click (editor:2744-2747) and the WS orchestration
   (editor:2749-2826). */

enableAutoUnmount(afterEach);

vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

class FakeWebSocket implements WebSocketLike {
  static instances: FakeWebSocket[] = [];
  url: string;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close(): void {
    this.closed = true;
  }
}

const API = 'http://pbgui.test:8000/api';

function json(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const fetchMock = vi.fn<typeof fetch>();

/** Default init responses: users, pending config (2×1 grid, one PNL cell). */
function defaultFetch(): void {
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === `${API}/dashboard/users`) return json({ users: ['ALL', 'alice', 'bob'] });
    if (url.startsWith(`${API}/dashboard/pending_full`)) {
      return json({
        found: true,
        config: { name: 'Draft', rows: 2, cols: 1, dashboard_type_1_1: 'PNL' },
      });
    }
    if (init?.method === 'POST' && url.startsWith(`${API}/dashboards/`)) {
      return json({ status: 'ok' });
    }
    return json({});
  });
}

const hosts: HTMLElement[] = [];

function mountApp(search = ''): ReturnType<typeof mount> {
  window.history.replaceState(null, '', `/api/dashboard/editor_page${search}`);
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(App, { attachTo: host, global: { plugins: [createI18n('en')] } });
}

/** Dispatch a window message like dashboard_main's sidebar does. */
async function message(data: unknown): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data }));
  await nextTick();
}

let parentPost: MockInstance;

beforeEach(() => {
  FakeWebSocket.instances = [];
  resetDashboardStore();
  resetMselRegistry();
  resetLivePositionsRegistry();
  fetchMock.mockReset();
  defaultFetch();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', FakeWebSocket);
  document.body.className = '';
  parentPost = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
});

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  vi.unstubAllGlobals();
  parentPost.mockRestore();
  window.history.replaceState(null, '', '/api/dashboard/editor_page');
  document.body.className = '';
});

describe('editor shell (editor:458-487)', () => {
  it('renders the legacy shell layout without the disabled migration watermark', async () => {
    const wrapper = mountApp();
    await flushPromises();

    expect(wrapper.find('.editor-wrapper').exists()).toBe(true);
    expect(wrapper.find('.editor-sticky-top').exists()).toBe(true);
    expect(wrapper.find('.editor-header').exists()).toBe(true);
    expect(wrapper.find('.editor-scroll-area').exists()).toBe(true);
    expect(wrapper.find('#editor-grid').exists()).toBe(true);
    expect(wrapper.find('#grid-footer').exists()).toBe(true);
    // Standalone/iframe boundary: the editor owns its body-mode contract.
    expect(wrapper.find('.app-shell').exists()).toBe(false);
    expect(wrapper.find('.migration-watermark').exists()).toBe(false);
  });

  it('sets the document title from i18n (legacy dash.editorTitle)', async () => {
    mountApp();
    await flushPromises();
    expect(document.title).toBe('Dashboard Editor');
  });

  it('applies the standalone body class in standalone mode', async () => {
    mountApp('?name=Draft&standalone=1');
    await flushPromises();
    expect(document.body.classList.contains('standalone-mode')).toBe(true);
    expect(document.body.classList.contains('view-mode')).toBe(false);
  });

  it('applies the view-mode body class and not standalone in view mode', async () => {
    mountApp('?name=Draft&view_only=1');
    await flushPromises();
    expect(document.body.classList.contains('view-mode')).toBe(true);
    expect(document.body.classList.contains('standalone-mode')).toBe(false);
  });

  it('applies no mode classes for the plain edit mode', async () => {
    mountApp('?name=Draft');
    await flushPromises();
    expect(document.body.className).toBe('');
  });
});

describe('init (editor:2636-2705)', () => {
  it('loads users then the pending config in edit mode and renders the grid', async () => {
    const wrapper = mountApp('?name=Draft&standalone=1');
    await flushPromises();

    expect(fetchMock.mock.calls[0]?.[0]).toBe(`${API}/dashboard/users`);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(`${API}/dashboard/pending_full?name=Draft`);
    expect(useDashboardStore().rows).toBe(2);
    expect(wrapper.findAll('.editor-cell')).toHaveLength(2);
    /* the palette is built in standalone mode (editor:2690) */
    expect(wrapper.find('#widget-palette').exists()).toBe(true);
    expect(wrapper.find('#grid-footer').exists()).toBe(true);
  });

  it('loads the saved config directly in view mode (editor:2650-2653)', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === `${API}/dashboard/users`) return json({ users: [] });
      if (url === `${API}/dashboards/ViewMe`) {
        return json({ found: true, config: { name: 'ViewMe', rows: 1, cols: 2, dashboard_type_1_2: 'TOP' } });
      }
      return json({});
    });
    mountApp('?name=ViewMe&view_only=1');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(`${API}/dashboards/ViewMe`);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('pending_full'))).toBe(false);
    expect(useDashboardStore().cols).toBe(2);
  });

  it('falls back to the saved config when pending is empty (editor:2658-2670)', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === `${API}/dashboard/users`) return json({ users: [] });
      if (url.includes('/pending_full')) return json({ found: false, config: {} });
      if (url === `${API}/dashboards/Saved`) {
        return json({ found: true, config: { name: 'Saved', rows: 3, cols: 1 } });
      }
      return json({});
    });
    mountApp('?name=Saved&standalone=1');
    await flushPromises();
    expect(useDashboardStore().rows).toBe(3);
  });

  it('renders a fresh 1×1 grid when nothing is found', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === `${API}/dashboard/users`) return json({ users: [] });
      return json({ found: false, config: {} });
    });
    const wrapper = mountApp('?name=NewOne&standalone=1');
    await flushPromises();
    expect(useDashboardStore().rows).toBe(1);
    expect(wrapper.findAll('.editor-cell')).toHaveLength(1);
  });

  it('survives a failed init: fresh grid state + ErrorState with retry (editor:2695-2702)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValue(new Error('network down'));
    const wrapper = mountApp('?name=X&standalone=1');
    await flushPromises();
    /* store still falls back to the fresh 1×1 (legacy parity) … */
    expect(useDashboardStore().rows).toBe(1);
    /* … but the user sees the error state instead of a silent dead canvas */
    expect(wrapper.find('[data-state="error"]').exists()).toBe(true);
    expect(wrapper.findAll('.editor-cell')).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();

    /* retry re-runs init against a healthy backend and restores the grid */
    defaultFetch();
    await wrapper.get('[data-state="error"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-state="error"]').exists()).toBe(false);
    expect(wrapper.findAll('.editor-cell').length).toBeGreaterThan(0);
    errorSpy.mockRestore();
  });
});

describe('save/cancel flows (editor:2707-2742)', () => {
  it('pbgui_trigger_save posts the config and answers with pbgui_editor_saved', async () => {
    mountApp('?name=Draft&standalone=1');
    await flushPromises();

    await message({ type: 'pbgui_trigger_save' });
    await flushPromises();

    const post = fetchMock.mock.calls.find((c) => String(c[0]).includes('/dashboards/'));
    expect(post).toBeTruthy();
    expect(post?.[0]).toBe(`${API}/dashboards/Draft`);
    expect((post?.[1] as RequestInit | undefined)?.method).toBe('POST');
    const body = JSON.parse(String((post?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>;
    expect(body.name).toBe('Draft');
    expect(body.rows).toBe(2);
    expect(body.dashboard_type_1_1).toBe('PNL');
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_editor_saved', name: 'Draft' }, window.location.origin);
  });

  it('shows the saved status after a successful save (editor:2712-2721)', async () => {
    const wrapper = mountApp('?name=Draft&standalone=1');
    await flushPromises();
    await message({ type: 'pbgui_trigger_save' });
    await flushPromises();
    expect(wrapper.find('#status').text()).toBe('saved');
    expect(wrapper.find('#status').classes()).toContain('saved');
  });

  it('refuses an empty name with the enterDashboardName error (editor:2710-2711)', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url === `${API}/dashboard/users`) return json({ users: [] });
      return json({ found: false, config: {} });
    });
    const wrapper = mountApp('?standalone=1');
    await flushPromises();

    await message({ type: 'pbgui_trigger_save' });
    await flushPromises();

    expect(wrapper.find('#status').text()).toBe('Please enter a dashboard name.');
    expect(wrapper.find('#status').classes()).toContain('error');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/dashboards/'))).toBe(false);
    expect(parentPost).not.toHaveBeenCalled();
  });

  it('shows the offline status when the save request fails (editor:2725)', async () => {
    fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === `${API}/dashboard/users`) return json({ users: [] });
      if (url.includes('/pending_full')) {
        return json({ found: true, config: { name: 'Draft', rows: 1, cols: 1 } });
      }
      if (init?.method === 'POST') throw new Error('network down');
      return json({});
    });
    const wrapper = mountApp('?name=Draft&standalone=1');
    await flushPromises();
    await message({ type: 'pbgui_trigger_save' });
    await flushPromises();
    expect(wrapper.find('#status').text()).toBe('offline');
    expect(wrapper.find('#status').classes()).toContain('error');
    expect(parentPost).not.toHaveBeenCalled();
  });

  it('pbgui_trigger_cancel answers with pbgui_editor_cancelled and the original name', async () => {
    mountApp('?name=Orig&standalone=1');
    await flushPromises();
    await message({ type: 'pbgui_trigger_cancel' });
    expect(parentPost).toHaveBeenCalledWith(
      { type: 'pbgui_editor_cancelled', original_name: 'Orig' },
      window.location.origin
    );
  });

  it('pbgui_trigger_view_save saves the layout and answers pbgui_view_saved (editor:617-626, 2739)', async () => {
    mountApp('?name=ViewMe&view_only=1');
    await flushPromises();
    await message({ type: 'pbgui_trigger_view_save' });
    await flushPromises();

    const post = fetchMock.mock.calls.find(
      (c) => String(c[0]).includes('/dashboards/') && (c[1] as RequestInit | undefined)?.method === 'POST'
    );
    expect(post?.[0]).toBe(`${API}/dashboards/ViewMe`);
    expect(parentPost).toHaveBeenCalledWith({ type: 'pbgui_view_saved' }, window.location.origin);
  });

  it('ignores non-object message data (editor:2734)', async () => {
    mountApp();
    await flushPromises();
    await message('nope');
    expect(parentPost).not.toHaveBeenCalled();
  });
});

describe('status sync with the store (editor:541-544, 600-610)', () => {
  it('mirrors doSync statuses into the badge', async () => {
    const wrapper = mountApp('?name=Draft&standalone=1');
    await flushPromises();
    const store = useDashboardStore();
    await store.doSync();
    await flushPromises();
    expect(wrapper.find('#status').text()).toBe('saved');
    expect(wrapper.find('#status').classes()).toContain('saved');
  });
});

describe('dropdown close-on-click (editor:2744-2747)', () => {
  it('closes every open dropdown on any document click', async () => {
    mountApp();
    await flushPromises();
    openMselDropdown(() => undefined);
    expect(isMselOpen()).toBe(true);
    document.body.click();
    expect(isMselOpen()).toBe(false);
  });
});

describe('WebSocket orchestration (editor:2749-2826)', () => {
  it('connects to /ws/dashboard derived from the api base', async () => {
    mountApp('?name=Draft&standalone=1');
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]?.url).toBe('ws://pbgui.test:8000/ws/dashboard');
  });

  it('rebuilds affected cells 300 ms after an income_updated event', async () => {
    const wrapper = mountApp('?name=Draft&standalone=1');
    await flushPromises();
    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeTruthy();
    const store = useDashboardStore();
    const pnlBefore = store.epochOf(1, 1);
    const emptyBefore = store.epochOf(2, 1);
    ws?.onmessage?.({ data: JSON.stringify({ type: 'income_updated' }) });
    /* the PNL cell (1_1) must remount: epoch bump changes the widget key */
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    expect(store.epochOf(1, 1)).toBe(pnlBefore + 1);
    /* empty cell (2_1) untouched */
    expect(store.epochOf(2, 1)).toBe(emptyBefore);
    /* still renders */
    expect(wrapper.findAll('.editor-cell')).toHaveLength(2);
  });

  it('skips positions_updated rebuilds for cells with an active live poll (editor:2807)', async () => {
    mountApp('?name=Draft&standalone=1');
    await flushPromises();
    const ws = FakeWebSocket.instances[0];
    expect(ws).toBeTruthy();
    const store = useDashboardStore();
    store.state['dashboard_type_2_1'] = 'POSITIONS';
    const before = store.epochOf(2, 1);
    setLivePositionsActive('2_1', true);
    ws?.onmessage?.({ data: JSON.stringify({ type: 'positions_updated' }) });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    expect(store.epochOf(2, 1)).toBe(before); /* live poll owns the refresh */
    setLivePositionsActive('2_1', false);
    ws?.onmessage?.({ data: JSON.stringify({ type: 'positions_updated' }) });
    await new Promise((resolve) => setTimeout(resolve, 320));
    await flushPromises();
    expect(store.epochOf(2, 1)).toBe(before + 1); /* rebuilt once not live */
  });
});
