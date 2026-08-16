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
</script>

<template>
  <div v-if="store.dryRunSummary.value" id="copy-data-dry-run-summary" class="copy-data-summary">
    <div class="copy-data-summary-head">
      <h3 class="copy-data-summary-title">{{ t('market.dryRunSummary') }}</h3>
      <span class="note">{{ t('market.jobPrefix', { id: view.jobId }) }}</span>
    </div>
    <div class="copy-data-summary-grid">
      <div v-for="[label, value] in view.rows" :key="label" class="copy-data-summary-item">
        <div class="copy-data-summary-label">{{ label }}</div>
        <div class="copy-data-summary-value">{{ value }}</div>
      </div>
    </div>
    <pre class="copy-data-summary-log">{{ view.detail }}</pre>
  </div>
</template>
