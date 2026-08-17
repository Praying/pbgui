import { ref } from 'vue';
import type { BacktestSettings, SettingsPatch } from '../types';
import { applyWsSettings } from './useQueueWs';

/**
 * Backtest settings store — loadSettings single-flight (:1467-1476),
 * saveSettingsFromModal (:1587-1619) and cleanHlcvsNow (:1621-1642).
 */

export const DEFAULT_SETTINGS: BacktestSettings = {
  autostart: false,
  cpu: 1,
  cpu_max: null,
  hsl_signal_modes: [],
  exchange_options: [],
  use_pbgui_market_data: false,
  hlcvs_cleanup_enabled: false,
  hlcvs_cleanup_days: 7,
  hlcvs_cleanup_interval_h: 24,
};

export interface SettingsStoreOptions {
  apiBase: string;
  fetchFn?: typeof fetch;
  /** navigator.hardwareConcurrency seam for tests. */
  hardwareConcurrency?: number;
}

export interface CleanupResult {
  removed: number;
  freed_mb: number;
  errors: number;
  skipped_locked: number;
  targets: { label?: string }[];
  targetLabels: string[];
}

async function requestJson(fetchFn: typeof fetch, url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const resp = await fetchFn(url, { credentials: 'same-origin', ...init });
  const data: unknown = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const body = data as { detail?: unknown };
    const detail = typeof body.detail === 'string' ? body.detail : resp.statusText;
    throw new Error(detail);
  }
  return (data ?? {}) as Record<string, unknown>;
}

/** effectiveCpuMax (:1483-1486) — cpu_max, else hardware, else cpu, else 1. */
export function effectiveCpuMax(
  settings: Pick<BacktestSettings, 'cpu_max' | 'cpu'>,
  hardwareConcurrency: number | undefined
): number {
  const cpuMax = Number(settings.cpu_max);
  if (Number.isFinite(cpuMax) && cpuMax >= 1) return cpuMax;
  return Number(hardwareConcurrency) || Number(settings.cpu) || 1;
}

export function useSettings(options: SettingsStoreOptions) {
  const fetchFn = options.fetchFn ?? fetch;
  const settings = ref<BacktestSettings>({ ...DEFAULT_SETTINGS });
  let loadFlight: Promise<BacktestSettings> | null = null;

  /** loadSettings (:1467-1476) — single-flight, full replace. */
  function loadSettings(): Promise<BacktestSettings> {
    if (loadFlight) return loadFlight;
    loadFlight = requestJson(fetchFn, options.apiBase + '/settings')
      .then((data) => {
        settings.value = { ...DEFAULT_SETTINGS, ...(data as Partial<BacktestSettings>) };
        return settings.value;
      })
      .finally(() => {
        loadFlight = null;
      });
    return loadFlight;
  }

  /** The WS push merge target (:1296-1303) — immutable replace. */
  function applyWs(partial: Record<string, unknown>): void {
    settings.value = applyWsSettings(settings.value, partial);
  }

  /** saveSettingsFromModal (:1587-1619) — POST + optimistic local merge. */
  async function saveSettings(patch: SettingsPatch): Promise<boolean> {
    try {
      await requestJson(fetchFn, options.apiBase + '/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      settings.value = { ...settings.value, ...patch };
      return true;
    } catch {
      return false;
    }
  }

  /** cleanHlcvsNow (:1621-1642) — days default 7 (:1622). */
  async function cleanHlcvsNow(daysInput: number): Promise<CleanupResult> {
    const days = Number.parseInt(String(daysInput ?? ''), 10) || 7;
    const data = await requestJson(fetchFn, options.apiBase + '/settings/hlcvs-cleanup-now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    });
    const targets = Array.isArray(data.targets) ? (data.targets as { label?: string }[]) : [];
    return {
      removed: Number(data.removed) || 0,
      freed_mb: Number(data.freed_mb) || 0,
      errors: Number(data.errors) || 0,
      skipped_locked: Number(data.skipped_locked) || 0,
      targets,
      targetLabels: targets.map((t) => String((t ?? {}).label ?? '').trim()).filter(Boolean),
    };
  }

  return {
    settings,
    loadSettings,
    applyWs,
    saveSettings,
    cleanHlcvsNow,
    effectiveCpuMax: () => {
      // an explicitly-passed hardwareConcurrency (even undefined) overrides
      // the navigator value — the tests inject undefined to disable it
      const hw = Object.prototype.hasOwnProperty.call(options, 'hardwareConcurrency')
        ? options.hardwareConcurrency
        : typeof navigator !== 'undefined'
          ? (navigator.hardwareConcurrency as number | undefined)
          : undefined;
      return effectiveCpuMax(settings.value, hw);
    },
  };
}
