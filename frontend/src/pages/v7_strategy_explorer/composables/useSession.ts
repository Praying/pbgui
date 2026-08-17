import { apiFetch } from '../lib/api';
import { sessionUrl } from '../config';
import type { ExplorerStore } from './useStrategyExplorer';
import type { MovieData, PageConfig, PageMessage, RefreshCachePayload, SessionData, StrategySnapshot } from '../types';

/** Hooks the session bootstrap needs from the movie flow and version UI. */
export interface SessionContext {
  configureVersionUi(page: PageConfig): void;
  applyMovieResult(data: MovieData): void;
  buildMovieFrames(): void;
  /** lastMovieOptionsKey = movieFrameOptionsKey(selectedMovieFrameOptions('')) (:3101). */
  syncLastMovieOptionsKey(): void;
  movieStatus: { value: string };
}

/**
 * Session bootstrap — port of loadSession/applySessionBootstrap
 * (:3080-3156): /session first, then (v8) a cached-config revalidation
 * snapshot, restoring refresh-cache controls/movie/stage and applying the
 * backtest-result handoff.
 */
export function useSession(store: ExplorerStore, ctx: SessionContext) {
  const { adapter, apiBase, t } = store;

  async function applySessionBootstrap(
    data: SessionData,
    snapshot: StrategySnapshot,
    cached: RefreshCachePayload | null,
    warning: string
  ): Promise<SessionData | null> {
    const sessionGeneration = store.generations.session;
    const snapshotGeneration = store.generations.snapshot;
    ctx.configureVersionUi(data.page || {});
    if (Array.isArray((data.page?.hsl_signal_modes as string[] | null) ?? null)) store.state.hslSignalModes = data.page!.hsl_signal_modes!;
    store.state.source = (snapshot.source as string) || (warning ? 'refresh-cache' : 'default');
    store.applySnapshot(snapshot || ({} as StrategySnapshot));
    store.syncOptionsFromConfig(snapshot || {});
    await store.populateMarkets();
    if (store.generations.session !== sessionGeneration || store.generations.snapshot !== snapshotGeneration) return null;
    store.inferInitialSelectors(snapshot || {});
    if (cached) store.restoreControlsFromCache(cached);
    store.applyInitialResultPath(data.result_path || store.resultPath || '');
    store.applyBacktestHandoff(data.handoff || {}, data.result_path || store.resultPath || '');
    ctx.movieStatus.value = data.movie?.message || t('v7explore.buildReplayFrames');
    const controls = cached && cached.controls ? cached.controls : {};
    let stage = String(controls.stage || 'analysis');
    const validStages = ['analysis', 'exchange-state', 'raw', 'simulation', 'compare', 'movie'];
    if (!validStages.includes(stage)) stage = 'analysis';
    store.controls.stage = stage;
    if (cached && cached.movie_data) {
      ctx.applyMovieResult(cached.movie_data);
      ctx.syncLastMovieOptionsKey();
    }
    let messages: PageMessage[] = data.messages || snapshot.messages || [];
    if (warning) messages = [{ level: 'warning', text: warning }, ...messages];
    store.setMessages(messages);
    store.persistStrategyRefreshState();
    if (stage === 'movie' && controls.movie_generated && !(cached && cached.movie_data)) {
      setTimeout(() => ctx.buildMovieFrames(), 0);
    }
    return data;
  }

  async function loadSessionInner(): Promise<void> {
    const sessionGeneration = ++store.generations.session;
    const snapshotGeneration = ++store.generations.snapshot;
    const cached = store.readRefreshState();
    const data = await apiFetch<SessionData>(apiBase, sessionUrl(adapter, store.draftId.value, store.resultPath));
    if (!cached || !cached.config) {
      await applySessionBootstrap(data, data.snapshot || {}, null, '');
      return;
    }
    try {
      const snapshot = await apiFetch<StrategySnapshot>(apiBase, '/snapshot', {
        method: 'POST',
        body: JSON.stringify({ config: cached.config, options: store.cachedOptions(cached) }),
      });
      snapshot.source = 'refresh-cache';
      await applySessionBootstrap(data, snapshot, cached, '');
    } catch {
      await applySessionBootstrap(data, data.snapshot || {}, null, '');
    }
    void sessionGeneration;
    void snapshotGeneration;
  }

  /** Draft-expiry fallback (:3132-3150) then the shared error surface (:3151-3155). */
  async function loadSession(): Promise<void> {
    const sessionGeneration = store.generations.session + 1;
    const snapshotGeneration = store.generations.snapshot + 1;
    try {
      await loadSessionInner();
      return;
    } catch (err) {
      const message = String((err as Error)?.message || '');
      const cached = store.readRefreshState();
      const missingDraft = adapter.isV8 && store.draftId.value && message.indexOf('draft not found') >= 0;
      if (!missingDraft || !cached || !cached.config) {
        if (store.generations.session === sessionGeneration && store.generations.snapshot === snapshotGeneration) {
          store.setMessages([{ level: 'error', text: t('v7explore.sessionLoadFailed', { error: message }) }]);
        }
        return;
      }
      try {
        const snapshot = await apiFetch<StrategySnapshot>(apiBase, '/snapshot', {
          method: 'POST',
          body: JSON.stringify({ config: cached.config, options: store.cachedOptions(cached) }),
        });
        store.draftId.value = '';
        snapshot.source = 'refresh-cache';
        await applySessionBootstrap(
          { page: {}, handoff: {}, movie: { message: t('v7explore.restoredMovieState') }, messages: [] },
          snapshot,
          cached,
          'The server-side handoff draft expired. PBGui restored the non-sensitive Strategy Explorer and Movie state from this browser tab; stored-result Compare provenance is no longer available.',
        );
      } catch (err2) {
        if (store.generations.session === sessionGeneration && store.generations.snapshot === snapshotGeneration) {
          store.setMessages([{ level: 'error', text: t('v7explore.sessionLoadFailed', { error: (err2 as Error).message }) }]);
        }
      }
    }
  }

  return { loadSession };
}
