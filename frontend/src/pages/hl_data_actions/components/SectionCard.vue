<script setup lang="ts">
/*
 * One collapsible section — legacy .hlda-section markup (:476-485, :487-496)
 * with the toggle (:672-687) and the header status badges (updateHeaderStatus
 * :638-654): the first running job's coin count plus the pending count stay
 * visible even while collapsed.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { JobRecord } from '../types';

const props = defineProps<{
  /** 'download' | 'build' — ids and storage keys. */
  id: 'download' | 'build';
  open: boolean;
  titleKey: string;
  activeJobs: JobRecord[];
}>();

const emit = defineEmits<{
  (e: 'toggle'): void;
}>();

const { t } = useI18n();

/** updateHeaderStatus (:638-654) as a view model — no markup strings. */
const headerStatus = computed(() => {
  const jobs = props.activeJobs || [];
  const running = jobs.filter((job) => job.status === 'running');
  const pending = jobs.filter((job) => job.status === 'pending');
  const runningLabel = running.length
    ? (() => {
        const coins = Array.isArray((running[0]!.payload || {}).coins) ? ((running[0]!.payload || {}).coins as unknown[]) : [];
        return coins.length ? t('market.coinsCount', { count: coins.length }) : t('market.job');
      })()
    : '';
  return { runningLabel, runningCount: running.length, pendingCount: pending.length };
});
</script>

<template>
  <div
    class="hlda-section mb-3 overflow-visible rounded-lg border border-elevated"
    :id="'sec-' + id"
    :class="{ open }"
  >
    <div
      class="hlda-sh flex cursor-pointer select-none items-center gap-2 bg-workspace px-3.5 py-2.5 text-base font-medium hover:bg-accent/20"
      :id="'sh-' + id"
      :class="open ? 'rounded-t-lg' : 'rounded-lg'"
      @click="emit('toggle')"
    >
      <span
        class="hlda-arrow inline-block text-base text-secondary transition-transform duration-150"
        :id="'arrow-' + id"
        :class="open ? 'rotate-90' : ''"
      >&#9654;</span>
      <span>{{ t(titleKey) }}</span>
      <span class="hlda-sh-status ml-auto flex items-center gap-1.5 text-xs" :id="'sh-status-' + (id === 'download' ? 'dl' : 'build')">
        <span v-if="headerStatus.runningCount" class="sh-running flex items-center gap-1 font-medium text-accent">
          <span class="sh-dot h-1.5 w-1.5 animate-[hlda-pulse_1.2s_infinite] rounded-full bg-accent-deep"></span> {{ t('market.runningLabel', { label: headerStatus.runningLabel }) }}
        </span>
        <template v-if="headerStatus.runningCount && headerStatus.pendingCount"> · </template>
        <span v-if="headerStatus.pendingCount" class="sh-pending font-medium text-warning">{{
          t('market.pendingCount', { count: headerStatus.pendingCount })
        }}</span>
      </span>
    </div>
    <div class="hlda-sb px-4 py-3.5" :id="'body-' + id" :class="open ? 'block' : 'hidden'">
      <slot></slot>
    </div>
  </div>
</template>

<style>
/* hlda-pulse ported from styles/hlda.css — referenced by the
   animate-[hlda-pulse_1.2s_infinite] utility on .sh-dot. Unscoped on
   purpose: Vue renames @keyframes inside scoped blocks, which would break
   the utility's name reference. */
@keyframes hlda-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}
</style>
