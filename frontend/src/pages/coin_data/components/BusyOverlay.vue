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

const progressScale = computed(() => {
  const safePercent = Math.max(0, Math.min(100, props.busy.percent));
  return `scaleX(${safePercent / 100})`;
});
</script>

<template>
  <div id="busy-overlay" class="fixed top-[var(--nav-height)] right-0 bottom-0 left-0 bg-page/58 items-center justify-center z-[var(--z-modal)]" :class="busy.visible ? 'visible flex' : 'hidden'">
    <div class="busy-card grid min-w-[280px] gap-2 rounded-xl border px-[1.1rem] py-[1rem] text-center shadow-modal [background:var(--coin-control,var(--surface-panel))] [border-color:var(--coin-border,var(--border-default))]">
      <div class="busy-title text-md font-bold text-primary" id="busy-title">{{ busy.title || t('market.working') }}</div>
      <div class="busy-progress-row flex items-center gap-2">
        <div class="busy-progress relative overflow-hidden flex-1 w-full h-2.5 rounded-full border shadow-[inset_0_1px_2px_rgb(var(--bg-page-rgb)/0.45)] [background:var(--coin-header,var(--surface-page))] [border-color:var(--coin-border,var(--border-default))]" aria-hidden="true">
          <!-- The legacy page :root aliased --accent to --accent-soft, so
               the gradient's third stop renders accent-soft to this day. -->
          <div class="busy-progress-fill absolute top-px right-px bottom-px left-px origin-left rounded-full bg-[linear-gradient(90deg,var(--accent-deep),var(--accent-soft)_55%,var(--accent-soft))] shadow-[0_0_18px_rgb(var(--accent-rgb)/0.35)] [transition:transform_0.18s_ease]" id="busy-progress-fill" :style="{ transform: progressScale }"></div>
        </div>
        <div class="busy-progress-label min-w-[3.3rem] text-right text-sm font-bold text-accent-soft" id="busy-progress-label">{{ percentLabel }}</div>
      </div>
      <div class="busy-subtle text-sm text-secondary" id="busy-subtle">{{ busy.subtle || t('market.pleaseWait') }}</div>
    </div>
  </div>
</template>
