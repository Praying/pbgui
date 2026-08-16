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
</script>

<template>
  <div class="hlda-jc">
    <div class="hlda-jh">
      <div class="hlda-ji">
        <span class="jid">{{ job.id }}</span>
        <span class="hlda-sbadge" :class="job.status === 'running' ? 'running' : 'pending'">{{ job.status }}</span>
        <span class="jtype">{{ job.type }}</span>
      </div>
      <div class="hlda-ja">
        <button v-if="job.status === 'pending'" class="hlda-jbtn run" @click="$emit('run')">{{ t('market.run') }}</button>
        <button class="hlda-jbtn view" @click="$emit('view')">{{ t('market.view') }}</button>
        <button class="hlda-jbtn" @click="$emit('log')">{{ t('market.log') }}</button>
        <button class="hlda-jbtn danger" @click="$emit('cancel')">{{ t('common.cancel') }}</button>
      </div>
    </div>
    <div class="hlda-jd">
      <span v-if="coin">{{ t('market.coinLabel', { coin }) }}</span>
      <span v-if="chunk">{{ t('market.chunkLabel', { chunk }) }}</span>
      <span>{{ t('market.updatedLabel', { ts: fmtTS(job.updated_ts) }) }}</span>
    </div>
    <div class="hlda-pb">
      <div class="hlda-pf" :style="{ width: percent + '%' }"></div>
      <div class="hlda-pt">{{ percent }}%</div>
    </div>
    <div class="hlda-pd" v-if="steps.total > 0">
      <span>{{ t('market.stepLabel', { step: steps.step, total: steps.total }) }}</span>
      <span v-if="steps.chunkTotal > 0">{{ t('market.chunkProgressLabel', { done: steps.chunkDone, total: steps.chunkTotal }) }}</span>
      <span v-if="steps.stage">{{ t('market.stageLabel', { stage: steps.stage }) }}</span>
      <span v-if="steps.mode">{{ t('market.modeLabel', { mode: steps.mode }) }}</span>
    </div>
    <div class="hlda-exp" v-if="hasStats">
      <button class="hlda-exp-toggle" @click="$emit('expand')">{{ expanded ? '▼' : '▶' }} {{ t('market.details') }}</button>
      <div class="hlda-exp-body" :class="{ open: expanded }">
        <div class="dr">{{ t('market.downloadsStat', { count: stats.downloaded, size: fmtBytes(progress.downloaded_bytes_total) }) }}</div>
        <div class="dr">{{ t('market.skippedStat', { count: stats.skipped, size: fmtBytes(progress.skipped_existing_bytes_total) }) }}</div>
        <div class="dr">{{ t('market.failedStat', { count: stats.failed, size: fmtBytes(progress.failed_bytes_total) }) }}</div>
      </div>
    </div>
  </div>
</template>
