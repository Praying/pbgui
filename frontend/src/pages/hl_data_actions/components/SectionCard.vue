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
  <div class="hlda-section" :id="'sec-' + id" :class="{ open }">
    <div class="hlda-sh" :id="'sh-' + id" @click="emit('toggle')">
      <span class="hlda-arrow" :id="'arrow-' + id">&#9654;</span>
      <span>{{ t(titleKey) }}</span>
      <span class="hlda-sh-status" :id="'sh-status-' + (id === 'download' ? 'dl' : 'build')">
        <span v-if="headerStatus.runningCount" class="sh-running">
          <span class="sh-dot"></span> {{ t('market.runningLabel', { label: headerStatus.runningLabel }) }}
        </span>
        <template v-if="headerStatus.runningCount && headerStatus.pendingCount"> · </template>
        <span v-if="headerStatus.pendingCount" class="sh-pending">{{
          t('market.pendingCount', { count: headerStatus.pendingCount })
        }}</span>
      </span>
    </div>
    <div class="hlda-sb" :id="'body-' + id">
      <slot></slot>
    </div>
  </div>
</template>
