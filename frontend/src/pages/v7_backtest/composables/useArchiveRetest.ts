import { ref } from 'vue';
import { archiveRetestDefaultDays, buildRetestPayload } from '../lib/archiveModel';
import type { ArchiveRetestFields, ArchiveRetestPayload } from '../types';
import type { I18nT } from '../types.i18n';

/**
 * The retest & replace flow (:8083-8161) — split out of useArchive to
 * stay under the 800-line ceiling: the own+selection gates, the
 * config-derived defaults (:8088-8091), queue-now (:8126-8139) and
 * create-schedule (:8140-8156).
 */

export interface ArchiveRetestFlowState {
  retestOpen: { value: boolean };
  retestDefaults: { value: { days: number; balance: number; exchanges: string[]; usePbguiData: boolean } | null };
  startRetestReplace(): Promise<void>;
  confirmRetestReplace(fields: ArchiveRetestFields): Promise<void>;
  confirmRetestSchedule(fields: ArchiveRetestFields, schedule: { cadence: string; time: string; weekday: number }): Promise<void>;
}

export interface ArchiveRetestContext {
  archiveFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>>;
  archiveResultFetch(path: string, endpoint: string, init?: RequestInit): Promise<Record<string, unknown>>;
  getSelected(): string[];
  getSelectedName(): string;
  isOwn(): boolean;
  getSettings(): { use_pbgui_market_data?: boolean | string };
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  viewArchive(name: string, options?: { silent?: boolean }): Promise<void>;
  setMode(mode: 'backtests' | 'optimize' | 'schedules'): void;
  wsRefresh(): void;
}

export function createArchiveRetestFlows(ctx: ArchiveRetestContext): ArchiveRetestFlowState {
  const retestOpen = ref(false);
  const retestDefaults = ref<{ days: number; balance: number; exchanges: string[]; usePbguiData: boolean } | null>(null);

  /** pbguiMarketDataDefaultCheckedAttr (:1478-1480). */
  function pbguiMarketDataDefault(): boolean {
    const value = ctx.getSettings().use_pbgui_market_data;
    return value === true || String(value).toLowerCase() === 'true';
  }

  /** retestReplaceSelectedArchive's gates + defaults (:8083-8124). */
  async function startRetestReplace(): Promise<void> {
    if (!ctx.isOwn()) {
      ctx.notify(ctx.t('v7backtest.retestReplaceOwnOnly'), 'err');
      return;
    }
    const selected = ctx.getSelected();
    if (selected.length === 0) {
      ctx.notify(ctx.t('v7backtest.nothingSelected'), 'err');
      return;
    }
    try {
      const cfg = await ctx.archiveResultFetch(selected[0]!, `/results/config?path=${encodeURIComponent(selected[0]!)}`);
      const backtest = (cfg.backtest as Record<string, unknown> | undefined) ?? {};
      const exchanges = Array.isArray(backtest.exchanges) ? (backtest.exchanges as string[]).map(String) : [];
      const startingBalance = Number(backtest.starting_balance);
      retestDefaults.value = {
        days: archiveRetestDefaultDays(cfg),
        balance: Number.isFinite(startingBalance) ? startingBalance : 1000,
        exchanges: exchanges.length > 0 ? exchanges : ['bybit'],
        usePbguiData: pbguiMarketDataDefault(),
      };
      retestOpen.value = true;
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.failedLoadConfig', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  /** The Queue Now action (:8126-8139). */
  async function confirmRetestReplace(fields: ArchiveRetestFields): Promise<void> {
    const selected = ctx.getSelected();
    const payload = buildRetestPayload(fields, selected);
    if (!payload) {
      ctx.notify(ctx.t('v7backtest.selectAtLeastOneExchange'), 'err');
      return;
    }
    try {
      const data = await ctx.archiveFetch(`/archives/${encodeURIComponent(ctx.getSelectedName())}/results/retest-replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      ctx.notify(ctx.t('v7backtest.queuedRetestReplacements', { n: Number(data.queued) || selected.length }), 'ok');
      ctx.wsRefresh();
      await ctx.viewArchive(ctx.getSelectedName());
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.retestReplaceFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  /** The Create Schedule action (:8140-8156). */
  async function confirmRetestSchedule(fields: ArchiveRetestFields, schedule: { cadence: string; time: string; weekday: number }): Promise<void> {
    const selected = ctx.getSelected();
    const payload: ArchiveRetestPayload | null = buildRetestPayload(fields, selected);
    if (!payload) {
      ctx.notify(ctx.t('v7backtest.selectAtLeastOneExchange'), 'err');
      return;
    }
    payload.cadence = schedule.cadence === 'weekly' ? 'weekly' : 'daily';
    payload.time = schedule.time || '02:00';
    payload.weekday = Number.parseInt(String(schedule.weekday), 10) || 0;
    try {
      await ctx.archiveFetch(`/archives/${encodeURIComponent(ctx.getSelectedName())}/retest-schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      ctx.notify(ctx.t('v7backtest.retestScheduleCreated'), 'ok');
      ctx.setMode('schedules');
      await ctx.viewArchive(ctx.getSelectedName());
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.scheduleFailed', { msg: error instanceof Error ? error.message : String(error) }), 'err');
    }
  }

  return { retestOpen, retestDefaults, startRetestReplace, confirmRetestReplace, confirmRetestSchedule };
}
