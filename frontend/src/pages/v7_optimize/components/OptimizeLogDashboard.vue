<script setup lang="ts">
/**
 * Optimize status dashboard for the queue log dialog — Vue port of the
 * legacy floating panel's #opt-log-dashboard block (frontend/v7_optimize.html
 * on main: progress track + 7 summary cards + 4 detail rows, refreshed from
 * GET /queue/{filename}/status every 2.5s by the parent).
 *
 * Layout is preserved card-for-card; chrome moves to Tailwind utilities and
 * the phase card gains the queue table's status badge tones. The Pareto card
 * keeps the inline Results / Pareto Explorer mini actions.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import {
  backendSummary,
  cpuSummary,
  cpuTooltip,
  elapsedSeconds,
  formatDurationCompact,
  formatMetricPairs,
  formatRangePairs,
  formatRelativeDuration,
  logActivity,
  logError,
  logUpdatedAt,
  memorySummary,
  paretoSummary,
  phaseLabelKey,
  progressLabel,
  progressPercent,
  queueTotals,
} from '../lib/optimizeLogStatus';
import type { OptimizeLogStatus } from '../lib/optimizeLogStatus';

const props = defineProps<{
  status: OptimizeLogStatus | null;
  /** Set when the last status poll failed — takes over the activity/error rows. */
  statusError: string;
  /** Pareto mini actions stay disabled until a result name/filename is known. */
  actionsEnabled: boolean;
}>();

const emit = defineEmits<{ openResults: []; openExplorer: [] }>();
const { t } = useI18n();

const phaseText = computed(() => {
  const raw = props.status ? (props.status.phase ?? props.status.status) : null;
  const key = phaseLabelKey(raw);
  return key ? t(key) : String(raw || '-');
});

/* Phase tone mirrors QueuePanel.statusClass: running-ish warns, complete
   succeeds, errors go danger, anything else stays neutral. */
const phaseClass = computed(() => {
  const phase = String(props.status?.phase ?? props.status?.status ?? '').toLowerCase();
  if (phase === 'complete') return 'bg-success/15 text-success';
  if (phase === 'error') return 'bg-danger/15 text-danger';
  if (phase === 'running' || phase === 'optimizing') return 'bg-warning/15 text-warning-soft';
  return 'bg-secondary/15 text-secondary';
});

const percent = computed(() => progressPercent(props.status));
const progressText = computed(() => (props.status ? progressLabel(props.status) : t('v7optimize.logWaitingStatus')));
const updatedText = computed(() => {
  const duration = formatRelativeDuration(logUpdatedAt(props.status));
  return duration ? t('v7optimize.logUpdatedAgo', { time: duration }) : '-';
});
const elapsedText = computed(() => formatDurationCompact(elapsedSeconds(props.status)));
const cpuText = computed(() => cpuSummary(props.status));
const cpuTip = computed(() => cpuTooltip(props.status));
const memoryText = computed(() => memorySummary(props.status));
const paretoText = computed(() => paretoSummary(props.status));
const backendText = computed(() => backendSummary(props.status));
const queueText = computed(() => {
  const totals = queueTotals(props.status);
  return t('v7optimize.logQueueSummary', { running: totals.running, queued: totals.queued, error: totals.error });
});
const objectivesText = computed(() => formatMetricPairs(props.status ? (props.status.metrics as Record<string, unknown> | undefined)?.objectives : null));
const rangesText = computed(() => formatRangePairs(props.status ? (props.status.metrics as Record<string, unknown> | undefined)?.ranges : null));
const activityText = computed(() => (props.statusError ? t('v7optimize.logStatusUnavailable') : logActivity(props.status)));
const errorText = computed(() => (props.statusError ? props.statusError : logError(props.status)));
</script>

