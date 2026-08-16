<script setup lang="ts">
/*
 * The copy-data panel — legacy #copy-data-panel (market_data_main.html:
 * 3412-3500): header + warning callout, the SSH form (SshForm), the dry-run
 * summary (DryRunSummary), the recurring schedules section (ScheduleEditor +
 * ScheduleList) and the ohlcv copy job monitor iframe (:3489-3498,
 * mountCopyDataJobMonitor :4224-4232, URL matrix :4215-4222).
 *
 * The 15 s schedule poll lifecycle is owned by App (panel enter/leave,
 * :9059-9064) — this panel mounts the monitor frame and renders store state.
 */
import { useI18n } from 'vue-i18n';
import type { UseCopyData } from '../../composables/useCopyData';
import AutoResizeFrame from '../best1m/AutoResizeFrame.vue';
import DryRunSummary from './DryRunSummary.vue';
import ScheduleEditor from './ScheduleEditor.vue';
import ScheduleList from './ScheduleList.vue';
import SshForm from './SshForm.vue';

const props = defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();

const feedbackIsWarning = () =>
  props.store.feedback.value?.level === 'error' || props.store.feedback.value?.level === 'warning';
</script>

<template>
  <article class="panel-card copy-data-shell">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.ohlcvCopy') }}</div>
        <h2>{{ t('market.copyData') }}</h2>
        <p class="note">{{ t('market.copyDataNote') }}</p>
      </div>
    </div>
    <div v-if="store.feedback.value" id="copy-data-feedback" class="callout" :class="{ warning: feedbackIsWarning() }">
      {{ store.feedback.value.message }}
    </div>
    <div class="callout warning">{{ t('market.copyDataWarning') }}</div>
    <SshForm :store="store" />
    <DryRunSummary :store="store" />
    <article class="copy-data-schedules">
      <div class="panel-head">
        <div>
          <div class="eyebrow">{{ t('market.recurringCopies') }}</div>
          <h3>{{ t('market.copySchedules') }}</h3>
          <p class="note">{{ t('market.copySchedulesNote') }}</p>
        </div>
      </div>
      <ScheduleEditor :store="store" />
      <ScheduleList
        :store="store"
        @run="store.runSchedule($event)"
        @edit="store.editSchedule($event)"
        @remove="store.deleteSchedule($event)"
      />
    </article>
    <article class="best1m-job-monitor-shell" id="copy-data-job-monitor-card">
      <div class="panel-head">
        <div>
          <div class="eyebrow">{{ t('market.queue') }}</div>
          <h3>{{ t('market.copyJobMonitor') }}</h3>
          <p class="note">{{ t('market.copyJobMonitorNote') }}</p>
        </div>
      </div>
      <AutoResizeFrame
        v-if="store.jobMonitorSrc.value"
        frame-class="best1m-job-monitor-frame"
        frame-id="copy-data-job-monitor-frame"
        :title="t('market.copyDataJobMonitorTitle')"
        :src="store.jobMonitorSrc.value"
        auto-resize-mode="monitor"
      />
    </article>
  </article>
</template>
