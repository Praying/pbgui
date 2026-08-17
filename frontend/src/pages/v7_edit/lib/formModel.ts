/**
 * The structured form state + field-io helpers — ports of v7_edit.html
 * :2140-2175 (coin selection), :2311-2324 (forced-mode mapping), :2580-2617
 * (getVal/getNum/getInt/getOptionalNum semantics) and :1646-1675 (max-cancel
 * / create bounds). Inputs are strings (the DOM's own representation) so the
 * legacy coercions round-trip byte-for-byte.
 */

export interface EditFormState {
  /* Row 1: Configuration & Identity */
  user: string;
  enabledOn: string;
  version: string;
  leverage: string;
  marginMode: string;
  loggingLevel: string;
  strategyKind: string;
  /* Row 2: Timing & Risk */
  minCoinAge: string;
  pnlsLookback: string;
  warmupRatio: string;
  maxLossPct: string;
  note: string;
  /* Row 3: Execution & Flags */
  priceDist: string;
  execDelay: string;
  marketOrderThreshold: string;
  filterMinCost: boolean;
  marketOrders: boolean;
  hedgeMode: boolean;
  autoGs: boolean;
  /* Advanced: modes & policies */
  forcedLong: string;
  forcedShort: string;
  hslSignalMode: string;
  hslCooldownPolicy: string;
  timeInForce: string;
  hslAcceptIncomplete: boolean;
  forceColdStartup: boolean;
  /* Advanced: execution & exchange sync */
  maxCancel: string;
  maxCreate: string;
  maxRestarts: string;
  recvWindow: string;
  orderMatchTol: string;
  fillsRecentOverlap: string;
  fillsConfirmOverlap: string;
  maxApiReq: string;
  /* Advanced: fees & order churn (v8) */
  exchangeSymbolCooldown: string;
  feeConversionAge: string;
  feePctFallback: string;
  feePctSanity: string;
  churnActivationCount: string;
  churnMarketDist: string;
  churnStabilityMinutes: string;
  churnWindowMinutes: string;
  /* Advanced: warmup & candle fetch */
  maxWarmupMin: string;
  warmupJitter: string;
  warmupConc: string;
  deferBroadCandleWarmup: boolean;
  archiveFetch: boolean;
  maxOhlcvFetches: string;
  candleLock: string;
  marketSnapshotStrategy: string;
  /* Advanced: forager */
  foragerHysteresis: string;
  maxForagerStale: string;
  maxForagerRefresh: string;
  enableForagerWs: boolean;
  foragerWsAudit: string;
  /* Advanced: storage, freshness & runtime */
  maxDiskCandles: string;
  maxMemCandles: string;
  inactiveTtl: string;
  maxActiveTailGap: string;
  balOverride: string;
  balHyst: string;
  memSnapshot: string;
  volRefresh: string;
  customEndpointsPath: string;
  startupPhaseBudgets: string;
  /* Advanced: logging (v8) */
  logDir: string;
  logMaxBytes: string;
  logBackupCount: string;
  logPersist: boolean;
  logRotation: boolean;
  logDebugProfiles: string;
  /* Advanced: monitoring (v8) */
  monitorEnabled: boolean;
  monitorRootDir: string;
  monitorSnapshotInterval: string;
  monitorCheckpoint: string;
  monitorRotationMb: string;
  monitorRotationMinutes: string;
  monitorMaxBytes: string;
  monitorPriceInterval: string;
  monitorRetainDays: string;
  monitorCompress: boolean;
  monitorEmitCandles: boolean;
  monitorRawFills: boolean;
  monitorRetainCandles: boolean;
  monitorRetainFills: boolean;
  monitorRetainTicks: boolean;
  /* Filters */
  marketCap: string;
  volMcap: string;
  onlyCpt: boolean;
  noticesIgnore: boolean;
  applyFilters: boolean;
  dynamicIgnore: boolean;
  /* Coin multiselects + tags (legacy msState :3691) */
  approvedLong: string[];
  approvedShort: string[];
  ignoredLong: string[];
  ignoredShort: string[];
  tags: string[];
  /* Bot long/short */
  longTwe: string;
  longNpos: string;
  shortTwe: string;
  shortNpos: string;
  longJson: string;
  shortJson: string;
  /* Raw JSON (base of collectConfig) */
  rawJson: string;
}

