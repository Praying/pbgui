<script setup lang="ts">
/*
 * The refresh busy overlay — legacy #busy-overlay (:1654-1665) with the
 * progress label format of updateBusyProgress (:2041-2051: clamp 0-100,
 * one decimal, trailing '.0' stripped).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BusyState } from '../composables/useRefreshJobs';

const props = defineProps<{
  busy: BusyState;
}>();

const { t } = useI18n();

const percentLabel = computed(() => {
  const safePercent = Math.max(0, Math.min(100, props.busy.percent));
  return safePercent.toFixed(1).replace(/\.0$/, '') + '%';
});
</script>

<template>
  <div id="busy-overlay" :class="{ visible: busy.visible }">
    <div class="busy-card">
      <div class="busy-title" id="busy-title">{{ busy.title || t('market.working') }}</div>
      <div class="busy-progress-row">
        <div class="busy-progress" aria-hidden="true">
          <div class="busy-progress-fill" id="busy-progress-fill" :style="{ width: busy.percent + '%' }"></div>
        </div>
        <div class="busy-progress-label" id="busy-progress-label">{{ percentLabel }}</div>
      </div>
      <div class="busy-subtle" id="busy-subtle">{{ busy.subtle || t('market.pleaseWait') }}</div>
    </div>
  </div>
</template>
