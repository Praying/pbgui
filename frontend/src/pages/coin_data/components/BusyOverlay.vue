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
  <div id="busy-overlay" class="fixed top-[52px] right-0 bottom-0 left-0 bg-page/45 backdrop-blur-[2px] items-center justify-center z-[2600]" :class="busy.visible ? 'visible flex' : 'hidden'">
    <div class="busy-card grid min-w-[280px] py-[1rem] px-[1.1rem] rounded-[12px] border border-border-default bg-card shadow-[0_20px_60px_rgba(5,8,14,0.45)] gap-2 text-center">
      <div class="busy-title text-md font-bold text-primary" id="busy-title">{{ busy.title || t('market.working') }}</div>
      <div class="busy-progress-row flex items-center gap-2">
        <div class="busy-progress relative overflow-hidden flex-1 w-full h-2.5 rounded-full bg-page border border-border-default shadow-[inset_0_1px_2px_rgb(var(--bg-page-rgb)/0.45)]" aria-hidden="true">
          <!-- The legacy page :root aliased --accent to --accent-soft, so
               the gradient's third stop renders accent-soft to this day. -->
          <div class="busy-progress-fill absolute top-px right-auto bottom-px left-px w-0 rounded-full bg-[linear-gradient(90deg,var(--accent-deep),var(--accent-soft)_55%,var(--accent-soft))] shadow-[0_0_18px_rgb(var(--accent-rgb)/0.35)] [transition:width_0.18s_ease]" id="busy-progress-fill" :style="{ width: busy.percent + '%' }"></div>
        </div>
        <div class="busy-progress-label min-w-[3.3rem] text-right text-sm font-bold text-accent-soft" id="busy-progress-label">{{ percentLabel }}</div>
      </div>
      <div class="busy-subtle text-sm text-secondary" id="busy-subtle">{{ busy.subtle || t('market.pleaseWait') }}</div>
    </div>
  </div>
</template>
