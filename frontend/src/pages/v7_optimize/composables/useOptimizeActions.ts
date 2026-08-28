/** Secondary Optimize workflows: archive, imports, plots, seeds and handoffs. */
import { ref } from 'vue';
import { apiFetch } from '@/shared/api';
import type { OptimizeAdapter } from '../config';
import { applyOptimizeSeed, isObject, objectValue } from '../lib/configModel';
import type { ConfigPayload, ResultSummary } from '../types';

export interface ArchiveSummary { name: string; optimize_configs?: number; [key: string]: unknown }
export interface ArchiveConfig { name?: string; path: string; relative_path?: string; [key: string]: unknown }
export interface PlotState {
  open: boolean;
  kind: 'html' | 'url' | 'text';
  title: string;
  html: string;
  url: string;
  text: string;
  sessionId: string;
}

type Requester = <T = Record<string, unknown>>(url: string, init?: RequestInit) => Promise<T>;

export interface OptimizeActionsOptions {
  adapter: OptimizeAdapter;
  request?: Requester;
  notify?: (message: string, kind?: 'info' | 'success' | 'error') => void;
}

function normalizeImportName(value: unknown): string {
  const raw = String(value ?? '').trim().replace(/\.json$/i, '');
  return raw.replace(/[\\/\x00]+/g, '_').replace(/\s+/g, '_').replace(/^[._]+|[._]+$/g, '').trim();
}

