import { ref } from 'vue';
import { apiFetch, fetchMovieExportBlob } from '../lib/api';
import { makeProgressId, type ExplorerStore } from './useStrategyExplorer';
import { movieExportFilename, movieExportPresetValues } from '../lib/movieOptions';
import { buildMovieFigureSpec } from '../lib/movieFigure';
import { deepGet } from '../lib/format';
import { humanSize } from '../lib/format';
import type { MovieData, MovieExportOptionsData, ProgressData } from '../types';

const EXPORT_SETTINGS_KEY = 'pbgui_strategy_explorer_movie_export';

/** Selected export options (:2462-2481) — fps derives from the figure spec. */
export function selectedMovieExportOptions(
  values: { preset: string; width: number; height: number; scale: number; crf: number; ffmpeg_preset: string; codec: string },
  fps: number,
  filename: string
): Record<string, unknown> {
  return { ...values, fps, filename };
}

/** Movie Builder run/stop/export — ports of :2375-3065. */
export function useMovie(store: ExplorerStore, translate: (key: string, params?: Record<string, unknown>) => string) {
  const { apiBase, t } = store;
  const building = ref(false);
  const exporting = ref(false);
  const stopping = ref(false);
  const progress = ref({ pct: -1, message: '' });
  const outputMessage = ref<string | null>(null);
  const exportAvailable = ref(false);
  const download = ref<{ url: string; filename: string; label: string } | null>(null);
  const exportCodecs = ref<{ id: string; label?: string }[]>([]);
  const exportInfo = ref<string | null>(null);
  const lastMovieOptionsKey = ref('');
  const currentFrame = ref(0);
  const playbackPaused = ref(true);
  const lastMovieExportUrl = ref('');

  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let progressId = '';
  let abortController: AbortController | null = null;
  let exportAbortController: AbortController | null = null;

  function setProgress(value: number, message: string): void {
    const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
    progress.value = { pct, message: pct + '% - ' + (message || t('v7explore.generatingMovie')) };
  }
  function stopPolling(): void {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }
  store.generations.onStop(stopPolling);

  function startPolling(id: string): void {
    stopPolling();
    progressTimer = setInterval(() => {
      if (!id) return;
      void apiFetch<ProgressData>(apiBase, '/movie/progress/' + encodeURIComponent(id))
        .then((data) => {
          if (id !== progressId) return;
          setProgress(Number(data.progress || 0), data.message || t('v7explore.generatingMovie'));
          if (data.done) stopPolling();
        })
        .catch(() => undefined);
    }, 700);
  }

  function clearDownload(): void {
    if (lastMovieExportUrl.value) {
      try {
        URL.revokeObjectURL(lastMovieExportUrl.value);
      } catch {
        /* ignore */
      }
      lastMovieExportUrl.value = '';
    }
    download.value = null;
  }

  /** applyMovieFrameResult (:2892-2902) — render, enable export, then throw on failure. */
  function applyMovieResult(data: MovieData): void {
    store.lastMovieData.value = data;
    currentFrame.value = 0;
    outputMessage.value = data.message || '';
    exportAvailable.value = true;
    if (!data.ok || !(data.frames || []).length) {
      throw new Error(data.message || t('v7explore.noMovieFramesGenerated'));
    }
    store.persistStrategyRefreshState();
  }

  async function requestMovieFrames(id: string, signal: AbortSignal | null, generation: number): Promise<MovieData> {
    const opts = store.selectedMovieFrameOptions(id);
    const optsKey = store.movieFrameOptionsKey(opts);
    const data = await apiFetch<MovieData>(apiBase, '/movie/frames', {
      method: 'POST',
      signal: signal ?? undefined,
      body: JSON.stringify({ config: store.state.config, options: opts, progress_id: id }),
    });
    if (generation !== store.generations.movie) {
      const staleError = new Error('Movie request was superseded by a configuration change.');
      staleError.name = 'AbortError';
      throw staleError;
    }
    const result = data;
    applyMovieResult(result);
    lastMovieOptionsKey.value = optsKey;
    return result;
  }

  async function buildMovieFrames(): Promise<void> {
    if (abortController) abortController.abort();
    progressId = makeProgressId();
    const generation = ++store.generations.movie;
    building.value = true;
    stopping.value = false;
    setProgress(0, t('v7explore.generatingMovie'));
    clearDownload();
    startPolling(progressId);
    outputMessage.value = t('v7explore.generatingMovie');
    abortController = new AbortController();
    try {
      const data = await requestMovieFrames(progressId, abortController.signal, generation);
      setProgress(1, data.message || t('v7explore.movieBuilderFinished'));
      store.setMessages([{ level: data.ok ? 'info' : 'warning', text: data.message || t('v7explore.movieBuilderFinished') }]);
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        outputMessage.value = t('v7explore.movieBuilderStopped');
        store.setMessages([{ level: 'warning', text: t('v7explore.movieBuilderStopped') }]);
        exportAvailable.value = !!store.lastMovieData.value && !!(store.lastMovieData.value.frames || []).length;
        setProgress(1, t('v7explore.movieBuilderStopped'));
      } else {
        outputMessage.value = t('v7explore.movieFailed', { error: (err as Error).message });
        exportAvailable.value = !!store.lastMovieData.value && !!(store.lastMovieData.value.frames || []).length;
        setProgress(1, t('v7explore.movieFailed', { error: (err as Error).message }));
        store.setMessages([{ level: 'error', text: t('v7explore.movieBuilderFailed', { error: (err as Error).message }) }]);
      }
    } finally {
      stopPolling();
      building.value = false;
      stopping.value = true;
      abortController = null;
    }
  }

  /** stopMovieBuilder (:2405-2425) — cancel progress, abort fetches, message. */
  function stopMovieBuilder(): void {
    store.generations.movie += 1;
    const activeProgressId = progressId;
    const stoppingExport = !!exportAbortController;
    if (activeProgressId) {
      void apiFetch(apiBase, '/movie/progress/' + encodeURIComponent(activeProgressId) + '/cancel', { method: 'POST' }).catch(
        () => undefined
      );
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    if (exportAbortController) {
      exportAbortController.abort();
      exportAbortController = null;
    }
    stopPolling();
    const message = stoppingExport ? t('v7explore.movieExportStopped') : t('v7explore.movieBuilderStopped');
    setProgress(1, message);
    outputMessage.value = message;
    store.setMessages([{ level: 'warning', text: message }]);
  }

  /** selectedMovieExportOptions (:2462-2481) against the current controls. */
  function currentExportOptions(fps = 15): Record<string, unknown> {
    const c = store.controls;
    return selectedMovieExportOptions(
      {
        preset: c.exportPreset || 'Balanced',
        width: Math.floor(Number(c.exportWidth || 1600)),
        height: Math.floor(Number(c.exportHeight || 800)),
        scale: Math.floor(Number(c.exportScale || 1)),
        crf: Math.floor(Number(c.exportCrf || 18)),
        ffmpeg_preset: c.exportFfmpegPreset || 'veryfast',
        codec: c.exportCodec || 'auto',
      },
      fps,
      exportFilename()
    );
  }
  function exportFilename(): string {
    const meta = store.lastMovieData.value?.metadata || {};
    return movieExportFilename({
      exchange: meta.exchange,
      coin: meta.coin,
      engine: store.lastMovieData.value?.engine,
      start_time: meta.start_time,
    });
  }

  /** saveMovieExportSettings (:2449-2451). */
  function saveExportSettings(): void {
    try {
      window.localStorage.setItem(EXPORT_SETTINGS_KEY, JSON.stringify({ ...currentExportOptions(), filename: undefined }));
    } catch {
      /* storage unavailable */
    }
  }

  /** loadMovieExportOptions (:2504-2525). */
  async function loadMovieExportOptions(): Promise<void> {
    try {
      const data = await apiFetch<MovieExportOptionsData>(apiBase, '/movie/export/options');
      exportCodecs.value = data.codecs || [];
      if (exportCodecs.value.length && !exportCodecs.value.some((codec) => codec.id === store.controls.exportCodec)) {
        store.controls.exportCodec = 'auto';
      }
      exportInfo.value = deepGet<string>(data, ['encoder', 'label'], t('v7explore.exportDirectlyHint'));
      try {
        const saved = JSON.parse(window.localStorage.getItem(EXPORT_SETTINGS_KEY) || '{}') as Record<string, unknown>;
        if (saved && typeof saved === 'object') applyExportInputs({ ...(data.defaults || movieExportPresetValues('Balanced')), ...saved });
      } catch {
        applyExportInputs((data.defaults || movieExportPresetValues('Balanced')) as Record<string, unknown>);
      }
    } catch (err) {
      exportInfo.value = t('v7explore.movieExportOptionsUnavailable', { error: (err as Error).message });
    }
  }

  /** setMovieExportInputs (:2439-2448). */
  function applyExportInputs(vals: Record<string, unknown>): void {
    const c = store.controls;
    if (vals.preset) c.exportPreset = String(vals.preset);
    if (vals.width !== undefined) c.exportWidth = Number(vals.width);
    if (vals.height !== undefined) c.exportHeight = Number(vals.height);
    if (vals.scale !== undefined) c.exportScale = Number(vals.scale);
    if (vals.crf !== undefined) c.exportCrf = Number(vals.crf);
    if (vals.ffmpeg_preset !== undefined) c.exportFfmpegPreset = String(vals.ffmpeg_preset);
    if (vals.codec !== undefined) c.exportCodec = String(vals.codec);
  }

  /** applyMovieExportPreset / markMovieExportCustom (:2452-2461). */
  function applyExportPreset(preset: string): void {
    if (preset !== 'Custom') applyExportInputs(movieExportPresetValues(preset) as Record<string, unknown>);
    saveExportSettings();
  }
  function markExportCustom(): void {
    store.controls.exportPreset = 'Custom';
    saveExportSettings();
  }

  /** exportMovieMp4 (:2980-3065). */
  async function exportMovieMp4(): Promise<void> {
    if (exportAbortController) exportAbortController.abort();
    clearDownload();
    const generation = ++store.generations.movie;
    exporting.value = true;
    building.value = true;
    stopping.value = false;
    try {
      const needsMovieFrames =
        !store.lastMovieData.value ||
        !(store.lastMovieData.value.frames || []).length ||
        lastMovieOptionsKey.value !== store.movieFrameOptionsKey(store.selectedMovieFrameOptions(''));
      let data: MovieData | null = store.lastMovieData.value;
      if (needsMovieFrames) {
        progressId = makeProgressId();
        store.setMessages([{ level: 'info', text: t('v7explore.generatingMovieFramesForExport') }]);
        setProgress(0, t('v7explore.generatingMovieFramesForExport'));
        outputMessage.value = t('v7explore.generatingMovieFramesForExport');
        startPolling(progressId);
        abortController = new AbortController();
        data = await requestMovieFrames(progressId, abortController.signal, generation);
        stopPolling();
        abortController = null;
      }
      if (generation !== store.generations.movie) {
        const staleError = new Error('Movie export was superseded by a configuration change.');
        staleError.name = 'AbortError';
        throw staleError;
      }
      const spec = buildMovieFigureSpec(data!, store.selectedMovieSideKey(), {
        visible: store.controls.movieVisible,
        stepMins: Number(store.controls.movieStep || 1),
        balanceFallback: store.controls.balance,
        t: translate,
      }, 0, currentFrame.value);
      if (!spec || !(spec.frames || []).length) throw new Error('Movie export needs generated Plotly frames.');
      const playButton = (spec.layout.updatemenus as { buttons: { args: [string[], { frame: { duration: number } }] }[] }[])[0]?.buttons?.[0];
      const durationMs = playButton ? Number(playButton.args[1]?.frame?.duration) || 120 : 120;
      const fps = Number(durationMs) > 0 ? Math.max(1, Math.round(1000 / Number(durationMs))) : 15;
      const opts = currentExportOptions(fps);
      progressId = makeProgressId();
      opts.progress_id = progressId;
      store.setMessages([{ level: 'info', text: t('v7explore.exportingMovieMp4') }]);
      setProgress(0, t('v7explore.startingMovieExport'));
      startPolling(progressId);
      exportAbortController = new AbortController();
      const result = await fetchMovieExportBlob(
        apiBase,
        { figure: { data: spec.data, layout: spec.layout, frames: spec.frames }, options: opts, progress_id: progressId },
        exportFilename(),
        exportAbortController.signal
      );
      if (generation !== store.generations.movie) {
        const staleError = new Error('Movie export was superseded by a configuration change.');
        staleError.name = 'AbortError';
        throw staleError;
      }
      stopPolling();
      setProgress(1, t('v7explore.movieExportReady'));
      lastMovieExportUrl.value = URL.createObjectURL(result.blob);
      download.value = {
        url: lastMovieExportUrl.value,
        filename: result.filename || String(opts.filename) || 'movie.mp4',
        label: t('v7explore.downloadMp4Size', { size: humanSize(result.blob.size || 0) }),
      };
      store.setMessages([{ level: 'info', text: t('v7explore.movieExportReady') }]);
    } catch (err) {
      stopPolling();
      if ((err as Error).name === 'AbortError') {
        setProgress(1, t('v7explore.movieExportStopped'));
        store.setMessages([{ level: 'warning', text: t('v7explore.movieExportStopped') }]);
      } else {
        setProgress(1, t('v7explore.movieExportFailed', { error: (err as Error).message }));
        store.setMessages([{ level: 'error', text: t('v7explore.movieExportFailed', { error: (err as Error).message }) }]);
      }
    } finally {
      exporting.value = false;
      building.value = false;
      stopping.value = true;
      exportAbortController = null;
      abortController = null;
      saveExportSettings();
    }
  }

  return {
    building,
    exporting,
    stopping,
    progress,
    outputMessage,
    exportAvailable,
    download,
    exportCodecs,
    exportInfo,
    lastMovieOptionsKey,
    currentFrame,
    playbackPaused,
    applyMovieResult,
    buildMovieFrames,
    stopMovieBuilder,
    exportMovieMp4,
    loadMovieExportOptions,
    currentExportOptions,
    applyExportInputs,
    applyExportPreset,
    markExportCustom,
    saveExportSettings,
    setProgress,
  };
}
