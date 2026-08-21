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
</script>

<template>
  <div class="hlda-jm">
    <div class="hlda-jm-title">
      {{ t('market.jobMonitor') }}
      <span class="hlda-jm-badge pbgui-badge" :class="monitor.badge.value">{{
        monitor.badge.value === 'connected'
          ? t('market.connected')
          : monitor.badge.value === 'connecting'
            ? t('market.connecting')
            : t('market.disconnected')
      }}</span>
    </div>
    <div class="hlda-tabs pbgui-tab-bar">
      <button
        v-for="tab in TABS"
        :key="tab"
        class="hlda-tab pbgui-tab"
        :class="{ active: monitor.currentTab.value === tab }"
        @click="monitor.switchTab(tab)"
      >{{ tab === 'running' ? t('market.activeTab') : tab === 'done' ? t('market.done') : t('market.failed') }}</button>
    </div>
    <div class="hlda-tp active" v-if="monitor.currentTab.value === 'running'">
      <div v-if="!monitor.activeJobs.value.length" class="hlda-empty">{{ t('market.noActiveJobs') }}</div>
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
    <div class="hlda-tp" :class="{ active: monitor.currentTab.value !== 'running' }">
      <div v-if="monitor.historyLoading.value" class="hlda-empty">{{ t('market.loading') }}</div>
      <div v-else-if="monitor.historyError.value" class="hlda-msg error" style="display:block">{{
        t('market.failedToLoad', { message: monitor.historyError.value })
      }}</div>
      <div v-else-if="historyEmpty" class="hlda-empty">{{ t('market.noTabJobs', { tab: monitor.currentTab.value }) }}</div>
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
