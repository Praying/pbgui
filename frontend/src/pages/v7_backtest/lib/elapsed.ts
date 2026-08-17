import { onScopeDispose, ref } from 'vue';

/**
 * The archive-pull elapsed ticker (v7_backtest.html:9495-9529): a 1 s
 * interval rendering "N s" / "M m N s" since the pull started, plus the
 * "Pulling… Ns" button text the M-v7-11 archive flow consumes.
 */

/** formatArchivePullElapsed (:9495-9499). */
export function formatArchivePullElapsed(startedAt: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (minutes ? minutes + 'm ' : '') + rest + 's';
}

export function useElapsedTimer(timers: { setInterval: typeof setInterval; clearInterval: typeof clearInterval } = { setInterval, clearInterval }) {
  const elapsedText = ref('0s');
  const isRunning = ref(false);
  let startedAt = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    elapsedText.value = formatArchivePullElapsed(startedAt);
  }

  /** openArchivePullProgress (:9511-9529): reset, clear, tick, interval. */
  function start(): void {
    startedAt = Date.now();
    stop();
    isRunning.value = true;
    tick();
    timer = timers.setInterval(tick, 1000);
  }

  function stop(): void {
    if (timer !== null) timers.clearInterval(timer);
    timer = null;
    isRunning.value = false;
  }

  onScopeDispose(stop);

  return { elapsedText, isRunning, start, stop };
}
