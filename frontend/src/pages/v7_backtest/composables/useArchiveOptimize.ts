import { ref } from 'vue';
import type { I18nT } from '../types.i18n';

/**
 * The archive optimize-configs family (:9269-9421) — split out of
 * useArchive to stay under the 800-line ceiling: viewOptimizeConfig
 * (:9269-9284), the import-with-collision flow (:9327-9369), delete
 * (:9407-9421) and optimizeFromArchiveOptimizeConfig (:9371-9385).
 */

export interface ArchiveOptimizeSelection {
  path: string;
  name: string;
  version: string;
}

export interface ArchiveOptimizeContext {
  fetchFn: typeof fetch;
  archiveFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>>;
  archiveUrl(path: string): string;
  getSelectedName(): string;
  viewArchive(name: string, options?: { silent?: boolean }): Promise<void>;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  t: I18nT;
  choose?(options: {
    title: string;
    message: string;
    detail?: string;
    actions: Array<{ label: string; value: string | null; danger?: boolean; primary?: boolean }>;
  }): Promise<string | null>;
}

export interface ArchiveOptimizeActions {
  optimizeConfigJson: { value: unknown };
  optimizeViewOpen: { value: boolean };
  selectedOptimize: { value: ArchiveOptimizeSelection | null };
  viewOptimizeConfig(path: string, version: string, name?: string): Promise<void>;
  importOptimizeConfig(path: string, name: string, version: string): Promise<{ name?: string; optimize_version?: string } | null>;
  deleteOptimizeConfig(path: string, name: string, version: string): Promise<void>;
  optimizeFromConfig(path: string, name: string, version: string): Promise<void>;
}

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createArchiveOptimizeActions(ctx: ArchiveOptimizeContext): ArchiveOptimizeActions {
  const optimizeConfigJson = ref<unknown>(null);
  const optimizeViewOpen = ref(false);
  const selectedOptimize = ref<ArchiveOptimizeSelection | null>(null);

  /** viewOptimizeConfig (:9269-9284). */
  async function viewOptimizeConfig(path: string, version: string, name?: string): Promise<void> {
    selectedOptimize.value = { path, name: name ?? '', version: version || 'v7' };
    try {
      optimizeConfigJson.value = await ctx.archiveFetch(
        `/archives/${encodeURIComponent(ctx.getSelectedName())}/optimize-configs/config?path=${encodeURIComponent(path)}&version=${encodeURIComponent(version || 'v7')}`
      );
      optimizeViewOpen.value = true;
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.failedLoadOptimizeConfig', { msg: messageOf(error) }), 'err');
    }
  }

  /** requestArchiveOptimizeImport (:9327-9345) — surfaces detail.code via the error. */
  async function requestImport(path: string, importName: string, collision: string, version: string): Promise<Record<string, unknown>> {
    const response = await ctx.fetchFn(ctx.archiveUrl(`/archives/${encodeURIComponent(ctx.getSelectedName())}/optimize-configs/import`), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, name: importName.trim(), collision, optimize_version: version || 'v7' }),
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail: unknown = objectOf(payload).detail;
      const detailObject = detail && typeof detail === 'object' ? objectOf(detail) : {};
      const error = new Error(String((detail && typeof detail === 'object' ? detailObject.message : detail) || response.statusText));
      (error as Error & { status?: number; detail?: unknown }).status = response.status;
      (error as Error & { status?: number; detail?: unknown }).detail = detail;
      throw error;
    }
    return objectOf(payload);
  }

  /** chooseArchiveOptimizeCollision (:9347-9360). */
  function chooseCollision(error: unknown, importName: string): Promise<string | null> {
    const detail = (error as { detail?: unknown } | null)?.detail;
    const detailObject = detail && typeof detail === 'object' ? objectOf(detail) : {};
    const status = (error as { status?: number } | null)?.status;
    if (!ctx.choose || status !== 409 || detailObject.code !== 'optimize_config_exists') {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return ctx.choose({
      title: ctx.t('v7backtest.optimizeConfigExists'),
      message: String(detailObject.message ?? '') || ctx.t('v7backtest.localOptimizeExists', { name: importName }),
      detail: detailObject.suggested_copy_name ? ctx.t('v7backtest.suggestedCopyName', { name: String(detailObject.suggested_copy_name) }) : '',
      actions: [
        { label: ctx.t('v7backtest.overwrite'), value: 'overwrite', danger: true },
        { label: ctx.t('v7backtest.importAsCopy'), value: 'copy', primary: true },
        { label: ctx.t('common.cancel'), value: null },
      ],
    });
  }

  /** importArchiveOptimizeWithCollision (:9362-9369). */
  async function importWithCollision(path: string, importName: string, version: string): Promise<Record<string, unknown> | null> {
    try {
      return await requestImport(path, importName, 'error', version);
    } catch (error) {
      let collision: string | null = null;
      try {
        collision = await chooseCollision(error, importName);
      } catch {
        throw error;
      }
      if (!collision) return null;
      return requestImport(path, importName, collision, version);
    }
  }

  async function importOptimizeConfig(path: string, name: string, version: string): Promise<{ name?: string; optimize_version?: string } | null> {
    try {
      return await importWithCollision(path, name, version);
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.importFailed', { msg: messageOf(error) }), 'err');
      return null;
    }
  }

  /** deleteArchiveOptimizeConfig (:9407-9421). */
  async function deleteOptimizeConfig(path: string, name: string, version: string): Promise<void> {
    void name;
    try {
      await ctx.archiveFetch(
        `/archives/${encodeURIComponent(ctx.getSelectedName())}/optimize-configs/config?path=${encodeURIComponent(path)}&version=${encodeURIComponent(version || 'v7')}`,
        { method: 'DELETE' }
      );
      ctx.notify(ctx.t('v7backtest.optimizeConfigDeleted'), 'ok');
      await ctx.viewArchive(ctx.getSelectedName());
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.deleteFailed', { msg: messageOf(error) }), 'err');
    }
  }

  /** optimizeFromArchiveOptimizeConfig (:9371-9385). */
  async function optimizeFromConfig(path: string, name: string, version: string): Promise<void> {
    const importName = (name || String(path).split('/').pop()?.replace(/\.json$/, '') || '').trim(); // :9323-9325
    try {
      const data = await importWithCollision(path, importName, version);
      if (!data) return;
      ctx.notify(ctx.t('v7backtest.openingOptimizeConfig'), 'ok');
      const optimizeVersion = String(data.optimize_version || version).toLowerCase() === 'v8' ? 'v8' : 'v7';
      window.location.href = `/api/optimize-${optimizeVersion}/main_page?open_config=${encodeURIComponent(String(data.name || importName))}`;
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.openFailed', { msg: messageOf(error) }), 'err');
    }
  }

  return {
    optimizeConfigJson,
    optimizeViewOpen,
    selectedOptimize,
    viewOptimizeConfig,
    importOptimizeConfig,
    deleteOptimizeConfig,
    optimizeFromConfig,
  };
}
