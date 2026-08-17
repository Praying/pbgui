import { reactive } from 'vue';
import { serverMsg } from '@/shared/i18n';
import type { LoadStatusData, Translate, ViewRange } from '../types';

/**
 * The two pareto progress surfaces, ported without DOM writes:
 *  - full-load status card + animated bar (:2414-2491; 90 ms ease ticks)
 *  - display-range slider fill (:2157-2214; 120 ms ease ticks)
 *  - /load-status job poll (:2507-2555)
 * Templates bind to the reactive state; dispose() clears timers (unmount).
 */

export type FullLoadStage = 'idle' | 'loading' | 'loaded' | 'error';

export interface LoadProgressDeps {
  t: Translate;
  /** GET /load-status — apiFetch bound to the pareto api base. */
  loadStatus: (path: string, init?: RequestInit) => Promise<LoadStatusData>;
  /** state.fullLoadPending reader — gates the animation stop (:2483). */
  isFullLoadPending: () => boolean;
  /** state.fullLoadJobId === jobId (:2526). */
  ownsJob: (jobId: string) => boolean;
  /** state.fullLoadJobId fallback when no id is passed (:2521). */
  currentJobId: () => string;
  /** Clear pending + job id once an owned job settles (:2536-2537, :2548-2550). */
  releaseJob: (jobId: string) => void;
}

export interface FullLoadState {
  stage: FullLoadStage;
  text: string;
  display: number;
  target: number;
}

export interface DisplayRangeState {
  loading: boolean;
  range: ViewRange | null;
  display: number;
  target: number;
}

