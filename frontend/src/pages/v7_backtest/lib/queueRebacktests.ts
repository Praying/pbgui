/**
 * The client-side rebacktest queue posts — the shared body of
 * rebacktestSelected (:7928-7952) and rebacktestSelectedLegacy
 * (:8224-8246): for every selected result, fetch its config, clone it
 * once per exchange with the new dates/balance (and the PBGui
 * market-data dir when requested) and POST each clone to /queue.
 */

import type { I18nT } from '../types.i18n';
import type { RebacktestFields } from '../types';

export type RecordableConfig = Record<string, unknown>;

export interface QueueRebacktestsOptions {
  apiBase: string;
  paths: readonly string[];
  fields: RebacktestFields;
  /** apiFetch('/results/config?path=…') per path. */
  fetchConfig(path: string): Promise<Record<string, unknown>>;
  /** The queue name for one path (:7872 / :8163-8167). */
  nameFor(path: string): string;
  /** apiFetch('/pbgui_data_path').path — '' when the toggle is off. */
  pbguiPath: string;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  wsRefresh(): void;
  fetchFn?: typeof fetch;
}

function object(value: unknown): RecordableConfig {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RecordableConfig) : {};
}

export async function queueRebacktests(options: QueueRebacktestsOptions): Promise<void> {
  const fetchFn = options.fetchFn ?? fetch;
  try {
    await Promise.all(
      options.paths.map(async (path) => {
        const config = await options.fetchConfig(path);
        const queuePosts = options.fields.exchanges.map(async (exchange) => {
          const cfgForExchange = object(JSON.parse(JSON.stringify(config)));
          const backtest = object(cfgForExchange.backtest);
          backtest.start_date = options.fields.start;
          backtest.end_date = options.fields.end;
          backtest.starting_balance = options.fields.balance;
          backtest.exchanges = [exchange];
          if (options.pbguiPath) backtest.ohlcv_source_dir = options.pbguiPath;
          cfgForExchange.backtest = backtest;
          const response = await fetchFn(`${options.apiBase}/queue`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: options.nameFor(path), config: cfgForExchange }),
          });
          if (!response.ok) {
            const data: unknown = await response.json().catch(() => ({}));
            const detail = object(data).detail;
            throw new Error(String(detail ?? response.statusText));
          }
        });
        await Promise.all(queuePosts);
      })
    );
    options.notify(options.t('v7backtest.queuedBacktests', { n: options.paths.length * options.fields.exchanges.length }), 'ok');
    options.wsRefresh();
  } catch (error) {
    options.notify(
      options.t('v7backtest.failedWithMsg', { msg: error instanceof Error ? error.message : String(error) }),
      'err'
    );
  }
}
