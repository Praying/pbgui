import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';
import type { MarketDataStatus } from './types';

enableAutoUnmount(afterEach);

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

vi.mock('@/shared/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, public detail: string) {
      super(`API ${status}: ${detail}`);
    }
  },
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);
const API_BASE = 'http://pbgui.test:8000/api';

/** Fake socket mirroring the legacy page's WebSocket usage. */
class FakeWebSocket {
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
  message(data: unknown): void {
    this.onmessage?.({ data });
  }
}

interface DialogsStub {
  confirm: ReturnType<typeof vi.fn>;
}

const hosts: HTMLElement[] = [];
let fetchMock: ReturnType<typeof vi.fn>;
let confirmSpy: ReturnType<typeof vi.fn>;

function statusMessage(overrides: Partial<MarketDataStatus> = {}): string {
  return JSON.stringify({
    type: 'market_data_status',
    running: false,
    queued: false,
    coins_done: 0,
    coins_total: 0,
    current_coin: '',
    coin_rows: [],
    ...overrides,
  });
}

function mountApp(options: { lang?: 'en' | 'zh'; exchange?: string } = {}) {
  const host = document.createElement('div');
  host.id = 'mds-app';
  const exchange = options.exchange ?? 'binance';
  if (exchange !== '') host.dataset.exchange = exchange;
  document.body.appendChild(host);
  hosts.push(host);
  return mount(App, { attachTo: host, global: { plugins: [createI18n(options.lang ?? 'en')] } });
}

/** Resolve every API action with the given body (defaults to success). */
function actionsResolve(body: Record<string, unknown> = { success: true }): void {
  apiFetchMock.mockResolvedValue(body as never);
}

