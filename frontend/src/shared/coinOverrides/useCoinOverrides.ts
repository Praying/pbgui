import { reactive, ref, type Ref } from 'vue';
import { validateJsonText } from '../jsonValidation';
import {
  cleanEmpty,
  defaultOverrideFilename,
  deleteDotted,
  ensureNested,
  flattenForAllowed,
  getNested,
  normalizeCoin,
  normalizeOverridesForLoad,
  parseParamValue,
  setDotted,
  type AllowedParams,
  type OverrideMap,
} from './coinOvModel';

/**
 * Coin-overrides store — the stateful halves of
 * frontend/js/coin_overrides_editor.js: init/_fetchAllowedParams (:478-538),
 * coinOvLoad (:541-595), the override-file cache (:639-693),
 * collect/snapshot/acknowledge/flush (:719-793), the edit flow (:1121-1630)
 * and covFilterCfgPaste (:1567-1623). Built once for v7_edit (M-v7-2),
 * reused by the backtest editor (M-v7-9). All network access is injected so
 * the store stays jsdom-testable; the legacy module is the spec.
 */

export interface CoinOvRequestOptions {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/** Resolves parsed JSON; throws Error(detail | HTTP status) on failure. */
export type CoinOvRequest = (path: string, options?: CoinOvRequestOptions) => Promise<unknown>;

export interface CoinOvContext {
  readonly hslSignalMode: string;
  readonly strategyKind: string;
}

export interface UseCoinOverridesOptions {
  readonly apiBase: string;
  /** v8: defer override-file writes until the config save acknowledges them. */
  readonly deferConfigFileWrites: boolean;
  /** v8: keep full exchange market identifiers instead of short coin names. */
  readonly preserveMarketIdentifiers: boolean;
  readonly request?: CoinOvRequest;
  /** scheduleStructuredEditorSync hook (:60-64). */
  readonly notifyStructuredSync?: () => void;
  /** Page toast (legacy used the page's global toast()). */
  readonly notify?: (msg: string, kind: 'err' | 'info') => void;
  readonly context?: CoinOvContext;
  /* i18n closures — legacy i18nT() with the editor.overrides.* keys. */
  readonly jsonInvalid?: (side: string) => string;
  readonly invalidValue?: (param: string, msg: string) => string;
  readonly alreadyHas?: (coin: string) => string;
  readonly invalidJsonInSide?: (side: string) => string;
}

interface PendingWrite {
  filename: string;
  config: Record<string, unknown>;
}

const INLINE_SECTIONS = [
  { key: 'bot.long', path: ['bot', 'long'] },
  { key: 'bot.short', path: ['bot', 'short'] },
  { key: 'live', path: ['live'] },
] as const;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null)) as T;
}

