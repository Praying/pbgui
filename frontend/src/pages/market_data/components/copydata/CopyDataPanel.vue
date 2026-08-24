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
import {
  calloutClass,
  jobMonitorFrameClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
} from '../../lib/uiClasses';
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
  <article :class="[panelCardClass, 'copy-data-shell grid max-w-[1120px] gap-3']">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.ohlcvCopy') }}</div>
        <h2>{{ t('market.copyData') }}</h2>
        <p :class="noteClass">{{ t('market.copyDataNote') }}</p>
      </div>
    </div>
    <div v-if="store.feedback.value" id="copy-data-feedback" :class="calloutClass(feedbackIsWarning())">
      {{ store.feedback.value.message }}
    </div>
    <div :class="calloutClass(true)">{{ t('market.copyDataWarning') }}</div>
    <SshForm :store="store" />
    <DryRunSummary :store="store" />
    <article class="copy-data-schedules grid gap-3 border-t border-border-default pt-3">
      <div :class="panelHeadClass">
        <div>
          <div class="eyebrow">{{ t('market.recurringCopies') }}</div>
          <h3>{{ t('market.copySchedules') }}</h3>
          <p :class="noteClass">{{ t('market.copySchedulesNote') }}</p>
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
    <article class="best1m-job-monitor-shell mt-3 grid gap-3 border-t border-secondary/12 pt-3" id="copy-data-job-monitor-card">
      <div :class="panelHeadClass">
        <div>
          <div class="eyebrow">{{ t('market.queue') }}</div>
          <h3>{{ t('market.copyJobMonitor') }}</h3>
          <p :class="noteClass">{{ t('market.copyJobMonitorNote') }}</p>
        </div>
      </div>
      <AutoResizeFrame
        v-if="store.jobMonitorSrc.value"
        :frame-class="jobMonitorFrameClass"
        frame-id="copy-data-job-monitor-frame"
        :title="t('market.copyDataJobMonitorTitle')"
        :src="store.jobMonitorSrc.value"
        auto-resize-mode="monitor"
      />
    </article>
  </article>
</template>
