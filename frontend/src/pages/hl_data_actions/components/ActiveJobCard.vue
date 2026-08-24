<script setup lang="ts">
/*
 * One active (pending/running) job card — renderActiveJob (:1699-1750) as a
 * template: id/status/type line, run/view/log/cancel actions (pending-only
 * run), coin/chunk/updated details, the progress bar and the expandable
 * download/skip/fail statistics.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { calcPct, fmtBytes, fmtTS } from '../lib/jobsFormat';
import type { JobRecord } from '../types';

const props = defineProps<{
  job: JobRecord;
  expanded: boolean;
}>();

defineEmits<{
  (e: 'expand'): void;
  (e: 'run'): void;
  (e: 'view'): void;
  (e: 'log'): void;
  (e: 'cancel'): void;
}>();

const { t } = useI18n();

const progress = computed(() => props.job.progress || {});
const percent = computed(() => calcPct(progress.value));
const coin = computed(() => String(progress.value.coin || ''));
const chunk = computed(() => (progress.value.chunk_start ? `${progress.value.chunk_start}→${progress.value.chunk_end}` : ''));
const stats = computed(() => ({
  downloaded: progress.value.downloaded_total || 0,
  skipped: progress.value.skipped_existing_total || 0,
  failed: progress.value.failed_total || 0,
}));
const hasStats = computed(() => stats.value.downloaded + stats.value.skipped + stats.value.failed > 0);
const steps = computed(() => ({
  step: progress.value.step || 0,
  total: progress.value.total || 0,
  chunkDone: progress.value.chunk_done || 0,
  chunkTotal: progress.value.chunk_total || 0,
  stage: String(progress.value.stage || ''),
  mode: String(progress.value.mode || ''),
}));

/* Status badge → full utility set (the former .hlda-sbadge.running/.pending
   tints). */
function statusBadgeClass(status: string): string {
  return status === 'running'
    ? 'running bg-accent/20 text-accent'
    : 'pending bg-warning/20 text-warning';
}

/* Job action button variant → full utility set (the former .hlda-jbtn base +
   .view/.run/.danger tints). Colours per-branch: the legacy variant rules
   outranked the plain :hover colour, which the branch split keeps true. */
function jbtnClass(variant: '' | 'view' | 'run' | 'danger'): string {
  if (variant === 'view') return 'view border-accent/42 bg-accent/16 text-accent-soft hover:bg-accent/26';
  if (variant === 'run') return 'run border-success/42 bg-success/16 text-success-soft hover:bg-success/26';
  if (variant === 'danger') return 'danger border-danger/33 text-danger hover:bg-danger/13';
  return 'border-border-default bg-transparent text-secondary hover:bg-border-default hover:text-primary';
}
</script>

<template>
  <div class="hlda-jc mb-2 rounded-md border border-elevated bg-workspace px-3 py-2.5">
    <div class="hlda-jh flex flex-wrap items-center justify-between gap-1.5">
      <div class="hlda-ji flex flex-wrap items-center gap-2">
        <span class="jid break-all text-[12px] font-semibold text-primary">{{ job.id }}</span>
        <span class="hlda-sbadge rounded-[3px] px-2 py-0.5 text-xs font-medium" :class="statusBadgeClass(job.status)">{{ job.status }}</span>
        <span class="jtype text-[12px] text-muted">{{ job.type }}</span>
      </div>
      <div class="hlda-ja flex gap-1.5">
        <button v-if="job.status === 'pending'" class="hlda-jbtn cursor-pointer rounded-sm border px-2.5 py-[3px] text-xs" :class="jbtnClass('run')" @click="$emit('run')">{{ t('market.run') }}</button>
        <button class="hlda-jbtn cursor-pointer rounded-sm border px-2.5 py-[3px] text-xs" :class="jbtnClass('view')" @click="$emit('view')">{{ t('market.view') }}</button>
        <button class="hlda-jbtn cursor-pointer rounded-sm border px-2.5 py-[3px] text-xs" :class="jbtnClass('')" @click="$emit('log')">{{ t('market.log') }}</button>
        <button class="hlda-jbtn cursor-pointer rounded-sm border px-2.5 py-[3px] text-xs" :class="jbtnClass('danger')" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
      </div>
    </div>
    <div class="hlda-jd mt-1 flex flex-wrap gap-1.5 text-[12px] text-muted">
      <span v-if="coin">{{ t('market.coinLabel', { coin }) }}</span>
      <span v-if="chunk">{{ t('market.chunkLabel', { chunk }) }}</span>
      <span>{{ t('market.updatedLabel', { ts: fmtTS(job.updated_ts) }) }}</span>
    </div>
    <div class="hlda-pb relative mt-1.5 h-5 overflow-hidden rounded-sm bg-elevated">
      <div class="hlda-pf h-full min-w-0 rounded-sm bg-accent transition-[width] duration-300" :style="{ width: percent + '%' }"></div>
      <div class="hlda-pt absolute inset-x-0 top-0 text-center text-xs font-medium leading-5 text-white">{{ percent }}%</div>
    </div>
    <div class="hlda-pd mt-1 flex flex-wrap gap-2 text-xs text-muted" v-if="steps.total > 0">
      <span>{{ t('market.stepLabel', { step: steps.step, total: steps.total }) }}</span>
      <span v-if="steps.chunkTotal > 0">{{ t('market.chunkProgressLabel', { done: steps.chunkDone, total: steps.chunkTotal }) }}</span>
      <span v-if="steps.stage">{{ t('market.stageLabel', { stage: steps.stage }) }}</span>
      <span v-if="steps.mode">{{ t('market.modeLabel', { mode: steps.mode }) }}</span>
    </div>
    <div class="hlda-exp mt-1.5" v-if="hasStats">
      <button class="hlda-exp-toggle cursor-pointer border-0 bg-transparent px-0 py-0.5 text-xs text-muted hover:text-primary" @click="$emit('expand')">{{ expanded ? '▼' : '▶' }} {{ t('market.details') }}</button>
      <div class="hlda-exp-body pt-1.5 pl-2 text-xs text-secondary" :class="expanded ? 'open block' : 'hidden'">
        <div class="dr mb-0.5">{{ t('market.downloadsStat', { count: stats.downloaded, size: fmtBytes(progress.downloaded_bytes_total) }) }}</div>
        <div class="dr mb-0.5">{{ t('market.skippedStat', { count: stats.skipped, size: fmtBytes(progress.skipped_existing_bytes_total) }) }}</div>
        <div class="dr mb-0.5">{{ t('market.failedStat', { count: stats.failed, size: fmtBytes(progress.failed_bytes_total) }) }}</div>
      </div>
    </div>
  </div>
</template>
