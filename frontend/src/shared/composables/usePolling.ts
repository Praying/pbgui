/**
 * Polling loop mirroring the legacy services_monitor scheduleStatus chain:
 * fn runs immediately on start(), and the next run is armed intervalMs after
 * the previous run settles — slow or hanging runs never stack. Errors thrown
 * by fn are swallowed so the chain keeps going; callers own their error UX
 * (legacy rescheduled inside .catch too).
 */
export interface PollingController {
  start(): void;
  stop(): void;
}

export function usePolling(fn: () => Promise<void>, intervalMs: number): PollingController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let isRunning = false;
  let isExecuting = false;
  let refreshWhenVisible = false;

  function clearScheduledRun(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function handleVisibilityChange(): void {
    if (!isRunning || typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      refreshWhenVisible = true;
      clearScheduledRun();
      return;
    }
    if (refreshWhenVisible && !isExecuting) {
      refreshWhenVisible = false;
      void run();
    }
  }

  function schedule(): void {
    timer = setTimeout(() => {
      void run();
    }, intervalMs);
  }

  async function run(): Promise<void> {
    timer = null;
    if (!isRunning || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
      refreshWhenVisible = true;
      return;
    }
    if (isExecuting) return;
    isExecuting = true;
    try {
      await fn();
    } catch {
      /* keep polling — callers report their own errors */
    } finally {
      isExecuting = false;
    }
    if (isRunning) schedule();
  }

  return {
    start(): void {
      if (isRunning) return;
      isRunning = true;
      refreshWhenVisible = false;
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibilityChange);
      void run();
    },
    stop(): void {
      isRunning = false;
      refreshWhenVisible = false;
      clearScheduledRun();
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibilityChange);
    },
  };
}
