import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useConfigEditor, type ConfigEditorOptions } from './useConfigEditor';

/*
 * useConfigEditor — the editor lifecycle of v7_backtest.html:
 * editConfig/newConfig (:1739-1983), showConfigEditor's populate
 * (:2563-2946), saveEditor/saveAndQueue (:4855-4958) with
 * putEditorConfig's flavor split (:4823-4853), and the URL deep links
 * draft_id/opt_draft_id/queue_draft_id/config (:2023-2172).
 */

interface Call {
  url: string;
  init?: RequestInit;
}

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function makeEditor(overrides: Partial<ConfigEditorOptions> = {}) {
  const calls: Call[] = [];
  const fetchFn = vi.fn((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const target = String(url);
    if (target.includes('/configs/mycfg')) return ok({ name: 'mycfg', config: sampleCfg(), param_status: {} });
    if (target.includes('/configs/new-config')) return ok({ config: {}, param_status: {} });
    if (target.includes('/queue-draft/')) return ok({ items: [{ name: 'q1', config: { backtest: { exchanges: ['bybit'] } } }] });
    if (target.includes('/optimize-draft/')) return ok({ config: { backtest: { exchanges: ['binance'] } }, param_status: {} });
    if (target.includes('/api/v7/draft/')) return ok({ config: { backtest: { exchanges: ['okx'] } }, override_configs: {} });
    if (target.includes('/symbols')) return ok({ symbols: ['BTC', 'ETH'] });
    if (target.includes('/tags')) return ok({ tags: ['meme'] });
    if (target.includes('/configs/prepare')) return ok({ config: { backtest: { exchanges: ['binance'] } }, param_status: {} });
    if (target.includes('/pbgui_data_path')) return ok({ path: '/pbgui' });
    return ok({});
  });
  const notify = vi.fn();
  const options: ConfigEditorOptions = {
    apiBase: 'http://h:8000/api/backtest-v7',
    metadataApiBase: 'http://h:8000/api/v7',
    version: 'v7',
    getSettings: () => ({ hsl_signal_modes: ['coin', 'pside', 'unified'], exchange_options: [], use_pbgui_market_data: false }),
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${JSON.stringify(params)}` : key),
    notify,
    fetchFn: fetchFn as unknown as typeof fetch,
    loadConfigs: () => Promise.resolve(),
    wsRefresh: () => {},
    selectPanel: () => {},
    confirm: async () => true,
    ...overrides,
  };
  return { editor: useConfigEditor(options), calls, fetchFn, notify, options };
}

function sampleCfg(): Record<string, unknown> {
  return {
    backtest: { start_date: '2021-01-01', end_date: '2022-02-02', exchanges: ['bybit'], unknown_bt: 'keep' },
    live: { approved_coins: { long: ['BTC'], short: [] }, ignored_coins: { long: [], short: [] } },
    bot: { long: { total_wallet_exposure_limit: 1 }, short: {} },
    pbgui: {},
  };
}

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  window.history.replaceState({}, '', '/api/backtest-v7/main_page');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('open paths', () => {
  it('editConfig loads the config and populates the editor (editConfig :1739-1745)', async () => {
    const { editor } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    expect(editor.editingName.value).toBe('mycfg');
    expect(editor.state.name).toBe('mycfg');
    expect(editor.state.startDate).toBe('2021-01-01');
    expect(JSON.parse(editor.state.rawJson).backtest.unknown_bt).toBe('keep');
  });

  it('newConfig seeds the template with __new__ (:1970-1983)', async () => {
    const { editor } = makeEditor();
    await editor.newConfig();
    await flush();
    expect(editor.editingName.value).toBe('__new__');
    expect(editor.state.name).toBe('');
  });

  it('closeEditor resets the editing target (:4960-4970)', async () => {
    const { editor } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    editor.closeEditor();
    expect(editor.editingName.value).toBeNull();
  });
});

describe('saveEditor (:4855-4899)', () => {
  it('PUTs the collected config with the managed base_dir on v7', async () => {
    const { editor, calls, notify } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    calls.length = 0;
    await editor.save();
    await flush();
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    expect(put.url).toBe('http://h:8000/api/backtest-v7/configs/mycfg');
    const body = JSON.parse(String(put.init!.body)) as Record<string, unknown>;
    expect((body.backtest as Record<string, unknown>).base_dir).toBe('backtests/pbgui/mycfg');
    expect((body.backtest as Record<string, unknown>).unknown_bt).toBe('keep');
    // legacy closes the editor after a clean save (:4891-4897)
    expect(editor.editingName.value).toBeNull();
    expect(notify).toHaveBeenCalled();
  });

  it('blocks save on a missing name (:4856-4857)', async () => {
    const { editor, calls } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    editor.state.name = '';
    calls.length = 0;
    await editor.save();
    expect(calls.filter((call) => call.init?.method === 'PUT')).toHaveLength(0);
  });

  it('blocks save on invalid bot JSON (:3225-3253)', async () => {
    const { editor, calls, notify } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    editor.state.botLongJson = '{oops';
    calls.length = 0;
    await editor.save();
    await flush();
    expect(calls.filter((call) => call.init?.method === 'PUT')).toHaveLength(0);
    expect(notify).toHaveBeenCalled();
  });

  it('renames via source_name and never deletes the original (:4825-4829)', async () => {
    const { editor, calls } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    editor.state.name = 'renamed';
    calls.length = 0;
    await editor.save();
    await flush();
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    expect(put.url).toContain('source_name=mycfg');
    expect(put.url).toContain('/configs/renamed');
  });

  it('v8 sends config+override_configs with create_only for a new name (:4826-4837)', async () => {
    const { editor, calls } = makeEditor({ version: 'v8', apiBase: 'http://h:8000/api/backtest-v8' });
    await editor.newConfig();
    await flush();
    editor.state.name = 'mycfg';
    calls.length = 0;
    await editor.save();
    await flush();
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    expect(put.url).toContain('create_only=true');
    expect(put.url).toContain('inherit_existing_overrides=false');
    const body = JSON.parse(String(put.init!.body)) as Record<string, unknown>;
    expect(body).toHaveProperty('config');
    expect(body).toHaveProperty('override_configs');
  });
});

describe('saveAndQueue (:4901-4958)', () => {
  it('PUTs then POSTs to /queue and switches to the queue panel', async () => {
    const selectPanel = vi.fn();
    const { editor, calls } = makeEditor({ selectPanel });
    await editor.editConfig('mycfg');
    await flush();
    calls.length = 0;
    await editor.saveAndQueue();
    await flush();
    expect(calls.find((call) => call.init?.method === 'PUT')).toBeDefined();
    const post = calls.find((call) => call.init?.method === 'POST' && call.url.endsWith('/queue'));
    expect(post).toBeDefined();
    expect(JSON.parse(String(post!.init!.body))).toEqual({ name: 'mycfg' });
    expect(selectPanel).toHaveBeenCalledWith('queue');
  });
});

describe('deep links (:2023-2172)', () => {
  it('?config= opens the named config (initializeBacktestPageFromUrl :2163-2169)', async () => {
    const { editor } = makeEditor();
    const handled = await editor.consumeUrlDeepLinks('?config=mycfg');
    await flush();
    expect(handled).toBe(true);
    expect(editor.editingName.value).toBe('mycfg');
  });

  it('?draft_id= opens the run draft as a new config (:2023-2060)', async () => {
    const { editor } = makeEditor();
    const handled = await editor.consumeUrlDeepLinks('?draft_id=d1&draft_name=from_run');
    await flush();
    expect(handled).toBe(true);
    expect(editor.editingName.value).toBe('__new__');
    expect(editor.state.name).toBe('from_run');
  });

  it('?opt_draft_id= opens the optimizer draft (:2026-2031)', async () => {
    const { editor } = makeEditor();
    await editor.consumeUrlDeepLinks('?opt_draft_id=o1');
    await flush();
    expect(editor.editingName.value).toBe('__new__');
  });

  it('?queue_draft_id= opens the queue-draft modal (:2147-2161)', async () => {
    const { editor } = makeEditor();
    const handled = await editor.consumeUrlDeepLinks('?queue_draft_id=q1');
    await flush();
    expect(handled).toBe(true);
    expect(editor.queueDraftItems.value).toHaveLength(1);
    expect(editor.queueDraftOpen.value).toBe(true);
  });

  it('returns false when no deep link is present', async () => {
    const { editor } = makeEditor();
    expect(await editor.consumeUrlDeepLinks('')).toBe(false);
  });
});

describe('run-draft override pre-seed (:2033-2045, :2930-2932)', () => {
  const draftCfg = {
    backtest: { exchanges: ['okx'] },
    coin_overrides: { BTC: { override_config_path: 'BTC.json' } },
  };

  function overrideDraftEditor(version: 'v7' | 'v8' = 'v7') {
    const fetchFn = vi.fn((url: string) => {
      const target = String(url);
      if (target.includes('/api/v7/draft/')) {
        return Promise.resolve(new Response(JSON.stringify({ config: draftCfg, override_configs: { 'BTC.json': { bot: { long: { total_wallet_exposure_limit: 2 } } } } }), { status: 200 }));
      }
      if (target.includes('/configs/prepare')) return Promise.resolve(new Response(JSON.stringify({ config: draftCfg, param_status: {} }), { status: 200 }));
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    return makeEditor({ version, fetchFn: fetchFn as unknown as typeof fetch });
  }

  it('pre-seeds the draft override files so collect keeps the coin mapping (R6)', async () => {
    const { editor } = overrideDraftEditor();
    await editor.consumeUrlDeepLinks('?draft_id=d1');
    await flush();
    // the mapping from cfg.coin_overrides survives into a collected config
    const collected = editor.collect();
    expect((collected.coin_overrides as Record<string, unknown>).BTC).toMatchObject({ override_config_path: 'BTC.json' });
    // and the whole override FILE is cached — no server fetch needed to edit it
    expect(editor.coinOv.cachedOverrideFile('BTC')).toEqual({ bot: { long: { total_wallet_exposure_limit: 2 } } });
  });

  it('marks the pre-seeded files pending on v8 so the save ack flushes them (:2931)', async () => {
    const { editor } = overrideDraftEditor('v8');
    await editor.consumeUrlDeepLinks('?draft_id=d1');
    await flush();
    const snapshot = editor.coinOv.snapshotPendingFiles();
    expect(snapshot.files['BTC.json']).toEqual({ bot: { long: { total_wallet_exposure_limit: 2 } } });
  });
});

describe('loadCfgSymbols (:3710-3806)', () => {
  it('seeds coin/tag options and market labels from the selected exchanges', async () => {
    const { editor } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    expect(editor.coinOptions.value).toContain('all');
    expect(editor.coinOptions.value).toContain('BTC');
    expect(editor.tagOptions.value).toEqual(['meme']);
  });
});

describe('suite draft auto-fold (:183-184, :4769)', () => {
  /** Emulates SuiteEditor.foldDraft committing the open scenario draft. */
  function makeFoldingEditor() {
    const holder: { editor?: ReturnType<typeof useConfigEditor> } = {};
    const fold = vi.fn(() => {
      const editor = holder.editor!;
      editor.suite.value = { ...editor.suite.value, scenarios: [{ label: 'typed mid-flight' }] };
    });
    const made = makeEditor({ foldSuiteDraft: () => fold() });
    holder.editor = made.editor;
    return { ...made, fold };
  }

  async function openSuiteEditor(editor: ReturnType<typeof useConfigEditor>): Promise<void> {
    await editor.editConfig('mycfg');
    editor.suite.value = { enabled: true, scenarios: [{ label: 'old' }], editIdx: 0, aggregate: { default: 'mean' } };
    await flush();
  }

  it('Save folds the open scenario before the PUT (no Done clicked)', async () => {
    const { editor, calls, fold } = makeFoldingEditor();
    await openSuiteEditor(editor);
    calls.length = 0;
    await editor.save();
    await flush();
    expect(fold).toHaveBeenCalled();
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    const body = JSON.parse(String(put.init!.body)) as { backtest: { scenarios?: { label: string }[] } };
    expect(body.backtest.scenarios![0]!.label).toBe('typed mid-flight');
  });

  it('Save & Queue folds too before its PUT (:4901-4958)', async () => {
    const { editor, calls, fold } = makeFoldingEditor();
    await openSuiteEditor(editor);
    calls.length = 0;
    await editor.saveAndQueue();
    await flush();
    expect(fold).toHaveBeenCalled();
    const put = calls.find((call) => call.init?.method === 'PUT')!;
    const body = JSON.parse(String(put.init!.body)) as { backtest: { scenarios?: { label: string }[] } };
    expect(body.backtest.scenarios![0]!.label).toBe('typed mid-flight');
  });

  it('the raw-JSON structured sync folds before rewriting the raw text (:3429-3463)', async () => {
    const { editor, fold } = makeFoldingEditor();
    await openSuiteEditor(editor);
    editor.state.startingBalance = '4242';
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fold).toHaveBeenCalled();
    expect(JSON.parse(editor.state.rawJson).backtest.scenarios[0].label).toBe('typed mid-flight');
    expect(JSON.parse(editor.state.rawJson).backtest.starting_balance).toBe(4242);
  });
});

describe('structured ↔ raw sync (:3429-3463)', () => {
  it('editing a structured field refreshes the raw JSON text', async () => {
    const { editor } = makeEditor();
    await editor.editConfig('mycfg');
    await flush();
    editor.state.startingBalance = '7777';
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(JSON.parse(editor.state.rawJson).backtest.starting_balance).toBe(7777);
  });
});
