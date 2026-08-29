<script setup lang="ts">
/*
 * The integrity job-monitor iframe shell (:3334-3342) — the src is built
 * by lib/integrityUrlMatrix (legacy mountIntegrityJobMonitor :4234-4250)
 * and owned by the store so poll/queue operations can force-remount it.
 * Height auto-sync belongs to M-data-7's useFrameAutoResize.
 */
import { useI18n } from 'vue-i18n';
import { panelHeadClass } from '../../lib/uiClasses';

defineProps<{
  src: string;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="best1m-job-monitor-shell integrity-job-monitor-shell mt-3 grid gap-3 rounded-[10px] border border-border-default bg-page/55 p-4 pt-4 shadow-[var(--shadow-panel)]">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.queue') }}</div>
        <h3>{{ t('market.integrityJobMonitor') }}</h3>
      </div>
    </div>
    <iframe
      class="best1m-job-monitor-frame h-[min(72vh,820px)] w-full min-h-[520px] rounded-none border-0 bg-transparent"
      id="integrity-job-monitor-frame"
      :title="t('market.ohlcvIntegrityJobMonitor')"
      :src="src"
      loading="lazy"
      scrolling="no"
    ></iframe>
  </article>
</template>

<style scoped>
.integrity-job-monitor-shell :deep(iframe) {
  display: block;
  background: var(--surface-page);
}
</style>
