<script setup lang="ts">
/*
 * The job modal (:498-506) — log / details / error views. Closes only via
 * the ✕ button (no backdrop click-close; the legacy modal had none either).
 * Details render the summary/scope grids (renderJobDetails :1851-1904) and
 * pretty-printed payload/progress/last_result blocks; every value renders
 * through interpolation (the renderDetailRows escaping contract).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmtDay, fmtTS, formatJobDuration } from '../lib/jobsFormat';
import type { ModalState } from '../composables/useJobsMonitor';

const props = defineProps<{
  modal: ModalState;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

interface DetailRow {
  label: string;
  value: unknown;
}

const job = computed(() => props.modal.detailsJob || null);
const payload = computed<Record<string, unknown>>(() => job.value?.payload || {});
const progress = computed<Record<string, unknown>>(() => job.value?.progress || {});
const lastResult = computed<Record<string, unknown>>(() => (progress.value.last_result as Record<string, unknown>) || {});

function jsonBlock(value: Record<string, unknown>): string {
  if (!value || Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
}

/** renderDetailRows (:1841-1849) — empty values drop out. */
function detailRows(rows: DetailRow[]): DetailRow[] {
  return rows.filter((row) => row.value !== '' && row.value !== null && row.value !== undefined);
}

const summaryRows = computed<DetailRow[]>(() =>
  detailRows([
    { label: t('market.status'), value: job.value?.status || '' },
    { label: t('market.type'), value: job.value?.type || '' },
    { label: t('market.exchange'), value: job.value?.exchange || '' },
    { label: t('market.created'), value: job.value ? fmtTS(job.value.created_ts) : '' },
    { label: t('market.updated'), value: job.value ? fmtTS(job.value.updated_ts) : '' },
    { label: t('market.duration'), value: job.value ? formatJobDuration(job.value) : '' },
    { label: t('market.runRequested'), value: job.value?.run_requested ? t('common.yes') : '' },
    { label: t('market.cancelRequested'), value: job.value?.cancel_requested ? t('common.yes') : '' },
    { label: t('common.error'), value: job.value?.error || '' },
  ])
);

const coinsText = computed(() => (Array.isArray(payload.value.coins) ? (payload.value.coins as string[]).join(', ') : ''));

const scopeRows = computed<DetailRow[]>(() =>
  detailRows([
    { label: t('market.coins'), value: coinsText.value },
    {
      label: t('market.range'),
      value:
        payload.value.start_day || payload.value.end_day
          ? `${fmtDay(payload.value.start_day) || '?'} → ${fmtDay(payload.value.end_day) || '?'}`
          : '',
    },
    { label: t('market.chunkDays'), value: payload.value.chunk_days },
    { label: t('market.profile'), value: payload.value.profile || '' },
    { label: t('market.region'), value: payload.value.region || '' },
    { label: t('market.refetch'), value: payload.value.refetch ? t('common.yes') : '' },
    {
      label: t('market.onlyMissing1mSrc'),
      value:
        payload.value.only_missing_1m_src_hours !== undefined
          ? payload.value.only_missing_1m_src_hours
            ? t('common.yes')
            : t('common.no')
          : '',
    },
    { label: t('market.currentCoin'), value: progress.value.coin || '' },
    {
      label: t('market.currentChunk'),
      value: progress.value.chunk_start ? `${String(progress.value.chunk_start)} → ${String(progress.value.chunk_end || '')}` : '',
    },
    { label: t('market.stage'), value: progress.value.stage || '' },
    {
      label: t('market.step'),
      value: progress.value.total ? `${String(progress.value.step || 0)}/${String(progress.value.total)}` : '',
    },
    {
      label: t('market.chunkProgress'),
      value: progress.value.chunk_total ? `${String(progress.value.chunk_done || 0)}/${String(progress.value.chunk_total)}` : '',
    },
  ])
);
</script>

<template>
  <div class="hlda-modal" :class="{ active: modal.active }">
    <div class="hlda-modal-box">
      <div class="hlda-modal-hd">
        <h3>{{ modal.title || t('market.jobLog') }}</h3>
        <button class="hlda-modal-close" @click="$emit('close')">✕</button>
      </div>
      <div class="hlda-modal-body" :class="{ 'is-details': modal.kind === 'details' }">
        <template v-if="modal.kind === 'details' && job">
          <div class="hlda-detail-section">
            <h4>{{ t('market.summary') }}</h4>
            <div class="hlda-detail-grid">
              <template v-for="row in summaryRows" :key="row.label">
                <div class="hlda-detail-key">{{ row.label }}</div>
                <div class="hlda-detail-value">{{ row.value }}</div>
              </template>
            </div>
          </div>
          <div class="hlda-detail-section">
            <h4>{{ t('market.scope') }}</h4>
            <div class="hlda-detail-grid">
              <template v-for="row in scopeRows" :key="row.label">
                <div class="hlda-detail-key">{{ row.label }}</div>
                <div class="hlda-detail-value">{{ row.value }}</div>
              </template>
            </div>
          </div>
          <div class="hlda-detail-section">
            <h4>{{ t('market.payload') }}</h4>
            <pre v-if="jsonBlock(payload)" class="hlda-json">{{ jsonBlock(payload) }}</pre>
            <div v-else class="hlda-detail-empty">{{ t('market.noData') }}</div>
          </div>
          <div class="hlda-detail-section">
            <h4>{{ t('market.progress') }}</h4>
            <pre v-if="jsonBlock(progress)" class="hlda-json">{{ jsonBlock(progress) }}</pre>
            <div v-else class="hlda-detail-empty">{{ t('market.noData') }}</div>
          </div>
          <div class="hlda-detail-section">
            <h4>{{ t('market.lastResult') }}</h4>
            <pre v-if="jsonBlock(lastResult)" class="hlda-json">{{ jsonBlock(lastResult) }}</pre>
            <div v-else class="hlda-detail-empty">{{ t('market.noData') }}</div>
          </div>
        </template>
        <template v-else-if="modal.kind === 'details'">
          <div class="hlda-detail-empty">{{ t('market.loading') }}</div>
        </template>
        <template v-else>{{ modal.bodyText }}</template>
      </div>
    </div>
  </div>
</template>