export function useOptimizeActions(options: OptimizeActionsOptions) {
  const { adapter } = options;
  const request: Requester = options.request ?? apiFetch;
  const archives = ref<ArchiveSummary[]>([]);
  const archiveConfigs = ref<ArchiveConfig[]>([]);
  const archiveName = ref('');
  const busy = ref(false);
  const plot = ref<PlotState>({ open: false, kind: 'text', title: '', html: '', url: '', text: '', sessionId: '' });

  function notify(message: string, kind: 'info' | 'success' | 'error' = 'info'): void {
    options.notify?.(message, kind);
  }

  async function prepareImport(config: Record<string, unknown>, name: string): Promise<ConfigPayload & { name: string }> {
    const payload = await request<ConfigPayload>(`${adapter.apiBase}/configs/prepare`, {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
    return { ...payload, name: normalizeImportName(name) || payload.name || 'imported_optimize' };
  }

  async function loadArchives(): Promise<void> {
    const data = await request<{ archives?: ArchiveSummary[] }>(`${adapter.archiveApiBase}/archives`);
    archives.value = data.archives ?? [];
    if (!archiveName.value || !archives.value.some((item) => item.name === archiveName.value)) {
      archiveName.value = archives.value.find((item) => Number(item.optimize_configs || 0) > 0)?.name || archives.value[0]?.name || '';
    }
  }

  async function loadArchiveConfigs(name: string): Promise<void> {
    archiveName.value = name;
    archiveConfigs.value = [];
    if (!name) return;
    const data = await request<{ configs?: ArchiveConfig[] }>(
      `${adapter.archiveApiBase}/archives/${encodeURIComponent(name)}/optimize-configs?version=${adapter.version}`,
    );
    archiveConfigs.value = (data.configs ?? []).slice().sort((a, b) => String(a.name || a.path).localeCompare(String(b.name || b.path)));
  }

  async function importArchiveConfig(
    archive: string,
    path: string,
    name: string,
    collision: 'error' | 'copy' | 'overwrite' = 'error',
  ): Promise<string> {
    const data = await request<{ name?: string }>(
      `${adapter.archiveApiBase}/archives/${encodeURIComponent(archive)}/optimize-configs/import`,
      {
        method: 'POST',
        body: JSON.stringify({ path, name, collision, optimize_version: adapter.version }),
      },
    );
    return normalizeImportName(data.name) || normalizeImportName(name);
  }

  async function archiveSelected(names: string[]): Promise<void> {
    if (!names.length) return;
    busy.value = true;
    try {
      const settings = await request<{ my_archive?: string }>(`${adapter.archiveApiBase}/archives/settings`);
      const ownArchive = String(settings.my_archive || '').trim();
      if (!ownArchive) throw new Error('No own archive configured');
      for (const name of names) {
        await request(`${adapter.archiveApiBase}/archives/${encodeURIComponent(ownArchive)}/add-optimize-config`, {
          method: 'POST',
          body: JSON.stringify({ config_name: name, optimize_version: adapter.version }),
        });
      }
      notify(`${names.length} optimize config(s) added to ${ownArchive}`, 'success');
    } finally {
      busy.value = false;
    }
  }

  async function launch3d(result: ResultSummary): Promise<void> {
    const data = await request<{ html?: string; output?: string; message?: string }>(`${adapter.apiBase}/results/3d-plot`, {
      method: 'POST',
      body: JSON.stringify({ path: result.path }),
    });
    plot.value = {
      open: true,
      kind: data.html ? 'html' : 'text',
      title: `${adapter.label} 3D Plot — ${String(result.name || result.result || '')}`,
      html: data.html || '',
      url: '',
      text: data.output || data.message || '',
      sessionId: '',
    };
  }

  async function launchParetoDash(result: ResultSummary): Promise<void> {
    const data = await request<{ url?: string; session_id?: string }>(`${adapter.apiBase}/results/pareto-dash`, {
      method: 'POST',
      body: JSON.stringify({ path: result.path }),
    });
    if (!data.url || !data.session_id) throw new Error('Pareto Dash launch returned no URL');
    plot.value = {
      open: true,
      kind: 'url',
      title: `${adapter.label} Pareto Dash — ${String(result.name || result.result || '')}`,
      html: '',
      url: data.url,
      text: '',
      sessionId: data.session_id,
    };
  }

  async function closePlot(): Promise<void> {
    const current = plot.value;
    plot.value = { open: false, kind: 'text', title: '', html: '', url: '', text: '', sessionId: '' };
    if (current.sessionId) {
      await request(`${adapter.apiBase}/results/pareto-dash/${encodeURIComponent(current.sessionId)}`, { method: 'DELETE' });
    }
  }

  async function resultConfig(path: string): Promise<ConfigPayload> {
    return request<ConfigPayload>(`${adapter.apiBase}/results/config?path=${encodeURIComponent(path)}`);
  }

  async function seedParetos(resultPath: string, paths: string[], suggestedName: string): Promise<Record<string, unknown>> {
    const unique = [...new Set(paths.map((path) => path.trim()).filter(Boolean))];
    if (!unique.length) throw new Error('No paretos selected');
    let seedPath = unique[0]!;
    if (unique.length > 1) {
      const bundle = await request<{ path?: string }>(`${adapter.apiBase}/paretos/seed-bundle`, {
        method: 'POST',
        body: JSON.stringify({ result_path: resultPath, paths: unique }),
      });
      seedPath = String(bundle.path || '');
    }
    if (!seedPath) throw new Error('Could not prepare pareto seed path');
    const payload = await resultConfig(resultPath);
    const config = applyOptimizeSeed(payload.config, 'path', seedPath);
    return { ...config, name: normalizeImportName(suggestedName), override_configs: objectValue(payload.override_configs) };
  }

  async function seedWholeResult(resultPath: string, suggestedName: string): Promise<Record<string, unknown>> {
    const payload = await resultConfig(resultPath);
    const seedPath = String(resultPath || '').replace(/[\\/]+$/, '') + '/pareto';
    const config = applyOptimizeSeed(payload.config, 'path', seedPath);
    return { ...config, name: normalizeImportName(suggestedName), override_configs: objectValue(payload.override_configs) };
  }

  async function resumeResult(resultPath: string, suggestedName: string): Promise<string> {
    if (!adapter.isV8) throw new Error('Checkpoint resume is only available for PB8');
    const name = (normalizeImportName(suggestedName) || 'checkpoint') + '_resume';
    const data = await request<{ filename?: string }>(`${adapter.apiBase}/results/resume`, {
      method: 'POST',
      body: JSON.stringify({ name: name.slice(0, 120), path: resultPath }),
    });
    if (!data.filename) throw new Error('Could not create a managed queue item for checkpoint resume');
    return data.filename;
  }

  async function paretoFile(path: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`${adapter.apiBase}/paretos/file?path=${encodeURIComponent(path)}`);
  }

  function extractConfigSections(config: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of ['config_version', 'backtest', 'bot', 'live', 'logging', 'monitor', 'optimize', 'pbgui', 'coin_overrides']) {
      if (Object.prototype.hasOwnProperty.call(config, key)) result[key] = config[key];
    }
    return result;
  }

  function normalizeParetoPayload(payload: Record<string, unknown>): ConfigPayload {
    if (isObject(payload.config)) {
      return { config: payload.config, override_configs: objectValue(payload.override_configs) };
    }
    return { config: payload, override_configs: {} };
  }

  function backtestMainPageUrl(params: Record<string, string>): string {
    const search = new URLSearchParams(params);
    return `${adapter.backtestApiBase}/main_page?${search.toString()}`;
  }

  async function backtestParetos(items: { path: string; name?: string }[]): Promise<string> {
    if (!items.length) throw new Error('No paretos selected');
    const payloads = await Promise.all(items.map(async (item) => ({
      item,
      payload: normalizeParetoPayload(await paretoFile(item.path)),
    })));
    if (payloads.length === 1) {
      const entry = payloads[0]!;
      const draft = await request<{ draft_id?: string }>(`${adapter.backtestApiBase}/optimize-draft`, {
        method: 'POST',
        body: JSON.stringify({
          config: extractConfigSections(entry.payload.config),
          override_configs: objectValue(entry.payload.override_configs),
        }),
      });
      return backtestMainPageUrl({
        opt_draft_id: String(draft.draft_id || ''),
        draft_name: String(entry.item.name || 'pareto_backtest'),
      });
    }
    const draft = await request<{ draft_id?: string }>(`${adapter.backtestApiBase}/queue-draft`, {
      method: 'POST',
      body: JSON.stringify({
        items: payloads.map(({ item, payload }) => ({
          name: String(item.name || 'pareto_backtest'),
          config: extractConfigSections(payload.config),
          override_configs: objectValue(payload.override_configs),
        })),
      }),
    });
    return backtestMainPageUrl({ queue_draft_id: String(draft.draft_id || '') });
  }

  async function pbguiDataPath(): Promise<string> {
    const data = await request<{ path?: string }>(`${adapter.apiBase}/pbgui_data_path`);
    return String(data.path || '');
  }

  async function loadSymbols(exchange: string): Promise<{ symbols: string[]; catalog?: Record<string, string> }> {
    return request<{ symbols?: string[]; catalog?: Record<string, string> }>(`${adapter.metadataApiBase}/symbols?exchange=${encodeURIComponent(exchange)}`) as Promise<{ symbols: string[]; catalog?: Record<string, string> }>;
  }

  async function loadIncomingDraft(draftId: string, suggestedName = '', kind: 'optimize' | 'migration' = 'optimize'): Promise<ConfigPayload & { name: string }> {
    const draft = await request<{ config?: Record<string, unknown>; override_configs?: Record<string, unknown>; name?: string; migration_report?: Record<string, unknown> }>(
      kind === 'migration'
        ? `${adapter.apiBase.replace(/\/optimize-v[78]$/, '/optimize-v8')}/migration-draft/${encodeURIComponent(draftId)}`
        : `${adapter.backtestApiBase}/optimize-draft/${encodeURIComponent(draftId)}`,
    );
    if (!isObject(draft.config)) throw new Error('Incoming optimize draft did not contain a config');
    const prepared = await prepareImport(draft.config, suggestedName || String(draft.name || 'incoming_optimize'));
    return { ...prepared, override_configs: objectValue(draft.override_configs), migration_report: draft.migration_report };
  }

  async function ohlcvPreflight(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`${adapter.apiBase}/ohlcv-preflight`, { method: 'POST', body: JSON.stringify({ config }) });
  }

  async function startOhlcvPreload(config: Record<string, unknown>): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`${adapter.apiBase}/ohlcv-preload`, { method: 'POST', body: JSON.stringify({ config }) });
  }

  async function loadOhlcvPreload(jobId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`${adapter.apiBase}/ohlcv-preload/${encodeURIComponent(jobId)}`);
  }

  async function stopOhlcvPreload(jobId: string): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>(`${adapter.apiBase}/ohlcv-preload/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  }

  async function migrateV7(source: { name?: string; path?: string }, targetName: string): Promise<{ name: string; draftId: string }> {
    const body = source.path ? { source_path: source.path, target_name: targetName } : { source_name: source.name, target_name: targetName };
    const data = await request<{ name?: string; draft_id?: string }>(`${adapter.apiBase.replace(/\/optimize-v[78]$/, '/optimize-v8')}/migrate-v7`, { method: 'POST', body: JSON.stringify(body) });
    return { name: String(data.name || targetName), draftId: String(data.draft_id || '') };
  }

  function paretoExplorerUrl(resultPath: string, paretoPath = ''): string {
    const params = new URLSearchParams({ result_path: resultPath, optimize_version: adapter.version });
    if (paretoPath) params.set('pareto_path', paretoPath);
    return `${adapter.paretoExplorerBase}/main_page?${params.toString()}`;
  }

  return {
    archives,
    archiveConfigs,
    archiveName,
    busy,
    plot,
    prepareImport,
    loadArchives,
    loadArchiveConfigs,
    importArchiveConfig,
    archiveSelected,
    launch3d,
    launchParetoDash,
    closePlot,
    resultConfig,
    seedParetos,
    seedWholeResult,
    resumeResult,
    paretoFile,
    backtestParetos,
    pbguiDataPath,
    loadSymbols,
    loadIncomingDraft,
    ohlcvPreflight,
    startOhlcvPreload,
    loadOhlcvPreload,
    stopOhlcvPreload,
    migrateV7,
    paretoExplorerUrl,
  };
}
