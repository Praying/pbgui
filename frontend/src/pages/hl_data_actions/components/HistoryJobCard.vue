<script setup lang="ts">
/*
 * One history (done/failed) job card — renderHistoryJob (:1769-1818) as a
 * template: id/type/duration line, view/log/retry(done-only for requeue,
 * failed-only for retry)/delete actions, error line, and the expandable
 * coins/range/statistics block.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
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
  <div class="hlda-jc mb-2 rounded-md border border-elevated bg-workspace px-3 py-2.5">
    <div class="hlda-jh flex flex-wrap items-center justify-between gap-1.5">
      <div class="hlda-ji flex flex-wrap items-center gap-2">
        <span class="jid break-all text-[12px] font-semibold text-primary">{{ job.id }}</span>
        <span class="jtype text-[12px] text-muted">{{ job.type }}</span>
        <span v-if="duration" class="jdur text-[12px] text-muted">{{ duration }}</span>
      </div>
      <div class="hlda-ja flex gap-1.5">
        <Button type="button" variant="info" size="sm" class="hlda-jbtn" @click="$emit('view')">{{ t('market.view') }}</Button>
        <Button type="button" variant="secondary" size="sm" class="hlda-jbtn" @click="$emit('log')">{{ t('market.log') }}</Button>
        <Button v-if="isFailed" type="button" variant="secondary" size="sm" class="hlda-jbtn" @click="$emit('retry')">{{ t('market.retry') }}</Button>
        <Button v-if="isDone" type="button" variant="secondary" size="sm" class="hlda-jbtn" @click="$emit('requeue')">{{ t('market.requeue') }}</Button>
        <Button type="button" variant="danger" size="sm" class="hlda-jbtn" @click="$emit('delete')">{{ t('common.delete') }}</Button>
      </div>
    </div>
    <div class="hlda-jd mt-1 flex flex-wrap gap-1.5 text-[12px] text-muted">
      <span>{{ fmtTS(job.updated_ts) }}</span>
      <span v-if="range">{{ t('market.rangeLabel', { range }) }}</span>
    </div>
    <div class="hlda-jerr mt-1 text-[12px] text-danger" v-if="job.error">{{ job.error }}</div>
    <div class="hlda-exp mt-1.5" v-if="hasStats || coinPreview">
      <Button type="button" variant="ghost" size="sm" class="hlda-exp-toggle h-auto border-0 px-0 py-0.5 font-normal text-muted hover:bg-transparent hover:text-primary" @click="$emit('expand')">{{ expanded ? '▼' : '▶' }} {{ t('market.details') }}</Button>
      <div class="hlda-exp-body pt-1.5 pl-2 text-xs text-secondary" :class="expanded ? 'open block' : 'hidden'">
        <div class="dr mb-0.5" v-if="coinPreview">{{ t('market.coinsLabel', { coins: coinPreview }) }}</div>
        <div class="dr mb-0.5" v-if="onlyMissing !== undefined">{{
          t('market.onlyMissingLabel', { value: onlyMissing ? t('common.yes') : t('common.no') })
        }}</div>
        <template v-if="hasStats">
          <div class="dr mb-0.5">{{ t('market.downloadedStat', { count: stats.downloaded, size: fmtBytes(progress.downloaded_bytes_total || lastResult.downloaded_bytes) }) }}</div>
          <div class="dr mb-0.5">{{ t('market.skippedStat', { count: stats.skipped, size: fmtBytes(progress.skipped_existing_bytes_total || lastResult.skipped_existing_bytes) }) }}</div>
          <div class="dr mb-0.5">{{ t('market.failedStat', { count: stats.failed, size: fmtBytes(progress.failed_bytes_total || lastResult.failed_bytes) }) }}</div>
        </template>
      </div>
    </div>
  </div>
</template>
