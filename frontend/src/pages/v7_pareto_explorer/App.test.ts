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
    await wrapper.get('[data-stage="pareto_playground"]').trigger('click');
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
});