/** One dynamic "Additional Parameters" field (:2506-2555). */
export interface ExtraLiveField {
  readonly key: string;
  readonly kind: 'boolean' | 'number' | 'json' | 'null' | 'string';
  /** Input value: text for inputs/textareas, checked for booleans. */
  text: string;
  checked: boolean;
}

/** getNum (:2609) — parseFloat(value) || 0. */
export function numVal(raw: string): number {
  return parseFloat(raw) || 0;
}

/** getInt (:2610) — parseInt(value, 10) || 0. */
export function intVal(raw: string): number {
  return parseInt(raw, 10) || 0;
}

/** getOptionalNum (:2611-2616) — null for blank/unparseable input. */
export function getOptionalNum(raw: string): number | null {
  if (raw == null || String(raw).trim() === '') return null;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** forcedModeSelectValue (:2311-2324) — v7 maps long names onto short codes. */
export function forcedModeSelectValue(value: unknown, isV8: boolean): string {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (isV8) return normalized;
  const map: Record<string, string> = {
    normal: 'n',
    manual: 'm',
    graceful_stop: 'gs',
    'graceful-stop': 'gs',
    panic: 'p',
    tp_only: 't',
    'tp-only': 't',
    take_profit_only: 't',
  };
  return map[normalized] ?? normalized;
}

/** getCoinSelectionValue (:2144-2153) — 'all' | flat array | per-side object. */
export function getCoinSelectionValue(rawValue: unknown, side: 'long' | 'short', allowAll: boolean): string[] {
  if (allowAll && rawValue === 'all') return ['all'];
  if (Array.isArray(rawValue)) return rawValue.slice();
  if (rawValue && typeof rawValue === 'object') {
    const sideValue = (rawValue as Record<string, unknown>)[side];
    if (allowAll && sideValue === 'all') return ['all'];
    if (Array.isArray(sideValue)) return sideValue.slice();
  }
  return [];
}

/** collectApprovedCoinsValue (:2165-2175) — canonical 'all' collapse rule. */
export function collectApprovedCoinsValue(longValues: string[], shortValues: string[]): 'all' | { long: 'all' | string[]; short: 'all' | string[] } {
  const longAll = longValues.includes('all');
  const shortAll = shortValues.includes('all');
  const longSelected = longValues.filter((value) => value !== 'all');
  const shortSelected = shortValues.filter((value) => value !== 'all');
  if (longAll && shortAll && !longSelected.length && !shortSelected.length) return 'all';
  return {
    long: longAll ? 'all' : longSelected,
    short: shortAll ? 'all' : shortSelected,
  };
}

/** The seeded unique non-all coin union (loadSymbolsAndTags :2085-2086). */
export function seededCoinsFromSelection(
  approvedLong: readonly string[],
  approvedShort: readonly string[],
  ignoredLong: readonly string[],
  ignoredShort: readonly string[]
): string[] {
  return [...approvedLong, ...approvedShort, ...ignoredLong, ...ignoredShort]
    .filter((value, index, all) => value && value !== 'all' && all.indexOf(value) === index)
    .sort();
}

/** Placeholder-free empty state (populateForm overwrites every field). */
export function createEmptyFormState(): EditFormState {
  return {
    user: '', enabledOn: 'disabled', version: '', leverage: '', marginMode: '', loggingLevel: '', strategyKind: '',
    minCoinAge: '', pnlsLookback: '', warmupRatio: '', maxLossPct: '', note: '',
    priceDist: '', execDelay: '', marketOrderThreshold: '',
    filterMinCost: false, marketOrders: false, hedgeMode: false, autoGs: false,
    forcedLong: '', forcedShort: '', hslSignalMode: '', hslCooldownPolicy: '', timeInForce: '',
    hslAcceptIncomplete: false, forceColdStartup: false,
    maxCancel: '', maxCreate: '', maxRestarts: '', recvWindow: '', orderMatchTol: '',
    fillsRecentOverlap: '', fillsConfirmOverlap: '', maxApiReq: '',
    exchangeSymbolCooldown: '', feeConversionAge: '', feePctFallback: '', feePctSanity: '',
    churnActivationCount: '', churnMarketDist: '', churnStabilityMinutes: '', churnWindowMinutes: '',
    maxWarmupMin: '', warmupJitter: '', warmupConc: '', deferBroadCandleWarmup: false, archiveFetch: false,
    maxOhlcvFetches: '', candleLock: '', marketSnapshotStrategy: '',
    foragerHysteresis: '', maxForagerStale: '', maxForagerRefresh: '', enableForagerWs: false, foragerWsAudit: '',
    maxDiskCandles: '', maxMemCandles: '', inactiveTtl: '', maxActiveTailGap: '',
    balOverride: '', balHyst: '', memSnapshot: '', volRefresh: '',
    customEndpointsPath: '', startupPhaseBudgets: '',
    logDir: '', logMaxBytes: '', logBackupCount: '', logPersist: false, logRotation: false, logDebugProfiles: '',
    monitorEnabled: false, monitorRootDir: '', monitorSnapshotInterval: '', monitorCheckpoint: '',
    monitorRotationMb: '', monitorRotationMinutes: '', monitorMaxBytes: '', monitorPriceInterval: '',
    monitorRetainDays: '', monitorCompress: false, monitorEmitCandles: false, monitorRawFills: false,
    monitorRetainCandles: false, monitorRetainFills: false, monitorRetainTicks: false,
    marketCap: '', volMcap: '', onlyCpt: false, noticesIgnore: false, applyFilters: false, dynamicIgnore: false,
    approvedLong: [], approvedShort: [], ignoredLong: [], ignoredShort: [], tags: [],
    longTwe: '', longNpos: '', shortTwe: '', shortNpos: '', longJson: '', shortJson: '',
    rawJson: '',
  };
}

/** The DOM string form of a value (setVal writes whatever it gets; the DOM stores text). */
export function textVal(value: unknown): string {
  return String(value ?? '');
}

export interface ExecutionSyncBounds {
  cancelMin: number;
  createMax: number;
}

/** syncExecutionSyncFieldBounds values half (:1665-1668). */
export function executionSyncBounds(state: EditFormState): ExecutionSyncBounds {
  const cancelVal = intVal(state.maxCancel);
  const createVal = intVal(state.maxCreate);
  return { cancelMin: createVal + 1, createMax: Math.max(0, cancelVal - 1) };
}

/**
 * syncExecutionSyncFieldBounds changed-half (:1670-1674) — returns a NEW
 * state with the changed field clamped into the valid pair (legacy adjusted
 * the input in place).
 */
export function clampExecutionSync(state: EditFormState, changed: 'maxCancel' | 'maxCreate'): EditFormState {
  const cancelVal = intVal(state.maxCancel);
  const createVal = intVal(state.maxCreate);
  const next = { ...state };
  if (changed === 'maxCancel' && cancelVal <= createVal) {
    next.maxCancel = String(createVal + 1);
  } else if (changed === 'maxCreate' && createVal >= cancelVal) {
    next.maxCreate = String(Math.max(0, cancelVal - 1));
  }
  return next;
}

/** validateExecutionSyncFieldsForSave (:1646-1658) — save gate. */
export function isExecutionSyncValid(state: EditFormState): boolean {
  return intVal(state.maxCancel) > intVal(state.maxCreate);
}