<template>
  <section class="grid shrink-0 gap-2.5 border-b border-border-default bg-panel px-4 py-3" data-test="optimize-log-dashboard">
    <div class="flex flex-wrap items-center gap-3" data-test="log-progress">
      <div class="h-1.5 min-w-40 flex-1 overflow-hidden rounded-full bg-border-default">
        <div class="h-full rounded-full bg-accent transition-[width] duration-300" :style="{ width: `${percent}%` }"></div>
      </div>
      <span class="text-xs tabular-nums text-secondary" data-test="log-progress-label">{{ progressText }}</span>
      <span class="whitespace-nowrap text-xs text-muted" data-test="log-updated">{{ updatedText }}</span>
    </div>

    <div class="grid grid-cols-2 gap-2 lg:grid-cols-4">
      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-phase">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.phase') }}</div>
        <div class="mt-1">
          <span class="inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-xs font-semibold" :class="phaseClass" data-test="log-phase">
            <span class="h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>
            {{ phaseText }}
          </span>
        </div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-pareto">
        <div class="flex items-center justify-between gap-2">
          <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logParetoFront') }}</div>
          <div class="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-6 px-1.5 text-[11px]"
              :disabled="!actionsEnabled"
              :title="t('v7optimize.showMatchingResults')"
              data-test="log-open-results"
              @click="emit('openResults')"
            >{{ t('v7optimize.results') }}</Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class="h-6 px-1.5 text-[11px]"
              :disabled="!actionsEnabled"
              :title="t('v7optimize.openInParetoExplorer')"
              data-test="log-open-explorer"
              @click="emit('openExplorer')"
            >{{ t('v7optimize.paretoExplorer') }}</Button>
          </div>
        </div>
        <div class="mt-1 overflow-hidden text-sm font-semibold text-primary whitespace-nowrap text-ellipsis" data-test="log-pareto">{{ paretoText }}</div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-backend">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logBackend') }}</div>
        <div class="mt-1 overflow-hidden text-sm font-semibold text-primary whitespace-nowrap text-ellipsis" :title="backendText" data-test="log-backend">{{ backendText }}</div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-elapsed">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logElapsed') }}</div>
        <div class="mt-1 text-sm font-semibold tabular-nums text-primary" data-test="log-elapsed">{{ elapsedText }}</div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-cpu">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logCpu') }}</div>
        <div class="mt-1 overflow-hidden text-sm font-semibold tabular-nums text-primary whitespace-nowrap text-ellipsis" :title="cpuTip" data-test="log-cpu">{{ cpuText }}</div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-memory">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logSystemMemory') }}</div>
        <div class="mt-1 overflow-hidden text-sm font-semibold tabular-nums text-primary whitespace-nowrap text-ellipsis" data-test="log-memory">{{ memoryText }}</div>
      </div>

      <div class="min-w-0 rounded-md border border-border-default bg-elevated/40 px-3 py-2" data-test="log-card-queue">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.queue') }}</div>
        <div class="mt-1 overflow-hidden text-sm font-semibold text-primary whitespace-nowrap text-ellipsis" data-test="log-queue">{{ queueText }}</div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
      <div class="min-w-0 rounded-md border border-border-subtle bg-page/40 px-3 py-2" data-test="log-detail-objectives">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logObjectives') }}</div>
        <div class="mt-1 overflow-hidden text-xs font-mono text-secondary whitespace-nowrap text-ellipsis" :title="objectivesText" data-test="log-objectives">{{ objectivesText }}</div>
      </div>
      <div class="min-w-0 rounded-md border border-border-subtle bg-page/40 px-3 py-2" data-test="log-detail-ranges">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logRanges') }}</div>
        <div class="mt-1 overflow-hidden text-xs font-mono text-secondary whitespace-nowrap text-ellipsis" :title="rangesText" data-test="log-ranges">{{ rangesText }}</div>
      </div>
      <div class="min-w-0 rounded-md border border-border-subtle bg-page/40 px-3 py-2" data-test="log-detail-activity">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logActivity') }}</div>
        <div class="mt-1 overflow-hidden text-xs font-mono text-secondary whitespace-nowrap text-ellipsis" :title="activityText" data-test="log-activity">{{ activityText }}</div>
      </div>
      <div class="min-w-0 rounded-md border border-border-subtle bg-page/40 px-3 py-2" :class="{ 'border-danger/40': errorText !== '-' }" data-test="log-detail-error">
        <div class="text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">{{ t('v7optimize.logError') }}</div>
        <div class="mt-1 overflow-hidden text-xs font-mono whitespace-nowrap text-ellipsis" :class="errorText !== '-' ? 'text-danger-soft' : 'text-secondary'" :title="errorText" data-test="log-error">{{ errorText }}</div>
      </div>
    </div>
  </section>
</template>
