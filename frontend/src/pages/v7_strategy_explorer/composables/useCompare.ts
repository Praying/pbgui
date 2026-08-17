import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import { makeProgressId, type ExplorerStore } from './useStrategyExplorer';
import type { CompareData, ExplorerOptions, ProgressData } from '../types';

/** Compare run + progress — port of runCompare (:2181-2244). */
export function useCompare(store: ExplorerStore) {
  const { apiBase, t } = store;
  const running = ref(false);
  const progress = ref({ pct: -1, message: '' });
  const result = ref<CompareData | null>(null);
  const summaryText = ref<string | null>(null);
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let progressId = '';

  function setProgress(value: number, message: string): void {
    const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
    progress.value = { pct, message: pct + '% - ' + (message || t('v7explore.runningCompare')) };
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
      void apiFetch<ProgressData>(apiBase, '/compare/progress/' + encodeURIComponent(id))
        .then((data) => {
          if (id !== progressId) return;
          setProgress(Number(data.progress || 0), data.message || t('v7explore.runningCompare'));
          if (data.done) stopPolling();
        })
        .catch(() => undefined);
    }, 700);
  }

  async function runCompare(): Promise<void> {
    stopPolling();
    const opts: ExplorerOptions = store.compareOptions();
    progressId = makeProgressId();
    const generation = ++store.generations.compare;
    opts.progress_id = progressId;
    running.value = true;
    store.setMessages([{ level: 'info', text: t('v7explore.runningCompare') }]);
    summaryText.value = t('v7explore.compareRunning');
    result.value = null;
    setProgress(0, t('v7explore.startingCompare'));
    startPolling(progressId);
    try {
      const data = await apiFetch<CompareData>(apiBase, '/compare', {
        method: 'POST',
        body: JSON.stringify({ config: store.state.config, options: opts, progress_id: progressId }),
      });
      if (generation !== store.generations.compare) {
        stopPolling();
        running.value = false;
        return;
      }
      stopPolling();
      setProgress(1, data.message || t('v7explore.compareFinished'));
      result.value = data;
      summaryText.value = null;
      const partial = data.summary?.coverage?.partial === true;
      store.setMessages([
        {
          level: partial || !data.ok ? 'warning' : 'info',
          text: (data.message || t('v7explore.compareFinished')) + (partial ? ' ' + t('v7explore.candleLimitPartial') : ''),
        },
      ]);
    } catch (err) {
      if (generation !== store.generations.compare) {
        stopPolling();
        running.value = false;
        return;
      }
      stopPolling();
      const message = t('v7explore.compareFailedDetail', { error: (err as Error).message });
      setProgress(1, message);
      summaryText.value = message;
      result.value = null;
      store.setMessages([{ level: 'error', text: message }]);
    } finally {
      running.value = false;
    }
  }

  return { running, progress, result, summaryText, runCompare };
}