beforeEach(() => {
  // Reset per-test: the missing-token test mutates this mock.
  vi.mocked(getBoot).mockReturnValue({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' });
  FakeWebSocket.instances = [];
  fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
  confirmSpy = vi.fn().mockResolvedValue(true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', FakeWebSocket);
  (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs = { confirm: confirmSpy };
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  for (const host of hosts.splice(0)) host.remove();
  delete (window as Window & { PBGuiDialogs?: DialogsStub }).PBGuiDialogs;
  vi.unstubAllGlobals();
  apiFetchMock.mockReset();
  window.history.replaceState(null, '', '/');
});

describe('App shell (legacy mds-root)', () => {
  it('renders the scoped root and initial waiting state with the watermark disabled', () => {
    const app = mountApp();

    expect(app.find('.mds-root').exists()).toBe(true);
    expect(app.find('.migration-watermark').exists()).toBe(false);
    expect(app.find('.mds-empty-state').text()).toContain('Waiting for market data status...');
  });

  it('replaces content with the warning when the token is missing', async () => {
    const { getBoot } = await import('@/shared/boot');
    vi.mocked(getBoot).mockReturnValue({ token: '', origin: 'http://pbgui.test:8000', version: '1', serial: 'S' });

    const app = mountApp();

    expect(app.find('.mds-empty-state').text()).toBe('⚠Missing token or exchange parameter');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('replaces content with the warning when the exchange is missing', () => {
    const app = mountApp({ exchange: '' });

    expect(app.find('.mds-empty-state').text()).toContain('Missing token or exchange parameter');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it('connects to the exchange-scoped WebSocket on mount', () => {
    mountApp({ exchange: 'bybit' });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toBe('ws://pbgui.test:8000/ws/market-data?exchange=bybit');
  });
});

describe('status-driven UI (legacy updateUI)', () => {
  it('flips the buttons and renders the progress while queued and running', async () => {
    const app = mountApp();
    const initial = app.findAll('.mds-btn');

    // Legacy html:272 ships Refresh Now disabled; only the first status
    // frame (updateUI) enables it.
    expect(initial[0]!.isVisible()).toBe(true);
    expect(initial[0]!.attributes('disabled')).toBeDefined();
    expect(initial[1]!.isVisible()).toBe(false);
    expect(initial[2]!.isVisible()).toBe(false);

    FakeWebSocket.instances[0]!.message(statusMessage({ queued: true }));
    await nextTick();
    expect(app.findAll('.mds-btn')[0]!.isVisible()).toBe(false);
    expect(app.findAll('.mds-btn')[1]!.isVisible()).toBe(true);

    FakeWebSocket.instances[0]!.message(statusMessage({ running: true, coins_done: 2, coins_total: 4, current_coin: 'BTC' }));
    await nextTick();
    expect(app.findAll('.mds-btn')[0]!.isVisible()).toBe(true);
    expect(app.findAll('.mds-btn')[0]!.attributes('disabled')).toBeUndefined();
    expect(app.findAll('.mds-btn')[2]!.isVisible()).toBe(true);
    expect(app.find('.mds-progress-section').isVisible()).toBe(true);
    expect(app.find('.mds-progress-label').text()).toBe('2 / 4');
  });

  it('renders coin rows from the status message', async () => {
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(
      statusMessage({
        coin_rows: [
          { coin: 'BTC', last_fetch: '2024-01-02T03:04:05', result: 'success', lookback_days: 30, minutes_written: 1440, newest_day: '2024-01-02', next_run_in_s: 45, note: 'ok' },
        ],
      }),
    );
    await nextTick();

    const cells = app.findAll('td');
    expect(cells[0]!.find('strong').text()).toBe('BTC');
    expect(cells[6]!.text()).toBe('45s');
  });

  it('shows the no-coin empty state after a status message without rows', async () => {
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();

    expect(app.find('.mds-empty-state').text()).toContain('No coin status available yet');
  });

  it('ignores error-bearing and foreign messages', async () => {
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(JSON.stringify({ error: 'boom' }));
    FakeWebSocket.instances[0]!.message(JSON.stringify({ type: 'other', queued: true }));
    await nextTick();

    expect(app.find('.mds-empty-state').text()).toContain('Waiting for market data status...');
  });

  it('localizes the shell in zh', () => {
    const app = mountApp({ lang: 'zh' });

    expect(app.find('.mds-btn').text()).toContain('立即刷新');
    expect(app.find('.mds-empty-state').text()).toContain('正在等待行情数据状态...');
  });
});

describe('action buttons (legacy callAPI)', () => {
  it('posts refresh-now with the exchange and toasts success', async () => {
    actionsResolve({ success: true });
    const app = mountApp({ exchange: 'bybit' });

    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(`${API_BASE}/market-data/refresh-now`, {
      method: 'POST',
      body: JSON.stringify({ exchange: 'bybit' }),
    });
    expect(app.find('.mds-toast').text()).toBe('Refresh triggered');
  });

  it('toasts the server error when the action reports failure', async () => {
    actionsResolve({ success: false, error: 'boom' });
    const app = mountApp();

    // Enable Refresh Now the way the legacy page does: first status frame.
    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect(app.find('.mds-toast').text()).toBe('boom');
  });

  it('toasts the fallback message when the failure has no error text', async () => {
    actionsResolve({ success: false });
    const app = mountApp();

    // Enable Refresh Now the way the legacy page does: first status frame.
    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect(app.find('.mds-toast').text()).toBe('Action failed');
  });

  it('toasts the error prefix when the request itself fails', async () => {
    apiFetchMock.mockRejectedValue(new Error('net down') as never);
    const app = mountApp();

    // Enable Refresh Now the way the legacy page does: first status frame.
    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect(app.find('.mds-toast').text()).toBe('Error: net down');
  });

  it('posts cancel-refresh while queued', async () => {
    actionsResolve({ success: true });
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(statusMessage({ queued: true }));
    await nextTick();
    await app.findAll('.mds-btn')[1]!.trigger('click');
    await flushPromises();

    expect(apiFetchMock).toHaveBeenCalledWith(`${API_BASE}/market-data/cancel-refresh`, {
      method: 'POST',
      body: JSON.stringify({ exchange: 'binance' }),
    });
    expect(app.find('.mds-toast').text()).toBe('Refresh cancelled');
  });

  it('asks for confirmation before stopping and posts stop-run', async () => {
    actionsResolve({ success: true });
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(statusMessage({ running: true }));
    await nextTick();
    await app.findAll('.mds-btn')[2]!.trigger('click');
    await flushPromises();

    expect(confirmSpy).toHaveBeenCalledWith({
      title: 'Stop refresh run',
      message: 'Stop the current market data refresh run?',
      detail: 'The active refresh for the selected exchange will be stopped.',
      confirmText: 'Stop',
    });
    expect(apiFetchMock).toHaveBeenCalledWith(`${API_BASE}/market-data/stop-run`, {
      method: 'POST',
      body: JSON.stringify({ exchange: 'binance' }),
    });
    expect(app.find('.mds-toast').text()).toBe('Stop signal sent');
  });

  it('skips the stop call when the confirmation is declined', async () => {
    confirmSpy.mockResolvedValue(false);
    const app = mountApp();

    FakeWebSocket.instances[0]!.message(statusMessage({ running: true }));
    await nextTick();
    await app.findAll('.mds-btn')[2]!.trigger('click');
    await flushPromises();

    expect(apiFetchMock).not.toHaveBeenCalled();
    expect(app.find('.mds-toast').exists()).toBe(false);
  });
});

describe('toasts (legacy showToast)', () => {
  it('logs the toast to notify_log with the level and bearer token', async () => {
    actionsResolve({ success: true });
    const app = mountApp();

    // Enable Refresh Now the way the legacy page does: first status frame.
    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/notify_log',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ msg: 'Refresh triggered', level: 'success' }),
      }),
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer tok');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('slides out after 3 seconds and is removed 300ms later', async () => {
    vi.useFakeTimers();
    try {
      actionsResolve({ success: true });
      const app = mountApp();

      FakeWebSocket.instances[0]!.message(statusMessage());
      await nextTick();
      await app.find('.mds-btn').trigger('click');
      await flushPromises();

      const toast = app.find('.mds-toast').element as HTMLElement;
      expect(toast.style.animation).toBe('');

      vi.advanceTimersByTime(3000);
      await nextTick();
      expect((app.find('.mds-toast').element as HTMLElement).style.animation).toBe('mds-slideOut 0.3s ease');

      vi.advanceTimersByTime(300);
      await nextTick();
      expect(app.find('.mds-toast').exists()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('colors success and error toasts with the legacy accents', async () => {
    actionsResolve({ success: true });
    const app = mountApp();
    FakeWebSocket.instances[0]!.message(statusMessage());
    await nextTick();
    await app.find('.mds-btn').trigger('click');
    await flushPromises();

    expect((app.find('.mds-toast').element as HTMLElement).style.background).toBe('var(--mds-accent-success)');

    actionsResolve({ success: false, error: 'x' });
    await app.findAll('.mds-btn')[0]!.trigger('click');
    await flushPromises();

    expect(app.findAll('.mds-toast')).toHaveLength(2);
    expect((app.findAll('.mds-toast')[1]!.element as HTMLElement).style.background).toBe('var(--mds-accent-danger)');
  });
});

describe('lifecycle', () => {
  it('closes the WebSocket on unmount', () => {
    const app = mountApp();
    const sock = FakeWebSocket.instances[0]!;

    app.unmount();

    expect(sock.closed).toBe(true);
    expect(sock.onmessage).toBeNull();
  });
});
