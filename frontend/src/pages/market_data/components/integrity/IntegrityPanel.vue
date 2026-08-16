<script setup lang="ts">
/*
 * Integrity panel mount — the #integrity-panel DOM slice
 * (market_data_main.html:3229-3345): checksum header + summary cards,
 * removed-markets manager, archive settings, repair queue, reference
 * differences and the job-monitor iframe. The gap modal (:3595-3636) is
 * portal-less (position: fixed) and rendered from here.
 *
 * The panel component stays mounted for the whole session (PanelShell
 * hides inactive sections), so the document-level Delete key (:9270-9283)
 * is gated on the `active` prop — App passes activePanel === this panel.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IntegrityController } from '../../composables/useIntegrity';
import type { IntegrityPollingController } from '../../composables/useIntegrityPolling';
import ArchiveSelects from './ArchiveSelects.vue';
import DifferencesTable from './DifferencesTable.vue';
import GapDetailsModal from './GapDetailsModal.vue';
import IssuesTable from './IssuesTable.vue';
import JobMonitorCard from './JobMonitorCard.vue';
import RemovedCoins from './RemovedCoins.vue';
import SummaryCards from './SummaryCards.vue';

const props = defineProps<{
  store: IntegrityController;
  polling: IntegrityPollingController;
  /** Legacy active-panel check for the Delete key (:9275-9276). */
  active: boolean;
}>();

const { t } = useI18n();

function onDocumentKeydown(event: KeyboardEvent): void {
  void props.store.handleDeleteKey(event, props.active); // :9270-9283
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
});
</script>

<template>
  <div class="stack">
    <article class="panel-card">
      <div class="panel-head">
        <div>
          <div class="eyebrow">{{ t('market.dailyChecksums') }}</div>
          <h2>{{ t('market.ohlcvIntegrity') }}</h2>
          <p class="note" id="integrity-description">{{ store.descriptionText.value }}</p>
        </div>
        <div class="panel-actions">
          <button
            v-if="store.isHyperliquid.value"
            class="btn secondary"
            id="btn-integrity-normalize-hl"
            type="button"
            @click="store.queueNormalizeFallback()"
          >
            {{ t('market.normalizeFallbackCandles') }}
          </button>
          <button class="btn primary" id="btn-integrity-scan" type="button" @click="store.queueScan()">
            {{ t('market.runFullScan') }}
          </button>
        </div>
      </div>
      <div
        v-if="store.feedback.value.message"
        id="integrity-feedback"
        class="callout"
        :class="{ warning: store.feedback.value.level === 'error' }"
      >
        {{ store.feedback.value.message }}
      </div>
      <SummaryCards id="integrity-summary" :cards="store.summaryCards.value" />
    </article>

    <RemovedCoins :store="store" />

    <ArchiveSelects :store="store" />

    <IssuesTable :store="store" />

    <DifferencesTable :store="store" />

    <JobMonitorCard :src="store.jobMonitorSrc.value" />

    <GapDetailsModal :store="store" />
  </div>
</template>
