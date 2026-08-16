<script setup lang="ts">
/*
 * The integrity job-monitor iframe shell (:3334-3342) — the src is built
 * by lib/integrityUrlMatrix (legacy mountIntegrityJobMonitor :4234-4250)
 * and owned by the store so poll/queue operations can force-remount it.
 * Height auto-sync belongs to M-data-7's useFrameAutoResize.
 */
import { useI18n } from 'vue-i18n';

defineProps<{
  src: string;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="best1m-job-monitor-shell">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.queue') }}</div>
        <h3>{{ t('market.integrityJobMonitor') }}</h3>
      </div>
    </div>
    <iframe
      class="best1m-job-monitor-frame"
      id="integrity-job-monitor-frame"
      :title="t('market.ohlcvIntegrityJobMonitor')"
      :src="src"
      loading="lazy"
      scrolling="no"
    ></iframe>
  </article>
</template>