export function useCoinOverrides(options: UseCoinOverridesOptions) {
  const notify = options.notify ?? (() => undefined);
  const notifySync = options.notifyStructuredSync ?? (() => undefined);
  const jsonInvalid = options.jsonInvalid ?? ((side: string) => `Coin Override ${side} JSON is invalid`);
  const invalidValue = options.invalidValue ?? ((param: string, msg: string) => `Invalid value for ${param}: ${msg}`);
  const alreadyHas = options.alreadyHas ?? ((coin: string) => `${coin} already has overrides`);
  const invalidJsonInSide = options.invalidJsonInSide ?? ((side: string) => `Invalid JSON in ${side}. Fix it before closing.`);
  let request: CoinOvRequest =
    options.request ??
    (async (path, reqOptions) => {
      const resp = await fetch(options.apiBase + path, {
        method: reqOptions?.method ?? 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...reqOptions?.headers },
        body: reqOptions?.body,
      });
      const payload: unknown = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const detail = object(payload).detail;
        throw new Error(typeof detail === 'string' ? detail : 'HTTP ' + resp.status);
      }
      return payload;
    });

  const overrides = reactive<OverrideMap>({});
  const overrideConfigs = reactive<Record<string, Record<string, unknown>>>({});
  const pendingConfigFileWrites = reactive<Record<string, PendingWrite>>({});
  const allowedParams = ref<AllowedParams | null>(null);
  const allowedParamsError = ref('');
  const context = ref<CoinOvContext>(options.context ?? { hslSignalMode: '', strategyKind: '' });
  const contextAware = ref(!!options.context);
  const availableCoins = ref<string[]>([]);
  const marketLabels = ref<Record<string, string>>({});
  const configName = ref('');
  const editCoin = ref('');
  /** Inline edit inputs keyed 'bot.long.param' (the _covSaveEdit DOM read). */
  const inlineValues = reactive<Record<string, string>>({});
  /** Config-file side textareas (:1246-1286). */
  const fileValues = reactive<{ long: string; short: string; open: boolean }>({ long: '', short: '', open: false });
  let metadataGeneration = 0;
  let loadGeneration = 0;

  function resetEditValues(): void {
    for (const key of Object.keys(inlineValues)) delete inlineValues[key];
    fileValues.long = '';
    fileValues.short = '';
    fileValues.open = false;
  }

  /* ─── Allowed-params metadata (:495-538) ─────────────────────────────── */

  async function fetchAllowedParams(): Promise<AllowedParams | {}> {
    const generation = ++metadataGeneration;
    allowedParams.value = null;
    allowedParamsError.value = '';
    const ctx = context.value;
    if (contextAware.value && (!ctx.hslSignalMode || !ctx.strategyKind)) {
      allowedParams.value = {};
      allowedParamsError.value = 'Override context is unavailable';
      return {};
    }
    const query = contextAware.value
      ? '?hsl_signal_mode=' + encodeURIComponent(ctx.hslSignalMode) + '&strategy_kind=' + encodeURIComponent(ctx.strategyKind)
      : '';
    try {
      const data = object(await request('/override-params' + query));
      const params = data.params;
      if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw new Error('Override parameter metadata is invalid');
      }
      if (generation !== metadataGeneration) return allowedParams.value ?? {};
      allowedParams.value = params as AllowedParams;
      return params as AllowedParams;
    } catch (error) {
      if (generation !== metadataGeneration) return allowedParams.value ?? {};
      allowedParams.value = {};
      allowedParamsError.value = error instanceof Error ? error.message : 'Override parameters could not be loaded';
      return {};
    }
  }

  /** coinOvInit (:478-493). */
  async function init(): Promise<AllowedParams | {}> {
    return fetchAllowedParams();
  }

  /** coinOvSetContext (:527-538). */
  function setContext(next: Partial<CoinOvContext>): Promise<AllowedParams | {}> {
    const clean: CoinOvContext = {
      hslSignalMode: String(next.hslSignalMode ?? ''),
      strategyKind: String(next.strategyKind ?? ''),
    };
    if (clean.hslSignalMode === context.value.hslSignalMode && clean.strategyKind === context.value.strategyKind) {
      return Promise.resolve(allowedParams.value ?? {});
    }
    if (editCoin.value && !saveEditValues()) return Promise.resolve(allowedParams.value ?? {});
    context.value = clean;
    contextAware.value = true;
    return fetchAllowedParams();
  }

  /* ─── Load from config (coinOvLoad :541-595) ─────────────────────────── */

  function load(cfg: unknown, opts: { preservePending?: boolean } = {}): void {
    loadGeneration += 1;
    const preservePending = !!opts.preservePending;
    const previousPaths: Record<string, string> = {};
    for (const [coin, data] of Object.entries(overrides)) {
      previousPaths[coin] = String(data.override_config_path ?? '');
    }
    for (const key of Object.keys(overrides)) delete overrides[key];
    editCoin.value = '';
    resetEditValues();
    if (!preservePending) {
      for (const key of Object.keys(overrideConfigs)) delete overrideConfigs[key];
      for (const key of Object.keys(pendingConfigFileWrites)) delete pendingConfigFileWrites[key];
    }
    const normalized = normalizeOverridesForLoad(object(cfg).coin_overrides, options.preserveMarketIdentifiers);
    for (const [coin, data] of Object.entries(normalized)) {
      overrides[coin] = data;
    }
    if (preservePending) {
      for (const coin of Object.keys(overrideConfigs)) {
        const override = overrides[coin];
        if (!override || previousPaths[coin] !== String(override.override_config_path ?? '')) {
          delete overrideConfigs[coin];
        }
      }
      for (const coin of Object.keys(pendingConfigFileWrites)) {
        const override = overrides[coin];
        const pending = pendingConfigFileWrites[coin]!;
        if (!override || String(override.override_config_path ?? '') !== pending.filename) {
          delete pendingConfigFileWrites[coin];
          delete overrideConfigs[coin];
        }
      }
    }
  }

  /* ─── Coins + config name (:624-637) ─────────────────────────────────── */

  function setCoins(coins: readonly string[], labels?: Record<string, string>): void {
    availableCoins.value = coins.filter((c) => c !== 'all').sort();
    marketLabels.value = labels && typeof labels === 'object' ? { ...labels } : {};
  }

  function setConfigName(name: string): void {
    const nextName = name || '';
    if (configName.value !== nextName) {
      configName.value = nextName;
      loadGeneration += 1;
    }
  }

  /** coinOvSetOverrideConfigs (:640-655) — draft/backup preload. */
  function setOverrideConfigs(configs: unknown, opts: { markPending?: boolean } = {}): void {
    for (const [coin, raw] of Object.entries(object(configs))) {
      const normalizedCoin = normalizeCoin(coin, options.preserveMarketIdentifiers);
      const payload = clone(object(raw));
      overrideConfigs[normalizedCoin] = payload;
      if (opts.markPending) {
        const override = overrides[normalizedCoin];
        if (override && override.override_config_path) {
          pendingConfigFileWrites[normalizedCoin] = {
            filename: String(override.override_config_path),
            config: clone(payload),
          };
        }
      }
    }
  }

  /* ─── Override file loading (:659-685) ───────────────────────────────── */

  /** Test hook — inject a file payload directly (draft preload). */
  function cacheOverrideFile(coin: string, payload: Record<string, unknown>): void {
    overrideConfigs[coin] = clone(payload);
  }

  function cachedOverrideFile(coin: string): Record<string, unknown> | undefined {
    return overrideConfigs[coin];
  }

  /** Test hook — stage a deferred write like _covSaveConfigFile does. */
  function markPendingWrite(coin: string, payload?: { filename?: string; config?: Record<string, unknown> }): void {
    const override = overrides[coin];
    if (!override) return;
    const filename = String(payload?.filename ?? override.override_config_path ?? defaultOverrideFilename(coin, options.preserveMarketIdentifiers));
    const config = payload?.config ?? object(overrideConfigs[coin]);
    override.override_config_path = filename;
    overrideConfigs[coin] = clone(config);
    pendingConfigFileWrites[coin] = { filename, config: clone(config) };
  }

  async function loadOverrideFile(coin: string): Promise<Record<string, unknown> | null> {
    const data = overrides[coin];
    if (!data || !data.override_config_path || !configName.value) return null;
    if (overrideConfigs[coin] !== undefined) return overrideConfigs[coin]!;
    const filename = String(data.override_config_path);
    const generation = loadGeneration;
    const name = configName.value;
    try {
      const payload = object(await request('/override-config/' + encodeURIComponent(name) + '/' + encodeURIComponent(filename)));
      const cfg = object(payload.config);
      const current = overrides[coin];
      if (generation === loadGeneration && name === configName.value && current && String(current.override_config_path ?? '') === filename) {
        overrideConfigs[coin] = cfg;
      }
      return cfg;
    } catch (error) {
      const current = overrides[coin];
      if (generation === loadGeneration && name === configName.value && current && String(current.override_config_path ?? '') === filename) {
        overrideConfigs[coin] = { __pbgui_load_error__: error instanceof Error ? error.message : 'Override file could not be loaded' };
      }
      return overrideConfigs[coin] ?? null;
    }
  }

  /* ─── Collect + snapshots (:719-793) ─────────────────────────────────── */

  /** coinOvCollect — throws when the open editor holds invalid values. */
  function collect(): { coin_overrides?: OverrideMap } {
    if (editCoin.value && !saveEditValues()) {
      throw new Error('Coin override values are invalid');
    }
    if (Object.keys(overrides).length === 0) return {};
    return { coin_overrides: clone(overrides) };
  }

  function pendingFileCount(): number {
    return Object.keys(pendingConfigFileWrites).length;
  }

  function snapshotPendingFiles(): { files: Record<string, Record<string, unknown>>; entries: Record<string, PendingWrite> } {
    const snapshot = { files: {} as Record<string, Record<string, unknown>>, entries: {} as Record<string, PendingWrite> };
    for (const [coin, item] of Object.entries(pendingConfigFileWrites)) {
      if (!item || !item.filename || !item.config) continue;
      if (snapshot.files[item.filename] !== undefined) {
        throw new Error('Multiple coin overrides use ' + item.filename);
      }
      snapshot.files[item.filename] = clone(item.config);
      snapshot.entries[coin] = clone(item);
    }
    return snapshot;
  }

  function acknowledgePendingFiles(snapshot: { entries?: Record<string, PendingWrite> }): void {
    for (const [coin, entry] of Object.entries(snapshot.entries ?? {})) {
      const current = pendingConfigFileWrites[coin];
      if (current && JSON.stringify(current) === JSON.stringify(entry)) {
        delete pendingConfigFileWrites[coin];
      }
    }
  }

  async function snapshotAllFiles(): Promise<Record<string, Record<string, unknown>>> {
    const coins = Object.keys(overrides).filter((coin) => !!overrides[coin]!.override_config_path);
    const items = await Promise.all(
      coins.map(async (coin) => {
        const payload = await loadOverrideFile(coin);
        const override = overrides[coin]!;
        if (!payload || !override.override_config_path) {
          throw new Error('Override file for ' + coin + ' is unavailable');
        }
        return { filename: String(override.override_config_path), config: payload };
      })
    );
    const files: Record<string, Record<string, unknown>> = {};
    for (const item of items) {
      if (files[item.filename] !== undefined) throw new Error('Multiple coin overrides use ' + item.filename);
      files[item.filename] = clone(item.config);
    }
    return files;
  }

  async function flushPendingFiles(targetName?: string): Promise<{ ok: boolean }> {
    if (!options.deferConfigFileWrites) return { ok: true };
    const target = targetName || configName.value;
    const coins = Object.keys(pendingConfigFileWrites);
    if (!target || !coins.length) return { ok: true };
    await Promise.all(
      coins.map((coin) => {
        const item = pendingConfigFileWrites[coin]!;
        return request('/override-config/' + encodeURIComponent(target) + '/' + encodeURIComponent(item.filename), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.config),
        });
      })
    );
    for (const coin of coins) delete pendingConfigFileWrites[coin];
    return { ok: true };
  }

  /* ─── Edit flow (:933-940, :1121-1157, :1424-1537) ───────────────────── */

  function pickCoin(coin: string): void {
    if (!coin) return;
    if (overrides[coin]) {
      notify(alreadyHas(coin), 'err');
      return;
    }
    overrides[coin] = {};
    editCoinStart(coin);
    notifySync();
  }

  function removeCoin(coin: string): void {
    delete overrides[coin];
    delete overrideConfigs[coin];
    delete pendingConfigFileWrites[coin];
    if (editCoin.value === coin) {
      editCoin.value = '';
      resetEditValues();
    }
    notifySync();
  }

  function editCoinStart(coin: string): void {
    if (editCoin.value && editCoin.value !== coin && !saveEditValues()) return;
    editCoin.value = coin;
    const data = overrides[coin] ?? {};
    resetEditValues();
    for (const sec of INLINE_SECTIONS) {
      const allowed = (getNested(allowedParams.value, sec.path) ?? {}) as Record<string, unknown>;
      const sectionData = flattenForAllowed(getNested(data, sec.path) ?? {}, allowed);
      for (const [param, value] of Object.entries(sectionData)) {
        inlineValues[sec.key + '.' + param] =
          value !== undefined && value !== null
            ? typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
            : '';
      }
    }
    const cached = overrideConfigs[coin];
    const fileBot = object(object(cached).bot);
    fileValues.long = JSON.stringify(object(fileBot.long), null, 4);
    fileValues.short = JSON.stringify(object(fileBot.short), null, 4);
    fileValues.open = Object.keys(object(fileBot.long)).length > 0 || Object.keys(object(fileBot.short)).length > 0;
    if (data.override_config_path && configName.value && overrideConfigs[coin] === undefined) {
      void loadOverrideFile(coin).then(() => {
        if (editCoin.value !== coin) return;
        const reloaded = overrideConfigs[coin];
        const bot = object(object(reloaded).bot);
        fileValues.long = JSON.stringify(object(bot.long), null, 4);
        fileValues.short = JSON.stringify(object(bot.short), null, 4);
        fileValues.open = Object.keys(object(bot.long)).length > 0 || Object.keys(object(bot.short)).length > 0;
      });
    }
  }

  function addParam(secKey: string, param: string, rawValue: string): boolean {
    if (!param) {
      notify('Select a parameter first', 'err');
      return false;
    }
    const coin = editCoin.value;
    const data = coin ? overrides[coin] : undefined;
    if (!data) return false;
    const path = secKey.split('.');
    const target = ensureNested(data, path);
    const allowed = (getNested(allowedParams.value, path) ?? {}) as Record<string, unknown>;
    try {
      setDotted(target, param, parseParamValue(rawValue, allowed[param], param));
    } catch (error) {
      notify(invalidValue(param, error instanceof Error ? error.message : String(error)), 'err');
      return false;
    }
    inlineValues[secKey + '.' + param] = rawValue;
    notifySync();
    return true;
  }

  function removeParam(secKey: string, param: string): void {
    const data = editCoin.value ? overrides[editCoin.value] : undefined;
    if (!data) return;
    const target = getNested(data, secKey.split('.'));
    if (target && typeof target === 'object') {
      deleteDotted(target as Record<string, unknown>, param);
      cleanEmpty(data);
    }
    delete inlineValues[secKey + '.' + param];
    notifySync();
  }

  /** Validate one config-file side textarea (non-'{}' text must parse). */
  function fileSideError(side: 'long' | 'short'): string | null {
    const raw = fileValues[side].trim();
    if (!raw || raw === '{}') return null;
    const validation = validateJsonText(raw, {
      expectObject: true,
      messages: { cannotBeEmpty: jsonInvalid(side), topLevelObject: jsonInvalid(side) },
    });
    if (!validation.error) return null;
    let summary = jsonInvalid(side);
    if (validation.error.line != null && validation.error.column != null) {
      summary += ` at line ${validation.error.line}, column ${validation.error.column}`;
    }
    return summary;
  }

  /** _covSaveConfigFile (:1466-1537) — file textareas → file/cache/pending. */
  function saveConfigFile(coin: string): boolean {
    const data = overrides[coin];
    if (!data) return true;
    const existingFile = overrideConfigs[coin];
    if (existingFile && existingFile.__pbgui_load_error__) {
      notify('Override file could not be loaded. It was not changed.', 'err');
      return false;
    }
    const fileContent = clone(existingFile ?? {});
    if (fileContent.bot) {
      delete object(fileContent.bot).long;
      delete object(fileContent.bot).short;
      if (Object.keys(object(fileContent.bot)).length === 0) delete fileContent.bot;
    }
    let hasContent = false;
    for (const side of ['long', 'short'] as const) {
      const raw = fileValues[side].trim();
      if (!raw || raw === '{}') continue;
      const error = fileSideError(side);
      if (error) {
        notify(invalidJsonInSide(side), 'err');
        return false;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed === 'object' && parsed !== null && Object.keys(parsed).length > 0) {
        if (!fileContent.bot) fileContent.bot = {};
        object(fileContent.bot)[side] = parsed;
        hasContent = true;
      }
    }
    hasContent = hasContent || Object.keys(fileContent).length > 0;
    const filename = String(data.override_config_path ?? '') || defaultOverrideFilename(coin, options.preserveMarketIdentifiers);
    if (hasContent) {
      data.override_config_path = filename;
      overrideConfigs[coin] = fileContent;
      if (options.deferConfigFileWrites) {
        pendingConfigFileWrites[coin] = { filename, config: clone(fileContent) };
        return true;
      }
      if (configName.value) {
        void request('/override-config/' + encodeURIComponent(configName.value) + '/' + encodeURIComponent(filename), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fileContent),
        }).catch((error: unknown) => {
          notify(
            `Save ${filename} failed: ${error instanceof Error ? error.message : String(error)}`,
            'err'
          );
        });
      }
    } else {
      delete data.override_config_path;
      delete overrideConfigs[coin];
      delete pendingConfigFileWrites[coin];
    }
    return true;
  }

  /** _covSaveEdit (:1424-1463) — inline inputs + file textareas → state. */
  function saveEditValues(): boolean {
    const coin = editCoin.value;
    const data = coin ? overrides[coin] : undefined;
    if (!coin || !data) return true;
    for (const sec of INLINE_SECTIONS) {
      const target = getNested(data, sec.path);
      if (!target || typeof target !== 'object') continue;
      const allowed = (getNested(allowedParams.value, sec.path) ?? {}) as Record<string, unknown>;
      for (const param of Object.keys(flattenForAllowed(target, allowed))) {
        const inputId = sec.key + '.' + param;
        if (!(inputId in inlineValues)) continue;
        try {
          setDotted(target as Record<string, unknown>, param, parseParamValue(inlineValues[inputId], allowed[param], param));
        } catch (error) {
          notify(invalidValue(param, error instanceof Error ? error.message : String(error)), 'err');
          return false;
        }
      }
    }
    if (!saveConfigFile(coin)) return false;
    cleanEmpty(data);
    notifySync();
    return true;
  }

  /** coinOvCloseEdit (:1626-1630). */
  function closeEdit(): void {
    if (!saveEditValues()) return;
    editCoin.value = '';
    resetEditValues();
  }

  /* ─── Paste filter (covFilterCfgPaste :1567-1623) ────────────────────── */

  function filterPaste(
    side: 'long' | 'short',
    text: string
  ): { text: string; messageKey: 'extractedPaste' | 'filteredPaste' | 'extractedFilteredPaste' } | null {
    if (!text || text.trim().length < 2) return null;
    const trimmed = text.trim();
    if (trimmed[0] !== '{') return null;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      const fixed = trimmed.replace(/,(\s*[}\]])/g, '$1').replace(/:\s*(\d+),(\d+)/g, ':$1.$2');
      try {
        parsed = JSON.parse(fixed) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const allowed = allowedParams.value;
    const keys: Record<string, unknown> | null = allowed ? object(object(allowed).bot)[side] as Record<string, unknown> : null;
    if (!keys) return null;
    let flat: Record<string, unknown> = parsed;
    const botSide = object(parsed.bot)[side];
    if (object(parsed.bot) && object(botSide) && Object.keys(object(botSide)).length > 0) {
      flat = object(botSide);
    } else if (object(parsed[side]) && Object.keys(object(parsed[side])).length > 0 && !Array.isArray(parsed[side])) {
      flat = object(parsed[side]);
    }
    flat = flattenForAllowed(flat, keys);
    let hasNonOverride = false;
    for (const key of Object.keys(flat)) {
      if (!Object.prototype.hasOwnProperty.call(keys, key)) {
        hasNonOverride = true;
        break;
      }
    }
    if (!hasNonOverride && flat === parsed) return null;
    const filtered: Record<string, unknown> = {};
    const removed: string[] = [];
    for (const [key, value] of Object.entries(flat)) {
      if (Object.prototype.hasOwnProperty.call(keys, key)) {
        setDotted(filtered, key, value);
      } else {
        removed.push(key);
      }
    }
    let messageKey: 'extractedPaste' | 'filteredPaste' | 'extractedFilteredPaste';
    if (flat !== parsed && removed.length > 0) messageKey = 'extractedFilteredPaste';
    else if (flat !== parsed) messageKey = 'extractedPaste';
    else messageKey = 'filteredPaste';
    return { text: JSON.stringify(filtered, null, 4), messageKey };
  }

  return {
    /* state */
    overrides,
    allowedParams,
    allowedParamsError,
    availableCoins,
    marketLabels,
    configName,
    editCoin,
    inlineValues,
    fileValues,
    context,
    contextAware,
    /* lifecycle */
    init,
    setContext,
    load,
    setCoins,
    setConfigName,
    setOverrideConfigs,
    /* files */
    loadOverrideFile,
    cacheOverrideFile,
    cachedOverrideFile,
    markPendingWrite,
    snapshotAllFiles,
    snapshotPendingFiles,
    acknowledgePendingFiles,
    flushPendingFiles,
    pendingFileCount,
    fileSideError,
    /* edit flow */
    pickCoin,
    removeCoin,
    editCoinStart,
    closeEdit,
    addParam,
    removeParam,
    saveEditValues,
    collect,
    filterPaste,
  };
}

export type CoinOverridesStore = ReturnType<typeof useCoinOverrides>;