const FULL_LOAD_TICK_MS = 90;
const DISPLAY_RANGE_TICK_MS = 120;

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function useLoadProgress(deps: LoadProgressDeps) {
  const { t } = deps;

  const fullLoad = reactive<FullLoadState>({ stage: 'idle', text: '', display: 0, target: 0 });
  const displayRange = reactive<DisplayRangeState>({ loading: false, range: null, display: 0, target: 0 });

  let fullLoadTimer: ReturnType<typeof setInterval> | null = null;
  let displayRangeTimer: ReturnType<typeof setInterval> | null = null;

  /** setFullLoadStatus (:2414-2451) minus the DOM mirrors. */
  function setFullLoadStatus(stage: FullLoadStage, text: string, progress: number): void {
    const normalized = clampPercent(progress || 0);
    fullLoad.stage = stage;
    fullLoad.text = text || '';
    fullLoad.target = normalized;
    if (stage === 'loaded' || stage === 'error' || normalized <= fullLoad.display) {
      fullLoad.display = normalized;
    }
    ensureFullLoadAnimation();
  }

  /** updateFullLoadPhase (:2493-2505) — the refresh pipeline phase map. */
  function updateFullLoadPhase(phase: string, detail = ''): void {
    const phases: Record<string, { progress: number; text: string }> = {
      command_center: { progress: 74, text: t('v7explore.refreshingCommandCenter') },
      command_center_detail: { progress: 80, text: t('v7explore.refreshingConfigDetails') },
      playground: { progress: 88, text: t('v7explore.refreshingExplorerCharts') },
      deep_intelligence: { progress: 94, text: t('v7explore.refreshingDeepIntelligence') },
      deep_intelligence_panel: { progress: 97, text: t('v7explore.refreshingDeepPanel') },
      complete: { progress: 100, text: t('v7explore.fullLoadCompleted') },
    };
    const meta = phases[phase] || phases.command_center!;
    const suffix = detail ? ' ' + detail : '';
    setFullLoadStatus(phase === 'complete' ? 'loaded' : 'loading', meta.text + suffix, meta.progress);
  }

  function stopFullLoadAnimation(): void {
    if (fullLoadTimer) {
      clearInterval(fullLoadTimer);
      fullLoadTimer = null;
    }
  }

  /** ensureFullLoadProgressAnimation (:2467-2491). */
  function ensureFullLoadAnimation(): void {
    if (fullLoadTimer) return;
    fullLoadTimer = setInterval(() => {
      const diff = fullLoad.target - fullLoad.display;
      if (Math.abs(diff) < 0.2) {
        fullLoad.display = fullLoad.target;
        if (!deps.isFullLoadPending() || fullLoad.display >= 100 || fullLoad.display <= 0) {
          stopFullLoadAnimation();
        }
        return;
      }
      const step = diff > 0 ? Math.max(0.4, diff * 0.18) : Math.min(-0.6, diff * 0.35);
      fullLoad.display = clampPercent(fullLoad.display + step);
    }, FULL_LOAD_TICK_MS);
  }

  /** displayRangePercent (:2157-2161). */
  function displayRangePercent(end: number | null | undefined, total: number): number {
    const totalNum = Math.trunc(Number(total || 0)) || 0;
    if (totalNum <= 0) return 0;
    return clampPercent((Number(end || 0) / totalNum) * 100);
  }

  /** startDisplayRangeProgress (:2182-2202). */
  function startDisplayRangeProgress(range: ViewRange, total: number, currentEnd: number | null): void {
    const current = currentEnd != null ? currentEnd : range.start;
    const startPercent = displayRangePercent(Math.min(range.end, current), total);
    const targetPercent = displayRangePercent(range.end, total);
    displayRange.loading = true;
    displayRange.range = { ...range };
    displayRange.display = targetPercent <= startPercent ? targetPercent : startPercent;
    displayRange.target = targetPercent;
    stopDisplayRangeAnimation();
    displayRangeTimer = setInterval(() => {
      const cap = Math.max(displayRange.display, displayRange.target - 0.8);
      if (displayRange.display >= cap) return;
      const diff = cap - displayRange.display;
      displayRange.display = Math.min(cap, displayRange.display + Math.max(0.25, diff * 0.035));
    }, DISPLAY_RANGE_TICK_MS);
  }

  function stopDisplayRangeAnimation(): void {
    if (displayRangeTimer) {
      clearInterval(displayRangeTimer);
      displayRangeTimer = null;
    }
  }

  /** finishDisplayRangeProgress (:2204-2214). */
  function finishDisplayRangeProgress(success: boolean, viewRangeEnd: number | null, total: number): void {
    stopDisplayRangeAnimation();
    if (success) {
      displayRange.display = displayRange.target;
    } else {
      displayRange.display = displayRangePercent(viewRangeEnd, total);
    }
    displayRange.loading = false;
    displayRange.range = null;
  }

  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /**
   * pollFullLoadStatus (:2520-2555): recursive 350 ms poll while loading,
   * 200 ms when a done status lacks its payload; errors throw the server
   * message. Foreign jobs (no longer owned) still resolve their data but
   * never mutate shared state.
   */
  async function pollFullLoadStatus(jobId: string): Promise<LoadStatusData | null> {
    const activeJobId = String(jobId || deps.currentJobId() || '');
    if (!activeJobId) return null;
    const data = await deps.loadStatus('/load-status?job_id=' + encodeURIComponent(activeJobId));
    const job = data && data.job ? data.job : null;
    if (!job) throw new Error(t('v7explore.loadStatusNoJob'));
    const owns = deps.ownsJob(activeJobId);
    if (data && data.status === 'loading') {
      if (owns) {
        setFullLoadStatus('loading', serverMsg(job.message || '') || t('v7explore.scanningFullStream'), job.progress || 0);
      }
      await wait(350);
      return pollFullLoadStatus(activeJobId);
    }
    if (data && data.status === 'error') {
      if (owns) deps.releaseJob(activeJobId);
      throw new Error(serverMsg(job.error || job.message || '') || t('v7explore.fullLoadFailed'));
    }
    if (!(data && data.payload)) {
      if (owns) {
        setFullLoadStatus('loading', serverMsg(job.message || '') || t('v7explore.finalizingPayload'), Math.max(95, job.progress || 0));
      }
      await wait(200);
      return pollFullLoadStatus(activeJobId);
    }
    if (owns) {
      deps.releaseJob(activeJobId);
      setFullLoadStatus('loading', serverMsg(job.message || '') || t('v7explore.fullLoadCompleteRefreshing'), Math.max(70, job.progress || 100));
    }
    return data;
  }

  function dispose(): void {
    stopFullLoadAnimation();
    stopDisplayRangeAnimation();
  }

  /** True while the 90 ms ease interval is live (kept for parity checks). */
  function isAnimating(): boolean {
    return fullLoadTimer !== null;
  }

  return {
    fullLoad,
    displayRange,
    setFullLoadStatus,
    updateFullLoadPhase,
    stopFullLoadAnimation,
    displayRangePercent,
    startDisplayRangeProgress,
    stopDisplayRangeAnimation,
    finishDisplayRangeProgress,
    pollFullLoadStatus,
    isAnimating,
    dispose,
  };
}
