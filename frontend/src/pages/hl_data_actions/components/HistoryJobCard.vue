<script setup lang="ts">
/*
 * One history (done/failed) job card — renderHistoryJob (:1769-1818) as a
 * template: id/type/duration line, view/log/retry(done-only for requeue,
 * failed-only for retry)/delete actions, error line, and the expandable
 * coins/range/statistics block.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtBytes, fmtDay, fmtTS, formatJobDuration } from '../lib/jobsFormat';
import type { JobRecord } from '../types';

const props = defineProps<{
  job: JobRecord;
  expanded: boolean;
}>();

defineEmits<{
  (e: 'expand'): void;
  (e: 'view'): void;
  (e: 'log'): void;
  (e: 'retry'): void;
  (e: 'requeue'): void;
  (e: 'delete'): void;
}>();

const { t } = useI18n();

const payload = computed<Record<string, unknown>>(() => props.job.payload || {});
const progress = computed(() => props.job.progress || {});
const lastResult = computed<Record<string, unknown>>(() => (progress.value.last_result as Record<string, unknown>) || {});

const coins = computed<string[]>(() => (Array.isArray(payload.value.coins) ? (payload.value.coins as string[]) : []));
const coinPreview = computed(() =>
  coins.value.length <= 8
    ? coins.value.join(', ')
    : coins.value.slice(0, 8).join(', ') + t('market.totalSuffix', { count: coins.value.length })
);
const range = computed(() => {
  const sd = fmtDay(payload.value.start_day);
  const ed = fmtDay(payload.value.end_day);
  return sd || ed ? `${sd || '?'} → ${ed || '?'}` : '';
});
const onlyMissing = computed(() => (payload.value.only_missing_1m_src_hours !== undefined ? payload.value.only_missing_1m_src_hours : undefined));
const stats = computed(() => ({
  downloaded: Number(progress.value.downloaded_total || lastResult.value.downloaded || 0),
  skipped: Number(progress.value.skipped_existing_total || lastResult.value.skipped_existing || 0),
  failed: Number(progress.value.failed_total || lastResult.value.failed || 0),
}));
const hasStats = computed(() => stats.value.downloaded + stats.value.skipped + stats.value.failed > 0);
const isDone = computed(() => props.job.status === 'done');
const isFailed = computed(() => props.job.status === 'failed');
const duration = computed(() => formatJobDuration(props.job));
</script>

<template>
  <div class="hlda-jc">
    <div class="hlda-jh">
      <div class="hlda-ji">
        <span class="jid">{{ job.id }}</span>
        <span class="jtype">{{ job.type }}</span>
        <span v-if="duration" class="jdur">{{ duration }}</span>
      </div>
      <div class="hlda-ja">
        <button class="hlda-jbtn view" @click="$emit('view')">{{ t('market.view') }}</button>
        <button class="hlda-jbtn" @click="$emit('log')">{{ t('market.log') }}</button>
        <button v-if="isFailed" class="hlda-jbtn" @click="$emit('retry')">{{ t('market.retry') }}</button>
        <button v-if="isDone" class="hlda-jbtn" @click="$emit('requeue')">{{ t('market.requeue') }}</button>
        <button class="hlda-jbtn danger" @click="$emit('delete')">{{ t('common.delete') }}</button>
      </div>
    </div>
    <div class="hlda-jd">
      <span>{{ fmtTS(job.updated_ts) }}</span>
      <span v-if="range">{{ t('market.rangeLabel', { range }) }}</span>
    </div>
    <div class="hlda-jerr" v-if="job.error">{{ job.error }}</div>
    <div class="hlda-exp" v-if="hasStats || coinPreview">
      <button class="hlda-exp-toggle" @click="$emit('expand')">{{ expanded ? '▼' : '▶' }} {{ t('market.details') }}</button>
      <div class="hlda-exp-body" :class="{ open: expanded }">
        <div class="dr" v-if="coinPreview">{{ t('market.coinsLabel', { coins: coinPreview }) }}</div>
        <div class="dr" v-if="onlyMissing !== undefined">{{
          t('market.onlyMissingLabel', { value: onlyMissing ? t('common.yes') : t('common.no') })
        }}</div>
        <template v-if="hasStats">
          <div class="dr">{{ t('market.downloadedStat', { count: stats.downloaded, size: fmtBytes(progress.downloaded_bytes_total || lastResult.downloaded_bytes) }) }}</div>
          <div class="dr">{{ t('market.skippedStat', { count: stats.skipped, size: fmtBytes(progress.skipped_existing_bytes_total || lastResult.skipped_existing_bytes) }) }}</div>
          <div class="dr">{{ t('market.failedStat', { count: stats.failed, size: fmtBytes(progress.failed_bytes_total || lastResult.failed_bytes) }) }}</div>
        </template>
      </div>
    </div>
  </div>
</template>
