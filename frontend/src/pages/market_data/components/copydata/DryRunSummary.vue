<script setup lang="ts">
/*
 * The dry-run summary card — legacy #copy-data-dry-run-summary
 * (market_data_main.html:3457) rendered by renderCopyDataDryRunSummary
 * (:5431-5476). The grid rows/log detail come from computeDryRunSummaryView
 * (lib/dryRunLog) over the store's latest poll payload; every server value
 * flows through text interpolation (esc() parity, no v-html — R1).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { noteClass } from '../../lib/uiClasses';
import { computeDryRunSummaryView } from '../../lib/dryRunLog';
import type { UseCopyData } from '../../composables/useCopyData';

const props = defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();

const view = computed(() =>
  computeDryRunSummaryView(props.store.dryRunSummary.value ?? {}, {
    status: t('market.status'),
    remoteRoot: t('market.remoteRoot'),
    exchanges: t('market.exchanges'),
    filesToTransfer: t('market.filesToTransfer'),
    transferSize: t('market.transferSize'),
    totalSourceSize: t('market.totalSourceSize'),
    sentReceived: t('market.sentReceived'),
    duration: t('market.duration'),
    waitingDryRunStats: t('market.waitingDryRunStats'),
    jobPrefix: t('market.jobPrefix'),
  })
);

const summaryItemClass =
  'copy-data-summary-item min-w-0 rounded-lg border border-accent/16 bg-page/72 py-2 px-3';
</script>

<template>
  <div v-if="store.dryRunSummary.value" id="copy-data-dry-run-summary" class="copy-data-summary grid gap-2 rounded-[10px] border border-accent/24 bg-page/50 p-3">
    <div class="copy-data-summary-head flex flex-wrap items-baseline justify-between gap-3">
      <h3 class="copy-data-summary-title m-0 text-md text-primary">{{ t('market.dryRunSummary') }}</h3>
      <span :class="noteClass">{{ t('market.jobPrefix', { id: view.jobId }) }}</span>
    </div>
    <div class="copy-data-summary-grid grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2">
      <div v-for="[label, value] in view.rows" :key="label" :class="summaryItemClass">
        <div class="copy-data-summary-label text-xs uppercase tracking-[0.05em] text-secondary">{{ label }}</div>
        <div class="copy-data-summary-value font-bold text-primary [overflow-wrap:anywhere]">{{ value }}</div>
      </div>
    </div>
    <pre class="copy-data-summary-log m-0 rounded-md border border-accent/12 bg-page/58 p-2 font-mono text-xs text-primary whitespace-pre-wrap [overflow-wrap:anywhere]">{{ view.detail }}</pre>
  </div>
</template>
