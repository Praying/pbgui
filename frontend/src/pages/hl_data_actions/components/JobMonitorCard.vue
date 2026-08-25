<script setup lang="ts">
/*
 * The inline job monitor — renderJobMonitorHTML (:1619-1631) plus the tab
 * switch (switchTab :1633-1641) and the panels: active jobs via WS
 * (renderActivePanel :1691-1697), history via the API (:1752-1767). All job
 * fields render through interpolation — the legacy escHtml/escAttr calls are
 * structurally replaced by Vue's text-bound escaping.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import ActiveJobCard from './ActiveJobCard.vue';
import HistoryJobCard from './HistoryJobCard.vue';
import type { JobRecord } from '../types';
import type { MonitorTab, UseJobsMonitor } from '../composables/useJobsMonitor';

const props = defineProps<{
  monitor: UseJobsMonitor;
}>();

const emit = defineEmits<{
  (e: 'refresh-section'): void;
}>();

const { t } = useI18n();

const TABS: MonitorTab[] = ['running', 'done', 'failed'];

const historyEmpty = computed(
  () => props.monitor.historyJobs.value.length === 0 && !props.monitor.historyLoading.value && !props.monitor.historyError.value
);

/* WS badge state → full utility set (the former .hlda-jm-badge.connected/
   .disconnected tints; keeps the connecting/connected test anchors). The
   connecting state keeps the transparent pbgui-badge look. */
function badgeClass(badge: string): string {
  if (badge === 'connected') return 'connected bg-success/20 text-success';
  if (badge === 'disconnected') return 'disconnected bg-danger/20 text-danger';
  return 'connecting';
}

/* Tab state → full utility set (the former .hlda-tab base + .active tint).
   Colours live per-branch because the legacy .active rule outranked :hover. */
function tabClass(active: boolean): string {
  return active
    ? 'active text-accent border-b-accent'
    : 'text-muted border-b-transparent hover:text-primary';
}
</script>

<template>
  <div class="hlda-jm mt-4 border-t border-elevated pt-3">
    <div class="hlda-jm-title mb-2 flex items-center gap-2 text-sm font-semibold text-secondary">
      {{ t('market.jobMonitor') }}
      <span class="hlda-jm-badge pbgui-badge rounded-[3px] px-2 py-0.5 text-xs font-medium" :class="badgeClass(monitor.badge.value)">{{
        monitor.badge.value === 'connected'
          ? t('market.connected')
          : monitor.badge.value === 'connecting'
            ? t('market.connecting')
            : t('market.disconnected')
      }}</span>
    </div>
    <div class="hlda-tabs pbgui-tab-bar mb-2.5 flex gap-0 border-b border-elevated">
      <Button
        v-for="tab in TABS"
        :key="tab"
        type="button"
        variant="ghost"
        class="hlda-tab pbgui-tab h-auto rounded-none border-0 border-b-2 bg-transparent px-4 py-1.5 font-normal duration-150 hover:bg-transparent"
        :class="tabClass(monitor.currentTab.value === tab)"
        @click="monitor.switchTab(tab)"
      >{{ tab === 'running' ? t('market.activeTab') : tab === 'done' ? t('market.done') : t('market.failed') }}</Button>
    </div>
    <div class="hlda-tp block" v-if="monitor.currentTab.value === 'running'">
      <div v-if="!monitor.activeJobs.value.length" class="hlda-empty p-4 text-center text-sm text-muted">{{ t('market.noActiveJobs') }}</div>
      <ActiveJobCard
        v-for="job in monitor.activeJobs.value"
        :key="job.id"
        :job="job"
        :expanded="monitor.expandedJobs.value.has(job.id)"
        @expand="monitor.toggleExpanded(job.id)"
        @run="monitor.runJob(job.id)"
        @view="monitor.showJobDetails(job.id)"
        @log="monitor.showLog(job.id)"
        @cancel="monitor.cancelJob(job.id)"
      />
    </div>
    <div class="hlda-tp" :class="monitor.currentTab.value !== 'running' ? 'block' : 'hidden'">
      <div v-if="monitor.historyLoading.value" class="hlda-empty p-4 text-center text-sm text-muted">{{ t('market.loading') }}</div>
      <div v-else-if="monitor.historyError.value" class="hlda-msg error mt-2.5 block rounded-md border border-danger/33 bg-danger/13 px-3 py-2 text-sm text-danger">{{
        t('market.failedToLoad', { message: monitor.historyError.value })
      }}</div>
      <div v-else-if="historyEmpty" class="hlda-empty p-4 text-center text-sm text-muted">{{ t('market.noTabJobs', { tab: monitor.currentTab.value }) }}</div>
      <HistoryJobCard
        v-else
        v-for="job in monitor.historyJobs.value"
        :key="job.id"
        :job="job"
        :expanded="monitor.expandedJobs.value.has(job.id)"
        @expand="monitor.toggleExpanded(job.id)"
        @view="monitor.showJobDetails(job.id)"
        @log="monitor.showLog(job.id)"
        @retry="monitor.retryJob(job.id)"
        @requeue="monitor.requeueJob(job.id)"
        @delete="monitor.deleteJob(job.id)"
      />
    </div>
  </div>
</template>
