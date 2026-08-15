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

  function schedule(): void {
    timer = setTimeout(() => {
      void run();
    }, intervalMs);
  }

  async function run(): Promise<void> {
    timer = null;
    try {
      await fn();
    } catch {
      /* keep polling — callers report their own errors */
    }
    if (isRunning) schedule();
  }

  return {
    start(): void {
      if (isRunning) return;
      isRunning = true;
      void run();
    },
    stop(): void {
      isRunning = false;
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
