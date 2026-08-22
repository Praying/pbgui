import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import App from './App.vue';

/*
 * Page-shell integration — scaffold + bootstrap/load + route state (M-v7-5).
 * Pareto's flavour is RUNTIME (session-resolved), so the same build must
 * react to a v8 result on a v7-seeded URL and vice versa (R3).
 */

vi.mock('@/shared/boot', () => ({
  getBoot: vi.fn(() => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: 'v1.99', serial: 'S9' })),
}));

const fetchMock = vi.fn();

function ok(body: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

function stubFetch(session: unknown): void {
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string | URL) => {
    const u = String(url);
    if (u.includes('/session')) return ok(session);
    if (u.includes('/load')) return ok({ mode: 'fast' });
    return ok({});
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mountApp(path: string): Promise<ReturnType<typeof mount>> {
  window.history.replaceState({}, '', path);
  const wrapper = mount(App, { global: { plugins: [createI18n('en')] }, attachTo: document.body });
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  return wrapper;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('Pareto Explorer scaffold', () => {
  it('boots from /session with the query result path and seed version', async () => {
    stubFetch({ result_valid: false, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/opt/results/run1');
    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main#app-shell-main').exists()).toBe(true);
    expect(wrapper.find('div.workbench-page-content').exists()).toBe(true);
    const sessionCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/session'))!;
    expect(String(sessionCall[0])).toBe(
      'http://pbgui.test:8000/api/pareto-explorer/session?result_path=' + encodeURIComponent('/opt/results/run1') + '&optimize_version=v7'
    );
    expect(wrapper.get('#result-chip').text()).toBe('No result selected');
    // renderSession overwrites the static "Bootstrap only" chip (:3963)
    expect(wrapper.get('#mode-chip').text()).toBe('Missing result path');
    expect(wrapper.get('#mode-chip').classes()).toContain('warn');
    expect(wrapper.get('#metric-result').text()).toBe('-');
    wrapper.unmount();
  });

  it('renders the summary metrics from a full-mode load', async () => {
    stubFetch({
      result_valid: true,
      result: { name: 'run1', pareto_count: 42 },
      load: {
        mode: 'full',
        view_range: { start: 0, end: 500, max: 1200 },
        summary: { visible_configs: 500, selected_configs: 1200, scanned_configs: 9000, pareto_configs: 40 },
      },
      messages: [],
    });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    expect(wrapper.get('#result-chip').text()).toBe('run1');
    expect(wrapper.get('#mode-chip').classes()).toContain('good');
    expect(wrapper.get('#metric-result').text()).toBe('run1');
    expect(wrapper.get('#metric-paretos').text()).toBe('40');
    expect(wrapper.get('#metric-all-results').text()).toContain('1200'); // selected/scanned summary
    wrapper.unmount();
  });

  it('shows messages from the session', async () => {
    stubFetch({ result_valid: true, messages: [{ level: 'error', text: 'boom' }] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page');
    const messages = wrapper.findAll('#messages .message');
    expect(messages).toHaveLength(1);
    expect(messages[0]!.classes()).toContain('bad');
    expect(messages[0]!.text()).toBe('boom');
    wrapper.unmount();
  });
});

describe('runtime flavor on the page (R3)', () => {
  it('reveals the v8-only baseline pin when a v8 result loads on the v7-seeded URL', async () => {
    stubFetch({ result_valid: true, result: { name: 'pb8run', optimize_version: 'v8' }, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    const pin = wrapper.get('#btn-pin-strategy-baseline');
    expect(pin.attributes('disabled')).toBeUndefined();
    expect(pin.isVisible()).toBe(true);
    wrapper.unmount();
  });

  it('keeps the baseline pin hidden for a v7 result on the v8-seeded URL', async () => {
    stubFetch({ result_valid: true, result: { name: 'pb7run', optimize_version: 'v7' }, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r&optimize_version=v8');
    const pin = wrapper.get('#btn-pin-strategy-baseline');
    expect(pin.isVisible()).toBe(false);
    expect(pin.attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});

describe('route state (stage / deep_tab)', () => {
  it('restores a deep-linked stage and deep tab', async () => {
    stubFetch({ result_valid: true, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?stage=settings&deep_tab=evolution');
    expect(wrapper.get('#stage-settings').isVisible()).toBe(true);
    expect(wrapper.get('#stage-command-center').isVisible()).toBe(false);
    expect(window.location.search).toContain('deep_tab=evolution');
    wrapper.unmount();
  });

  it('switching stages from the sidebar updates the location query', async () => {
    stubFetch({ result_valid: true, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page');
    await wrapper.get('[data-testid="rail-section-pareto_playground"]').trigger('click');
    expect(wrapper.get('#stage-pareto-playground').isVisible()).toBe(true);
    expect(window.location.search).toContain('stage=pareto_playground');
    wrapper.unmount();
  });
});

describe('load control (settings stage)', () => {
  it('scan all_results without a result path pushes an error and does not fetch', async () => {
    stubFetch({ result_valid: false, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page');
    await wrapper.get('#btn-load-all-results').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/load'))).toHaveLength(0);
    const messages = wrapper.findAll('#messages .message');
    expect(messages.some((m) => m.text() === 'No result path is available yet.')).toBe(true);
    wrapper.unmount();
  });

  it('loads the result context with the settings form values', async () => {
    stubFetch({ result_valid: true, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r&stage=settings');
    await wrapper.get('#result-path-input').setValue('/new/path');
    await wrapper.get('#max-configs-input').setValue('500');
    await wrapper.get('#btn-command-load').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const loadCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/load'))!;
    expect(String(loadCall[0])).toBe('http://pbgui.test:8000/api/pareto-explorer/load');
    const body = JSON.parse(String(loadCall[1]?.body));
    expect(body.result_path).toBe('/new/path');
    expect(body.max_configs).toBe(500);
    wrapper.unmount();
  });

  it('falls back to DEFAULT_MAX_CONFIGS when the max-configs input is cleared (M-v7-5 handoff 1)', async () => {
    stubFetch({ result_valid: true, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r&stage=settings');
    await wrapper.get('#max-configs-input').setValue('');
    await wrapper.get('#btn-command-load').trigger('click');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const loadCall = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/load'))!;
    expect(JSON.parse(String(loadCall[1]?.body)).max_configs).toBe(2000);
    wrapper.unmount();
  });
});

describe('bootstrap renders the command-center surfaces (M-v7-6)', () => {
  function stubSurfaces(): void {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/session')) return ok({ result_valid: true, result: { name: 'run1' }, messages: [] });
      if (u.includes('/command-center')) return ok({ champions: [{ config_index: 4, style: 'momentum' }], insights: [{ level: 'warning', text: 'near bounds' }] });
      if (u.includes('/config-detail')) return ok({ ok: true, detail: { config_index: 4, full_config: { bot: {} }, style: 'momentum' } });
      if (u.includes('/playground')) return ok({ counts: { configs: 40 }, viz_type: '2D Scatter' });
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('loads command center → detail → playground and renders them', async () => {
    stubSurfaces();
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    expect(wrapper.findAll('#champion-list .champion-item')).toHaveLength(1);
    expect(wrapper.get('#champion-list').text()).toContain('momentum');
    expect(wrapper.findAll('#insight-list .insight-item')).toHaveLength(1);
    expect(wrapper.get('#detail-title').text()).toBe('#4');
    expect(wrapper.get('#selected-config-detail').isVisible()).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/playground'))).toBe(true);
    wrapper.unmount();
  });

  it('hides the shared detail section on the settings stage (:4141-4145)', async () => {
    stubSurfaces();
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r&stage=settings');
    expect(wrapper.get('#selected-config-detail').isVisible()).toBe(false);
    wrapper.unmount();
  });
});

describe('mode chip during pending scans (M-v7-5 handoff 2, :2853/:2879)', () => {
  function pendingLoad(session: unknown): void {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/session')) return ok(session);
      if (u.includes('/load')) return new Promise(() => {}); // never settles
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
  }

  it('shows warn + "Loading full result..." while a full scan is pending', async () => {
    pendingLoad({ result_valid: true, result: { name: 'run1' }, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    await wrapper.get('#btn-load-all-results').trigger('click');
    expect(wrapper.get('#mode-chip').text()).toBe('Loading full result...');
    expect(wrapper.get('#mode-chip').classes()).toContain('warn');
    wrapper.unmount();
  });

  it('shows warn + "Switching to fast mode..." while returning to pareto-only', async () => {
    pendingLoad({
      result_valid: true,
      result: { name: 'run1' },
      defaults: { all_results_loaded: true },
      messages: [],
    });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    await wrapper.get('#btn-load-pareto-only').trigger('click');
    expect(wrapper.get('#mode-chip').text()).toBe('Switching to fast mode...');
    expect(wrapper.get('#mode-chip').classes()).toContain('warn');
    wrapper.unmount();
  });

  it('clears the override once session data applies (:3958-3964)', async () => {
    fetchMock.mockReset();
    let releaseLoad: ((value: Response) => void) | null = null;
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/session')) return ok({ result_valid: true, result: { name: 'run1' }, messages: [] });
      if (u.includes('/load')) return new Promise<Response>((resolve) => (releaseLoad = resolve));
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    await wrapper.get('#btn-load-all-results').trigger('click');
    expect(wrapper.get('#mode-chip').classes()).toContain('warn');
    releaseLoad!(new Response(JSON.stringify({ mode: 'full', result: { name: 'run1' } }), { status: 200 }));
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#mode-chip').classes()).toContain('good');
    expect(wrapper.get('#mode-chip').text()).toContain('Full mode loaded');
    wrapper.unmount();
  });
});

describe('full-load status surfaces (M-v7-5 handoff 4, :2436-2442)', () => {
  it('reveals the candidate-set metric chip only once loaded', async () => {
    stubFetch({ result_valid: true, result: { name: 'run1' }, messages: [] });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    const chip = wrapper.get('#metric-full-load-chip');
    expect(chip.isVisible()).toBe(false); // fast mode → idle
    wrapper.unmount();
  });

  it('shows the Loaded chip with the good class after a full-mode load', async () => {
    stubFetch({
      result_valid: true,
      result: { name: 'run1' },
      defaults: { all_results_loaded: true },
      load: { mode: 'full', view_range: { start: 0, end: 500, max: 1200 } },
      messages: [],
    });
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    const chip = wrapper.get('#metric-full-load-chip');
    expect(chip.isVisible()).toBe(true);
    expect(chip.text()).toBe('Loaded');
    expect(chip.classes()).toContain('good');
    wrapper.unmount();
  });
});

describe('display-range loading summary (M-v7-5 handoff 3, :2163-2173)', () => {
  it('summarises the animated fill while the range load is in flight, then restores', async () => {
    let releaseLoad: ((value: Response) => void) | null = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string | URL) => {
      const u = String(url);
      if (u.includes('/session')) {
        return ok({
          result_valid: true,
          result: { name: 'run1' },
          defaults: { all_results_loaded: true },
          load: { mode: 'full', view_range: { start: 0, end: 500, max: 1200 } },
          messages: [],
        });
      }
      if (u.includes('/load')) return new Promise<Response>((resolve) => (releaseLoad = resolve));
      return ok({});
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountApp('/api/pareto-explorer/main_page?result_path=/r');
    expect(wrapper.get('#display-range-summary').text()).toBe('Showing 500 configs (Rank 1-500)');
    await wrapper.get('#display-range-end-input').setValue('500');
    await wrapper.get('#display-range-end-input').trigger('change');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#display-range-summary').text()).toBe('Loading display range: 500 / 500 configs (Rank 1-500)');
    releaseLoad!(new Response(JSON.stringify({ mode: 'full', view_range: { start: 0, end: 500, max: 1200 } }), { status: 200 }));
    for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wrapper.get('#display-range-summary').text()).toBe('Showing 500 configs (Rank 1-500)');
    wrapper.unmount();
  });
});
