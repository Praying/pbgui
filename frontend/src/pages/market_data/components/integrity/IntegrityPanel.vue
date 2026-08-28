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
import { Button } from '@/shared/components/ui/button';
import { calloutClass, noteClass, panelCardClass, panelHeadClass, stackClass } from '../../lib/uiClasses';
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
  <div :class="[stackClass, 'integrity-panel']">
    <article :class="[panelCardClass, 'integrity-overview-card']">
      <div class="integrity-overview-grid">
        <div class="integrity-hero-copy">
          <div class="integrity-kicker">
            <span class="integrity-kicker-mark" aria-hidden="true"></span>
            <span>{{ t('market.dailyChecksums') }}</span>
            <span class="integrity-exchange-chip">{{ store.meta.value.label }}</span>
          </div>
          <div class="eyebrow">{{ t('market.integrityDescription') }}</div>
          <h2>{{ t('market.ohlcvIntegrity') }}</h2>
          <p :class="noteClass" id="integrity-description">{{ store.descriptionText.value }}</p>
        </div>
        <div class="integrity-command-panel">
          <div class="integrity-command-label">{{ t('market.action') }}</div>
          <div class="panel-actions integrity-command-actions">
            <Button
              v-if="store.isHyperliquid.value"
              variant="info"
              id="btn-integrity-normalize-hl"
              type="button"
              @click="store.queueNormalizeFallback()"
            >
              {{ t('market.normalizeFallbackCandles') }}
            </Button>
            <Button variant="primary" id="btn-integrity-scan" type="button" @click="store.queueScan()">
              {{ t('market.runFullScan') }}
            </Button>
          </div>
          <div class="integrity-command-note">
            <span class="integrity-command-dot" aria-hidden="true"></span>
            <span>{{ t('market.pleaseWait') }}</span>
          </div>
        </div>
      </div>
      <div
        v-if="store.feedback.value.message"
        id="integrity-feedback"
        :class="calloutClass(store.feedback.value.level === 'error')"
      >
        {{ store.feedback.value.message }}
      </div>
      <div class="integrity-snapshot-heading">
        <div>
          <div class="eyebrow">{{ t('market.overview') }}</div>
          <h3>{{ t('market.ohlcvData') }}</h3>
        </div>
        <span class="integrity-snapshot-rule" aria-hidden="true"></span>
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

<style scoped>
.integrity-panel {
  gap: 14px;
}

.integrity-overview-card {
  position: relative;
  overflow: hidden;
  padding: 24px;
  background:
    radial-gradient(circle at 92% 0%, rgb(var(--accent-rgb) / 0.12), transparent 30%),
    linear-gradient(135deg, rgb(var(--bg-panel-rgb) / 1), rgb(var(--bg-page-rgb) / 0.96));
  box-shadow: 0 22px 46px rgb(2 8 14 / 0.3), 0 1px 0 rgb(224 241 255 / 0.1) inset;
}

.integrity-overview-card::before {
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: linear-gradient(180deg, var(--accent), rgb(var(--accent-rgb) / 0.16));
  content: '';
}

.integrity-overview-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 34%);
  gap: 28px;
  align-items: stretch;
}

.integrity-hero-copy {
  min-width: 0;
}

.integrity-kicker {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  color: var(--text-secondary);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.integrity-kicker-mark,
.integrity-command-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px rgb(var(--accent-rgb) / 0.12);
}

.integrity-exchange-chip {
  margin-left: 4px;
  padding: 4px 8px;
  border: 1px solid rgb(var(--accent-rgb) / 0.2);
  border-radius: var(--radius-full);
  background: rgb(var(--accent-rgb) / 0.08);
  color: var(--accent-soft);
  font-size: 11px;
  letter-spacing: 0.02em;
  text-transform: none;
}

.integrity-hero-copy h2 {
  margin: 4px 0 8px;
  font-size: clamp(24px, 3vw, 34px);
  letter-spacing: var(--tracking-display);
  line-height: 1.05;
}

.integrity-hero-copy #integrity-description {
  max-width: 680px;
  line-height: 1.6;
}

.integrity-command-panel {
  display: flex;
  min-height: 148px;
  flex-direction: column;
  justify-content: center;
  gap: 12px;
  padding: 18px;
  border: 1px solid rgb(var(--accent-rgb) / 0.18);
  border-radius: var(--radius-lg);
  background: rgb(var(--bg-page-rgb) / 0.38);
  box-shadow: 0 1px 0 rgb(224 241 255 / 0.06) inset;
}

.integrity-command-label,
.integrity-snapshot-heading .eyebrow {
  color: var(--text-muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.integrity-command-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.integrity-command-note {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-muted);
  font-size: var(--fs-xs);
  line-height: 1.4;
}

.integrity-command-note .integrity-command-dot {
  width: 5px;
  height: 5px;
  flex-basis: 5px;
  background: var(--accent);
  box-shadow: none;
}

.integrity-snapshot-heading {
  display: flex;
  align-items: end;
  gap: 14px;
  margin: 26px 0 12px;
}

.integrity-snapshot-heading h3 {
  margin: 4px 0 0;
  color: var(--text-primary);
  font-size: var(--fs-lg);
  letter-spacing: var(--tracking-tight);
}

.integrity-snapshot-rule {
  height: 1px;
  flex: 1;
  margin-bottom: 4px;
  background: linear-gradient(90deg, rgb(var(--accent-rgb) / 0.3), transparent);
}

.integrity-panel :deep(.summary-grid) {
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
}

.integrity-panel :deep(.summary-card) {
  min-height: 98px;
  padding: 14px;
  border-color: rgb(var(--accent-rgb) / 0.14);
  background: rgb(var(--bg-page-rgb) / 0.42);
  transition: border-color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard), transform var(--motion-fast) var(--ease-spring);
}

.integrity-panel :deep(.summary-card:hover) {
  border-color: rgb(var(--accent-rgb) / 0.32);
  background: rgb(var(--accent-rgb) / 0.06);
  transform: translateY(-1px);
}

.integrity-panel :deep(> article:not(.integrity-overview-card)) {
  border-color: rgb(var(--border-default-rgb, 51 63 92) / 0.9);
  background: linear-gradient(180deg, rgb(var(--bg-panel-rgb) / 0.98), rgb(var(--bg-page-rgb) / 0.98));
}

.integrity-panel :deep(.integrity-table-wrap) {
  border-color: rgb(var(--border-default-rgb, 51 63 92) / 0.86);
  background: rgb(var(--bg-page-rgb) / 0.34);
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.integrity-panel :deep(.integrity-table-wrap::-webkit-scrollbar) {
  width: 6px;
  height: 6px;
}

.integrity-panel :deep(.integrity-table-wrap::-webkit-scrollbar-thumb) {
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

@media (max-width: 760px) {
  .integrity-overview-card {
    padding: 18px;
  }

  .integrity-overview-grid {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .integrity-command-panel {
    min-height: auto;
  }
}
</style>
