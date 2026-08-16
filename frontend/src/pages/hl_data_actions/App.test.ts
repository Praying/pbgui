import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import App from './App.vue';

/* Page-shell integration: mount, section rendering, picker + monitor wiring
   and the submit happy path (legacy hl_data_actions.html flows). */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' })),
}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    /* noop */
  }
}

const fetchMock = vi.fn();

function installHappyApi(): void {
  fetchMock.mockImplementation((url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      return Promise.resolve(
        new Response(JSON.stringify({ job_id: 'job-42', coins_count: 2, start_day: '20230101', end_day: '20240201' }), { status: 200 })
      );
    }
    if (u.includes('/heatmap/l2book-download-info')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ coins: ['BTC', 'ETH', 'SOL'], has_aws_creds: true, archive_range: { oldest_day: '20230101', newest_day: '20240201' } }),
          { status: 200 }
        )
      );
    }
    if (u.includes('/heatmap/build-ohlcv-info')) {
      return Promise.resolve(
        new Response(JSON.stringify({ eligible_coins: ['BTC', 'xyz:AAPL', 'ETH'], coins_with_downloaded_history: ['BTC'] }), { status: 200 })
      );
    }
    if (u.includes('/jobs/')) {
      return Promise.resolve(new Response(JSON.stringify({ jobs: [] }), { status: 200 }));
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

async function mountApp() {
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/api/market-data/data-actions/hyperliquid');
  fetchMock.mockReset();
  installHappyApi();
  FakeWebSocket.instances = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('HL data-actions page shell', () => {
  it('renders both sections with their pickers after init', async () => {
    const wrapper = await mountApp();

    expect(wrapper.find('#sec-download').exists()).toBe(true);
    expect(wrapper.find('#sec-build').exists()).toBe(true);
    expect(wrapper.findAll('#opts-dl .hlda-coin-row')).toHaveLength(3);
    expect(wrapper.findAll('#opts-build .hlda-coin-row')).toHaveLength(3);
    expect(wrapper.text()).toContain('Download l2Book from AWS');
    expect(wrapper.text()).toContain('Build best 1m OHLCV');
  });

  it('applies the tradfi toggle to the build picker', async () => {
    const wrapper = await mountApp();

    await wrapper.find('#build-tradfi-only').trigger('click');
    expect(wrapper.findAll('#opts-build .hlda-coin-row').map((row) => row.text())).toEqual(['xyz:AAPL']);
  });

  it('persists section collapse in localStorage', async () => {
    const wrapper = await mountApp();

    await wrapper.find('#sh-download').trigger('click'); // closed → open
    expect(window.localStorage.getItem('pbgui_hl_data_sections')).toContain('"download":true');
    wrapper.unmount();
  });

  it('submits the download queue job and shows the structured message', async () => {
    const wrapper = await mountApp();

    // selection lands through the drag engine: mousedown anchors, document
    // mouseup toggles (legacy :835-863)
    await wrapper.findAll('#opts-dl .hlda-coin-row')[0]!.trigger('mousedown', { button: 0 });
    document.dispatchEvent(new MouseEvent('mouseup'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.findAll('#opts-dl .hlda-coin-row')[0]!.classes()).toContain('selected');

    await wrapper.find('#sec-download .hlda-ar .hlda-btn').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));

    const msg = wrapper.find('#sec-download .hlda-msg.success');
    expect(msg.exists()).toBe(true);
    expect(msg.find('strong').text()).toBe('job-42');
    expect(msg.text()).toContain('2023-01-01 → 2024-02-01');
  });

  it('renders both job monitors with connecting badges until the WS opens', async () => {
    const wrapper = await mountApp();

    const badges = wrapper.findAll('.hlda-jm-badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]!.classes()).toContain('connecting');

    FakeWebSocket.instances[0]!.onopen?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.findAll('.hlda-jm-badge')[0]!.classes()).toContain('connected');
  });

  it('restricts to a single section when ?section= is set', async () => {
    window.history.replaceState({}, '', '/api/market-data/data-actions/hyperliquid?section=build');
    const wrapper = await mountApp();

    expect(wrapper.find('#sec-download').exists()).toBe(false);
    expect(wrapper.find('#sec-build').exists()).toBe(true);
    expect(wrapper.find('#hlda-root').classes()).toContain('show-only-section');
  });

  it('renders the no-creds hint instead of the download picker', async () => {
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/heatmap/l2book-download-info')) {
        return Promise.resolve(
          new Response(JSON.stringify({ coins: ['BTC'], has_aws_creds: false, archive_range: { oldest_day: '', newest_day: '' } }), { status: 200 })
        );
      }
      if (u.includes('/heatmap/build-ohlcv-info')) {
        return Promise.resolve(new Response(JSON.stringify({ eligible_coins: ['BTC'], coins_with_downloaded_history: [] }), { status: 200 }));
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    });

    const wrapper = await mountApp();

    expect(wrapper.find('.hlda-nocreds').exists()).toBe(true);
    expect(wrapper.find('#opts-dl').exists()).toBe(false);
  });
});
