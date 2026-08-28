import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';

const replaceTopLocationMock = vi.hoisted(() => vi.fn());
vi.mock('@/shared/nav', () => ({ replaceTopLocation: replaceTopLocationMock }));

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

async function openTradingSteppers() {
  const wrapper = mountApp();
  await flush();
  await nextTick();
  await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
  await flush();
  await nextTick();

  const trading = wrapper.get('[data-test="editor-section-trading"]');
  await trading.get('[data-test="advanced-execution-expander-toggle"]').trigger('click');
  return { wrapper, trading, steppers: trading.findAll('.num-stepper') };
}

beforeEach(() => {
  localStorage.clear();
  replaceTopLocationMock.mockReset();
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
    expect(wrapper.findAll('main')).toHaveLength(1);
    expect(wrapper.find('main#app-shell-main').exists()).toBe(true);
    const navButtons = wrapper.findAll('[data-testid^="rail-section-"]');
    expect(navButtons.map((b) => b.attributes('data-testid'))).toEqual([
      'rail-section-configs',
      'rail-section-queue',
      'rail-section-results',
      'rail-section-archive',
      'rail-section-legacy',
    ]);
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

  it('renders each submenu action icon exactly once', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();

    expect(wrapper.find('[data-test="ctx-new-config"]').text()).toBe('New Config');
    expect(wrapper.find('[data-test="ctx-new-config"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="ctx-delete-configs"]').text()).toBe('Delete Selected (0)');
    expect(wrapper.find('[data-test="ctx-delete-configs"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="queue-compare"]').text()).toBe('Compare');
    expect(wrapper.find('[data-test="queue-compare"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-rebacktest"]').text()).toBe('Backtest');
    expect(wrapper.find('[data-test="results-rebacktest"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-compare"]').text()).toBe('Compare');
    expect(wrapper.find('[data-test="results-compare"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="results-delete"]').text()).toBe('Delete Selected');
    expect(wrapper.find('[data-test="results-delete"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-pull-all"]').text()).toBe('Pull All');
    expect(wrapper.find('[data-test="archive-pull-all"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-push"]').text()).toBe('Git Push');
    expect(wrapper.find('[data-test="archive-push"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-add"]').text()).toBe('Add Archive');
    expect(wrapper.find('[data-test="archive-add"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-setup"]').text()).toBe('Setup');
    expect(wrapper.find('[data-test="archive-setup"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="legacy-rebacktest"]').text()).toBe('Backtest');
    expect(wrapper.find('[data-test="legacy-rebacktest"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="legacy-compare"]').text()).toBe('Compare');
    expect(wrapper.find('[data-test="legacy-compare"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="legacy-delete"]').text()).toBe('Delete Selected');
    expect(wrapper.find('[data-test="legacy-delete"] svg').exists()).toBe(true);

    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('[data-test="editor-home"]').text()).toBe('Home');
    expect(wrapper.find('[data-test="editor-home"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-results"]').text()).toBe('Results');
    expect(wrapper.find('[data-test="editor-results"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-save"]').text()).toBe('Save');
    expect(wrapper.find('[data-test="editor-save"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-save-queue"]').text()).toBe('Save & Queue');
    expect(wrapper.find('[data-test="editor-save-queue"] svg').exists()).toBe(true);

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
    expect(wrapper.findAll('[data-testid^="rail-section-"]').map((b) => b.attributes('data-testid'))).toEqual([
      'rail-section-configs',
      'rail-section-queue',
      'rail-section-results',
      'rail-section-archive',
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
    expect(wrapper.find('#editor-toolbar').exists()).toBe(false);
    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#editor-toolbar').exists()).toBe(true);
    expect(wrapper.find('[data-test="configs-editor"]').exists()).toBe(true);
    await wrapper.find('#editor-toolbar .sb-btn').trigger('click'); // Home
    await nextTick();
    expect(wrapper.find('#editor-toolbar').exists()).toBe(false);
    wrapper.unmount();
  });

  it('restores the compact editor layout, dropdown behavior and complete action toolbar', async () => {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();

    expect(wrapper.findAll('#configs-editor .form-row.config-editor-12').length).toBeGreaterThanOrEqual(3);
    expect(wrapper.find('[data-test="editor-section-basics"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-section-trading"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-section-market-data"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-section-filters"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-section-bot"]').exists()).toBe(true);

    const trading = wrapper.find('[data-test="editor-section-trading"]');
    const advancedExecution = trading.find('[data-test="advanced-execution-expander"]');
    expect(advancedExecution.exists()).toBe(true);
    expect(advancedExecution.classes()).not.toContain('open');
    expect(advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').attributes('aria-expanded')).toBe('false');
    expect(advancedExecution.find('#cfg-maker-fee-enabled').exists()).toBe(false);

    await advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').trigger('click');
    expect(advancedExecution.classes()).toContain('open');
    expect(advancedExecution.find('[data-test="advanced-execution-expander-toggle"]').attributes('aria-expanded')).toBe('true');
    expect(advancedExecution.find('#cfg-maker-fee-enabled').exists()).toBe(true);
    expect(advancedExecution.find('#cfg-taker-fee-enabled').exists()).toBe(true);
    expect(advancedExecution.find('.config-editor-trading-advanced').exists()).toBe(true);

    expect(wrapper.find('[data-test="editor-filter-toolbar"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-nav-group"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-analysis-group"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-config-group"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="editor-save-group"]').exists()).toBe(true);
    const basics = wrapper.find('[data-test="editor-section-basics"]');
    const exchangeWrap = wrapper.find('#ms-cfg-exchanges');
    const exchangeGroup = exchangeWrap.element.closest('.form-group');
    expect(exchangeGroup?.querySelector('label')?.textContent).toContain('exchanges');
    // the clear button only appears once something is selected
    expect(basics.findAll('.ms-clear-btn')).toHaveLength(0);
    const exchangeDropdown = wrapper.find('#ms-cfg-exchanges-dd');
    expect(exchangeDropdown.classes()).not.toContain('open');
    await wrapper.find('#ms-cfg-exchanges-input').trigger('focusin');
    expect(exchangeDropdown.classes()).toContain('open');

    expect(wrapper.findAll('#editor-toolbar button[data-test]').map((button) => button.attributes('data-test'))).toEqual([
      'editor-home',
      'editor-import',
      'editor-results',
      'editor-strategy-explorer',
      'editor-balance-calc',
      'editor-ohlcv',
      'editor-convert-v8',
      'editor-add-run',
      'editor-save',
      'editor-save-queue',
    ]);
    expect(wrapper.find('[data-test="editor-results"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="editor-convert-v8"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-test="editor-add-run"]').attributes('disabled')).toBeDefined();

    const longPanel = wrapper.find('[data-test="bot-side-long"]');
    const shortPanel = wrapper.find('[data-test="bot-side-short"]');
    expect(longPanel.exists()).toBe(true);
    expect(shortPanel.exists()).toBe(true);
    expect(longPanel.text()).toContain('total_wallet_exposure_limit');
    expect(shortPanel.text()).toContain('n_positions');

    const longJson = longPanel.find('[data-test="bot-json-expander-long"]');
    const shortJson = shortPanel.find('[data-test="bot-json-expander-short"]');
    expect(longJson.classes()).not.toContain('open');
    expect(shortJson.classes()).not.toContain('open');
    expect(longPanel.find('[data-test="cfg-bot-long"]').exists()).toBe(false);
    expect(shortPanel.find('[data-test="cfg-bot-short"]').exists()).toBe(false);

    await longJson.find('[data-test="bot-json-expander-toggle-long"]').trigger('click');
    expect(longJson.classes()).toContain('open');
    expect(longPanel.find('[data-test="cfg-bot-long"]').exists()).toBe(true);

    const rawExpander = wrapper.find('[data-test="raw-json-expander"]');
    expect(rawExpander.classes()).not.toContain('open');
    await rawExpander.find('[data-test="raw-json-expander-toggle"]').trigger('click');
    expect(rawExpander.classes()).toContain('open');
    wrapper.unmount();
  });

  it('renders contextual Phosphor controls for every trading stepper', async () => {
    const { wrapper, steppers } = await openTradingSteppers();
    const expectedFields = [
      'liquidation_threshold',
      'maker_fee_override',
      'taker_fee_override',
      'market_order_slippage_pct',
    ];
    expect(steppers).toHaveLength(expectedFields.length);

    expectedFields.forEach((fieldName, stepperIndex) => {
      const buttons = steppers[stepperIndex]!.findAll('button.stepper-btn');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]!.attributes('aria-label')).toBe(`Decrease ${fieldName}`);
      expect(buttons[0]!.attributes('title')).toBe(`Decrease ${fieldName}`);
      expect(buttons[1]!.attributes('aria-label')).toBe(`Increase ${fieldName}`);
      expect(buttons[1]!.attributes('title')).toBe(`Increase ${fieldName}`);
      buttons.forEach((button) => {
        const icon = button.get('svg');
        expect(icon.attributes('viewBox')).toBe('0 0 256 256');
        expect(icon.attributes('aria-hidden')).toBe('true');
      });
    });

    wrapper.unmount();
  });

  it('steps liquidation and slippage values within their exposed bounds', async () => {
    const { wrapper, steppers } = await openTradingSteppers();
    const liquidationStepper = steppers[0]!;
    const slippageStepper = steppers[3]!;

    const liquidationInput = liquidationStepper.get<HTMLInputElement>('input');
    await liquidationStepper.get('[aria-label="Increase liquidation_threshold"]').trigger('click');
    expect(liquidationInput.element.value).toBe('0.06');
    await liquidationStepper.get('[aria-label="Decrease liquidation_threshold"]').trigger('click');
    expect(liquidationInput.element.value).toBe('0.05');
    await liquidationInput.setValue('0');
    await liquidationStepper.get('[aria-label="Decrease liquidation_threshold"]').trigger('click');
    expect(liquidationInput.element.value).toBe('0');
    await liquidationInput.setValue('0.99');
    await liquidationStepper.get('[aria-label="Increase liquidation_threshold"]').trigger('click');
    expect(liquidationInput.element.value).toBe('0.99');

    const slippageInput = slippageStepper.get<HTMLInputElement>('input');
    await slippageStepper.get('[aria-label="Increase market_order_slippage_pct"]').trigger('click');
    expect(slippageInput.element.value).toBe('0.0006');
    await slippageStepper.get('[aria-label="Decrease market_order_slippage_pct"]').trigger('click');
    expect(slippageInput.element.value).toBe('0.0005');
    await slippageInput.setValue('0');
    await slippageStepper.get('[aria-label="Decrease market_order_slippage_pct"]').trigger('click');
    expect(slippageInput.element.value).toBe('0');

    wrapper.unmount();
  });

  it.each([
    { fieldName: 'maker_fee_override', checkboxSelector: '#cfg-maker-fee-enabled', stepperIndex: 1 },
    { fieldName: 'taker_fee_override', checkboxSelector: '#cfg-taker-fee-enabled', stepperIndex: 2 },
  ])('keeps $fieldName disabled until enabled and clamps its stepper', async ({ fieldName, checkboxSelector, stepperIndex }) => {
    const { wrapper, trading, steppers } = await openTradingSteppers();
    const feeStepper = steppers[stepperIndex]!;
    const feeInput = feeStepper.get<HTMLInputElement>('input');
    const decreaseButton = feeStepper.get(`[aria-label="Decrease ${fieldName}"]`);
    const increaseButton = feeStepper.get(`[aria-label="Increase ${fieldName}"]`);

    expect(feeInput.element.disabled).toBe(true);
    // ui/ Checkbox is a button — click toggles it (no setValue).
    await trading.get(checkboxSelector).trigger('click');
    expect(feeInput.element.disabled).toBe(false);

    await increaseButton.trigger('click');
    expect(feeInput.element.value).toBe('0.00001');
    await decreaseButton.trigger('click');
    expect(feeInput.element.value).toBe('0');
    await decreaseButton.trigger('click');
    expect(feeInput.element.value).toBe('0');

    await feeInput.setValue('0.01');
    await increaseButton.trigger('click');
    expect(feeInput.element.value).toBe('0.01');
    await decreaseButton.trigger('click');
    expect(feeInput.element.value).toBe('0.00999');

    await trading.get(checkboxSelector).trigger('click');
    expect(feeInput.element.disabled).toBe(true);

    wrapper.unmount();
  });

  it('imports JSON through /configs/prepare and opens the prepared config as new', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs/prepare') && init?.method === 'POST') {
        return ok({
          config: { backtest: { exchanges: ['bybit'], starting_balance: 12345 }, bot: { long: {}, short: {} } },
          param_status: {},
        });
      }
      if (target.includes('/configs')) return ok({ configs: [] });
      if (target.includes('/symbols')) return ok({ symbols: [] });
      if (target.includes('/tags')) return ok({ tags: [] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();
    await wrapper.find('[data-test="editor-import"]').trigger('click');
    expect(wrapper.find('[data-test="config-import-modal"]').exists()).toBe(true);
    await wrapper.find('[data-test="config-import-name"]').setValue('imported');
    await wrapper.find('[data-test="config-import-json"]').setValue(JSON.stringify({ backtest: { exchanges: ['bybit'] } }));
    await wrapper.find('[data-test="config-import-submit"]').trigger('click');
    await flush();
    await nextTick();

    const prepareCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/configs/prepare'));
    expect(prepareCall?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(prepareCall?.[1]?.body))).toEqual({ config: { backtest: { exchanges: ['bybit'] } } });
    expect((wrapper.find('[data-test="cfg-name"]').element as HTMLInputElement).value).toBe('imported');
    const balanceGroup = wrapper.findAll('.form-group').find((group) => group.text().includes('starting_balance'))!;
    expect((balanceGroup.find('input').element as HTMLInputElement).value).toBe('12345');
    expect(wrapper.find('[data-test="config-import-modal"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('routes saved-config actions to Results, V8 conversion and Add to Run', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.endsWith('/api/backtest-v7/configs/alpha')) {
        return ok({ name: 'alpha', config: { backtest: { exchanges: ['bybit'] }, live: { user: 'u1' }, bot: { long: {}, short: {} } }, param_status: {} });
      }
      if (target.endsWith('/api/backtest-v8/migrate-v7') && init?.method === 'POST') return ok({ name: 'alpha_v8' });
      if (target.endsWith('/api/v7/draft') && init?.method === 'POST') return ok({ draft_id: 'run-1' });
      if (target.includes('/results')) return ok({ results: [] });
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

    await wrapper.find('[data-test="editor-results"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-results').classes()).toContain('active');

    await wrapper.find('[data-testid="rail-section-configs"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-test="cfg-edit"]').trigger('click');
    await flush();
    await nextTick();
    await wrapper.find('[data-test="editor-convert-v8"]').trigger('click');
    await flush();
    const migrateCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/backtest-v8/migrate-v7'));
    expect(JSON.parse(String(migrateCall?.[1]?.body))).toEqual({
      source_type: 'backtest_config', source_name: 'alpha', target_name: 'alpha_v8', allow_manual_review_output: true,
    });
    expect(replaceTopLocationMock).toHaveBeenCalledWith('http://h:8000/api/backtest-v8/main_page?config=alpha_v8');

    replaceTopLocationMock.mockReset();
    await wrapper.find('[data-test="editor-add-run"]').trigger('click');
    await flush();
    const draftCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/v7/draft'));
    expect(JSON.parse(String(draftCall?.[1]?.body))).toEqual({
      config: expect.objectContaining({
        live: expect.objectContaining({ user: 'u1' }),
        pbgui: expect.objectContaining({ from_backtest_config: 'alpha', enabled_on: 'disabled' }),
      }),
    });
    expect(replaceTopLocationMock).toHaveBeenCalledWith('http://h:8000/api/v7/edit_page?new=1&draft_id=run-1');
    wrapper.unmount();
  });

  it('hands the current config to Strategy Explorer, Balance Calculator and OHLCV readiness', async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (target.includes('/configs/new-config')) return ok({ config: { backtest: { exchanges: ['bybit'] }, bot: { long: {}, short: {} } }, param_status: {} });
      if (target.endsWith('/api/strategy-explorer/draft') && init?.method === 'POST') return ok({ draft_id: 'strategy-1' });
      if (target.endsWith('/api/balance-calc/draft') && init?.method === 'POST') return ok({ draft_id: 'balance-1' });
      if (target.endsWith('/api/backtest-v7/ohlcv-preflight') && init?.method === 'POST') return ok({ summary: { overall_status: 'ready', ready: 12, missing: 0 } });
      if (target.includes('/configs')) return ok({ configs: [] });
      if (target.includes('/symbols')) return ok({ symbols: [] });
      if (target.includes('/tags')) return ok({ tags: [] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-test="ctx-new-config"]').trigger('click');
    await flush();
    await nextTick();

    await wrapper.find('[data-test="editor-strategy-explorer"]').trigger('click');
    await flush();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/api/strategy-explorer/draft') && call[1]?.method === 'POST')).toBe(true);
    expect(replaceTopLocationMock).toHaveBeenCalledWith('http://h:8000/api/strategy-explorer/main_page?draft_id=strategy-1');

    replaceTopLocationMock.mockReset();
    await wrapper.find('[data-test="editor-balance-calc"]').trigger('click');
    await flush();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/api/balance-calc/draft') && call[1]?.method === 'POST')).toBe(true);
    expect(replaceTopLocationMock).toHaveBeenCalledWith('http://h:8000/api/balance-calc/main_page?draft_id=balance-1&exchange=bybit');

    await wrapper.find('[data-test="editor-ohlcv"]').trigger('click');
    await flush();
    await nextTick();
    const preflightCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/api/backtest-v7/ohlcv-preflight'));
    expect(JSON.parse(String(preflightCall?.[1]?.body))).toEqual({ config: expect.any(Object) });
    expect(wrapper.find('[data-test="ohlcv-readiness-modal"]').text()).toContain('ready');
    await wrapper.find('[data-test="ohlcv-readiness-close"]').trigger('click');
    expect(wrapper.find('[data-test="ohlcv-readiness-modal"]').exists()).toBe(false);
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
    expect(wrapper.find('#editor-toolbar').exists()).toBe(true);
    const nameInput = wrapper.find('[data-test="cfg-name"]').element as HTMLInputElement;
    expect(nameInput.value).toBe('alpha');
    const pbguiDataButton = wrapper.find('button[title="Use PBGui market data directory"]');
    expect(pbguiDataButton.text()).toBe('PBGui Data');
    expect(pbguiDataButton.find('svg').exists()).toBe(true);
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
    await wrapper.find('#suite-enabled').trigger('click');
    await nextTick();
    await wrapper.find('[data-test="suite-add-scenario"]').trigger('click');
    await nextTick();
    // type a label mid-flight — NO Done click — then hit sidebar Save
    await wrapper.find('[data-test="suite-sc-label"]').setValue('typed mid-flight');
    await nextTick();
    calls.length = 0;
    await wrapper.findAll('#editor-toolbar .sb-btn').find((b) => b.text().includes('Save') && !b.text().includes('Queue'))!.trigger('click');
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
  it('suppresses transient waiting, stays quiet on ok and shows disconnect immediately', async () => {
    const wrapper = mountApp();
    await flush();
    expect(wrapper.find('#conn-banner').exists()).toBe(false);
    sockets[0]!.readyState = 1;
    sockets[0]!.onopen?.();
    await nextTick();
    // Connected is quiet: the persistent strip hides (a transient toast fires).
    expect(wrapper.find('#conn-banner').exists()).toBe(false);
    sockets[0]!.onclose?.();
    await nextTick();
    const banner = wrapper.find('#conn-banner');
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
    expect(wrapper.find('[data-testid="rail-section-badge-queue"]').text()).toBe('1/2');
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
    // empty queueBadge folds to undefined — the rail badge unmounts
    expect(wrapper.find('[data-testid="rail-section-badge-queue"]').exists()).toBe(false);
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
    // ui/ Checkbox exposes state through aria-checked, not .checked
    expect(wrapper.find('#set-autostart').attributes('aria-checked')).toBe('true');
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
    await wrapper.find('[data-testid="rail-section-queue"]').trigger('click');
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
    await wrapper.find('[data-testid="rail-section-queue"]').trigger('click');
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
    await wrapper.find('[data-testid="rail-section-queue"]').trigger('click');
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
    expect(fetchMock.mock.calls.some((c) =>  /\/results(?:\?|$)/.test(String(c[0])))).toBe(false);
    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) =>  /\/api\/backtest-v7\/results(?:\?|$)/.test(String(c[0])))).toBe(true);
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
    const resultsCallsBefore = fetchMock.mock.calls.filter((c) =>  /\/results(?:\?|$)/.test(String(c[0]))).length;
    sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'queue_update', items: [{ filename: 'a.json', name: 'a', status: 'complete' }] }) });
    await flush();
    await nextTick();
    const resultsCalls = fetchMock.mock.calls.filter((c) =>  /\/results(?:\?|$)/.test(String(c[0])));
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
    // reka listbox: the closed-state trigger renders the model as its text
    expect(wrapper.find('#results-config-filter').text()).toContain('alpha');
    expect(wrapper.findAll('#results-list tbody tr')).toHaveLength(1);
    wrapper.unmount();
  });
});
describe('archive + legacy panels (M-v7-11)', () => {
  function stubArchiveRoutes(): void {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/api/backtest-v7/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (u.includes('/configs') && !u.includes('/archives/')) return ok({ configs: [] });
      if (u.endsWith('/archives')) return ok({ archives: [{ name: 'mine', is_own: true, url: 'https://github.com/o/r', results: 2, optimize_configs: 1 }] });
      if (u.endsWith('/archives/mine/results')) return ok({ results: [{ path: '/archives/mine/a', config_name: 'alpha', result_name: 'r1', backtest_version: 'v7', adg: 2 }], migration_status: { label: 'layout-v2' } });
      if (u.endsWith('/optimize-configs')) return ok({ configs: [{ path: 'o1', name: 'opt', optimize_version: 'v7' }] });
      if (u.endsWith('/retest-schedules')) return ok({ schedules: [], runs: [] });
      if (u.endsWith('/legacy/results')) return ok({ results: [{ path: 'pb7/backtests/o/r1', config_name: 'old', result_name: 'r1' }] });
      return ok({});
    });
  }

  it('switching to the archive panel lazy-loads the archive list (:1455)', async () => {
    stubArchiveRoutes();
    const wrapper = mountApp();
    await flush();
    await nextTick();
    fetchMock.mockClear();
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives'))).toBe(true);
    expect(wrapper.find('#archive-list-view').exists()).toBe(true);
    expect(wrapper.find('#archive-list-container tbody tr').text()).toContain('mine');
    wrapper.unmount();
  });

  it('boots straight into an open archive from the #archive:name:mode hash (:10019-10023)', async () => {
    stubArchiveRoutes();
    window.history.replaceState({}, '', '/api/backtest-v7/main_page#archive:mine:optimize');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-archive').classes()).toContain('active');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives/mine/results'))).toBe(true);
    expect(wrapper.find('[data-test="arc-tab-optimize"]').attributes('style')).toContain('opacity: 1');
    // the hash round-trips through the frozen view-state contract
    expect(window.location.hash).toBe('#archive:mine:optimize');
    expect(JSON.parse(localStorage.getItem('pbgui:v7_backtest:view_state')!)).toMatchObject({ panel: 'archive', archive: 'mine', archiveMode: 'optimize' });
    wrapper.unmount();
  });

  it('dblclick opens an archive and the ctx sidebar gains the results actions (:8890-8920)', async () => {
    stubArchiveRoutes();
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('[data-test="archive-add"]').exists()).toBe(true);
    await wrapper.find('#archive-list-container tbody tr').trigger('dblclick');
    await flush();
    await nextTick();
    expect(wrapper.find('#archive-results-view').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-back"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-rebacktest"]').exists()).toBe(true);
    expect(wrapper.find('#archive-results-table tbody tr').text()).toContain('alpha');
    wrapper.unmount();
  });

  it('an archive_update WS frame on another panel invalidates the cached list (:1308-1317)', async () => {
    stubArchiveRoutes();
    const wrapper = mountApp();
    await flush();
    await nextTick();
    // load the archive list once, then leave the panel
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives'))).toHaveLength(1);
    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    await nextTick();
    sockets[0]!.onmessage!({ data: JSON.stringify({ type: 'archive_update' }) });
    await nextTick();
    // no fetch fires while away; the cleared cache forces a refetch on return
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives'))).toHaveLength(1);
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives'))).toHaveLength(2);
    wrapper.unmount();
  });

  it('the results ctx Backtest button is version-bound (:5349-5355) and opens the editor for one result (:7868-7878)', async () => {
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (u.includes('/configs')) return ok({ configs: [] });
      if (u.includes('/results/config')) return ok({ backtest: { exchanges: ['bybit'] } });
      if ( /\/results(?:\?|$)/.test(u)) return ok({ results: [{ path: 'p1', config_name: 'alpha', result_name: 'r', modified: '2024-01-01T00:00:00Z' }] });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    await flush();
    await nextTick();
    // version filter starts at the page flavor — the button is enabled
    const button = wrapper.find('[data-test="results-rebacktest"]');
    expect((button.element as HTMLButtonElement).disabled).toBe(false);
    await wrapper.find('#results-list tbody tr').trigger('click');
    fetchMock.mockClear();
    await button.trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/results/config?path=p1'))).toBe(true);
    expect(wrapper.find('#editor-toolbar').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hands a PB8 result to the Run editor through the canonical run draft endpoint', async () => {
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (u.includes('/configs')) return ok({ configs: [] });
      if (/\/results(?:\?|$)/.test(u)) return ok({ results: [{ path: 'r1', config_name: 'alpha', result_name: 'r', backtest_version: 'v8' }] });
      if (u.endsWith('/results/run-draft') && init?.method === 'POST') return ok({ draft_id: 'run-draft-1', name: 'alpha' });
      return ok({});
    });
    const wrapper = mountApp();
    await flush();
    await wrapper.find('[data-testid="rail-section-results"]').trigger('click');
    await flush();
    await nextTick();
    await wrapper.find('#results-list tbody tr').trigger('click');
    await wrapper.find('[data-test="results-add-run"]').trigger('click');
    await flush();
    expect(replaceTopLocationMock).toHaveBeenCalledWith('http://h:8000/api/v8/edit_page?new=1&draft_id=run-draft-1&name=alpha');
    wrapper.unmount();
  });

  it('the legacy panel lazy-loads, renders rows and keeps the ctx actions (:9034-9039, :772-778)', async () => {
    stubArchiveRoutes();
    const wrapper = mountApp();
    await flush();
    await nextTick();
    fetchMock.mockClear();
    await wrapper.find('[data-testid="rail-section-legacy"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/legacy/results'))).toBe(true);
    expect(wrapper.find('#legacy-results-table tbody tr').text()).toContain('old');
    expect(wrapper.find('[data-test="legacy-refresh"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="legacy-compare"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('v8 keeps the archive panel but never mounts the legacy one (:160-162)', async () => {
    stubArchiveRoutes();
    window.history.replaceState({}, '', '/api/backtest-v8/main_page');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    expect(wrapper.find('#panel-archive').exists()).toBe(true);
    expect(wrapper.find('#panel-legacy').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('archive git maintenance (M-v7-12)', () => {
  function stubGitRoutes(ndjson?: string): void {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/backtest-v7/settings')) return ok({ autostart: false, cpu: 1, cpu_max: 4 });
      if (u.includes('/configs') && !u.includes('/archives/')) return ok({ configs: [] });
      if (u.endsWith('/archives/settings'))
        return ok({ my_archive: 'mine', username: 'u', email: 'e@x', access_token: 'tok', auto_pull_interval: 15, readme_title: 'T', readme_static_markdown: 's' });
      if (u.endsWith('/archives/pull-all/stream') && init?.method === 'POST') {
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode(ndjson ?? '{"type":"done","ok":true,"results":[{"name":"mine","output":"ok"}]}\n'));
            controller.close();
          },
        });
        return Promise.resolve(new Response(body, { status: 200 }));
      }
      if (u.endsWith('/archives')) return ok({ archives: [{ name: 'mine', is_own: true, url: 'https://github.com/o/r', results: 2, optimize_configs: 1 }] });
      if (u.endsWith('/archives/mine/results')) return ok({ results: [], migration_status: { label: 'layout-v2' } });
      if (u.endsWith('/optimize-configs')) return ok({ configs: [] });
      if (u.endsWith('/retest-schedules')) return ok({ schedules: [], runs: [] });
      return ok({});
    });
  }

  async function openArchivePanel(): Promise<ReturnType<typeof mount>> {
    const wrapper = mountApp();
    await flush();
    await nextTick();
    await wrapper.find('[data-testid="rail-section-archive"]').trigger('click');
    await flush();
    await nextTick();
    return wrapper;
  }

  it('the archive list ctx exposes the git buttons and Setup opens the seeded modal (:747-753, :9747-9812)', async () => {
    stubGitRoutes();
    const wrapper = await openArchivePanel();
    for (const key of ['archive-pull-all', 'archive-push', 'archive-add', 'archive-setup', 'archive-log']) {
      expect(wrapper.find(`[data-test="${key}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-test="archive-pull-all"]').text()).toBe('Pull All');
    expect(wrapper.find('[data-test="archive-pull-all"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-push"]').text()).toBe('Git Push');
    expect(wrapper.find('[data-test="archive-push"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-add"]').text()).toBe('Add Archive');
    expect(wrapper.find('[data-test="archive-add"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-setup"]').text()).toBe('Setup');
    expect(wrapper.find('[data-test="archive-setup"] svg').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-log"]').text()).toBe('Log');
    expect(wrapper.find('[data-test="archive-log"] svg').exists()).toBe(true);
    fetchMock.mockClear();
    await wrapper.find('[data-test="archive-setup"]').trigger('click');
    await flush();
    await nextTick();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).endsWith('/archives/settings'))).toBe(true);
    const modal = wrapper.find('[data-test="archive-setup"]');
    expect(modal.exists()).toBe(true);
    // reka listbox: the closed-state trigger renders the model as its text
    expect(modal.find('[data-test="setup-arc-name"]').text()).toContain('mine');
    expect((modal.find('[data-test="setup-arc-user"]').element as HTMLInputElement).value).toBe('u');
    expect(wrapper.text()).toContain('Setup My Archive');
    wrapper.unmount();
  });

  it('Pull All streams, renders the progress modal and lands on the results modal (:9484-9637)', async () => {
    stubGitRoutes('{"type":"archive_start","archive":"mine"}\n{"type":"output","message":"Fetching origin"}\n{"type":"done","ok":true,"results":[{"name":"mine","output":"ok"}]}\n');
    const wrapper = await openArchivePanel();
    await wrapper.find('[data-test="archive-pull-all"]').trigger('click');
    await flush();
    await flush();
    await nextTick();
    const results = wrapper.find('[data-test="archive-pull-results"]');
    expect(results.exists()).toBe(true);
    expect(results.text()).toContain('Pull All - Results');
    expect(results.find('summary').text()).toBe('mine: OK');
    // the list reloads after a pull-all (:9636)
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).endsWith('/archives')).length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it('a failed pull keeps the progress modal open with the red status (:9596-9609)', async () => {
    stubGitRoutes('{"type":"done","ok":false,"error":"git lock"}\n');
    const wrapper = await openArchivePanel();
    await wrapper.find('[data-test="archive-pull-all"]').trigger('click');
    await flush();
    await flush();
    await nextTick();
    const modal = wrapper.find('[data-test="archive-pull-progress-modal"]');
    expect(modal.exists()).toBe(true);
    expect(modal.find('[data-test="archive-pull-status"]').attributes('style')).toContain('var(--red)');
    expect(modal.find('[data-test="archive-pull-status"]').text()).toBe('Pull failed: git lock');
    expect(wrapper.find('[data-test="archive-pull-all"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('the Log button hosts the global LogViewerPanel on ArchiveSync.log (:9633-9639)', async () => {
    stubGitRoutes();
    const ctor = vi.fn().mockImplementation(() => ({ open: vi.fn(), close: vi.fn() }));
    (window as unknown as { LogViewerPanel: unknown }).LogViewerPanel = ctor;
    const wrapper = await openArchivePanel();
    await wrapper.find('[data-test="archive-log"]').trigger('click');
    await nextTick();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith(expect.objectContaining({ defaultHost: 'local', defaultFile: 'ArchiveSync.log', presets: 'system', showRestart: false }));
    expect(wrapper.find('#log-panel').classes()).toContain('visible');
    delete (window as unknown as { LogViewerPanel?: unknown }).LogViewerPanel;
    wrapper.unmount();
  });

  it('Compact History is own-only in the open-archive ctx (:767, :8996)', async () => {
    stubGitRoutes();
    window.history.replaceState({}, '', '/api/backtest-v7/main_page#archive:mine:backtests');
    const wrapper = mountApp();
    await flush();
    await nextTick();
    expect(wrapper.find('[data-test="archive-compact"]').exists()).toBe(true);
    wrapper.unmount();
  });
});
