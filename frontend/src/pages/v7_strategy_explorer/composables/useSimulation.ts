import { ref } from 'vue';
import { apiFetch } from '../lib/api';
import { makeProgressId, type ExplorerStore } from './useStrategyExplorer';
import type { ExplorerOptions, ProgressData, SimulationData } from '../types';

/**
 * Local simulation / PB7-8 engine runs — port of runSimulation and its
 * progress polling (:2056-2180) plus the progress interval helper shared
 * with compare and movie (:2170-2180 pattern).
 */
export function useSimulation(store: ExplorerStore) {
  const { apiBase, t } = store;
  const running = ref(false);
  const progress = ref({ pct: -1, message: '' });
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let progressId = '';

  function setProgress(value: number, message: string): void {
    const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0) * 100)));
    progress.value = { pct, message: pct + '% - ' + (message || t('v7explore.runningSimulation')) };
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
      void apiFetch<ProgressData>(apiBase, '/simulate/progress/' + encodeURIComponent(id))
        .then((data) => {
          if (id !== progressId) return;
          setProgress(Number(data.progress || 0), data.message || t('v7explore.runningSimulation'));
          if (data.done) stopPolling();
        })
        .catch(() => undefined);
    }, 700);
  }

  async function runSimulation(mode: string): Promise<void> {
    stopPolling();
    const opts: ExplorerOptions = store.simulationOptions();
    const generation = ++store.generations.simulation;
    store.state.activeSimulationMode = mode;
    progressId = makeProgressId();
    opts.progress_id = progressId;
    running.value = true;
    store.setMessages([]);
    setProgress(0, t('v7explore.startingSimulation'));
    startPolling(progressId);
    try {
      const data = await apiFetch<SimulationData>(apiBase, '/simulate', {
        method: 'POST',
        body: JSON.stringify({ config: store.state.config, options: opts, mode, progress_id: progressId }),
      });
      if (generation !== store.generations.simulation) {
        stopPolling();
        running.value = false;
        return;
      }
      stopPolling();
      setProgress(1, data.message || t('v7explore.simulationFinished'));
      store.state.simulations[mode] = data;
      store.state.activeSimulationMode = mode;
      if (!data.ok) store.setMessages([{ level: 'warning', text: data.message || 'Simulation finished.' }]);
    } catch (err) {
      if (generation !== store.generations.simulation) {
        stopPolling();
        running.value = false;
        return;
      }
      stopPolling();
      const message = t('v7explore.simulationFailed', { error: (err as Error).message });
      setProgress(1, message);
      store.setMessages([{ level: 'error', text: message }]);
    } finally {
      running.value = false;
    }
  }

  return { running, progress, runSimulation };
}
