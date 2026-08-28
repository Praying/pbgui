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
import { PhInfo, PhWarningCircle } from '@phosphor-icons/vue';
import {
  calloutClass,
  jobMonitorFrameClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
} from '../../lib/uiClasses';
import type { UseCopyData } from '../../composables/useCopyData';
import type { ConfirmDialogRequest } from '../../composables/useConfirmDialog';
import PbIcon from '@/shared/components/PbIcon.vue';
import AutoResizeFrame from '../best1m/AutoResizeFrame.vue';
import DryRunSummary from './DryRunSummary.vue';
import ScheduleEditor from './ScheduleEditor.vue';
import ScheduleList from './ScheduleList.vue';
import SshForm from './SshForm.vue';

const props = defineProps<{
  store: UseCopyData;
  /** App's confirm dialog — when omitted, schedule deletes run unconfirmed (test parity with the legacy port). */
  confirm?: (request: ConfirmDialogRequest) => Promise<boolean>;
}>();

const { t } = useI18n();

const feedbackIsWarning = () =>
  props.store.feedback.value?.level === 'error' || props.store.feedback.value?.level === 'warning';

/** Schedule deletes are destructive — route them through the confirm dialog when one is wired in. */
async function onRemoveSchedule(scheduleId: string): Promise<void> {
  if (props.confirm) {
    const row = props.store.scheduleRows.value.find((item) => item.id === scheduleId);
    const confirmed = await props.confirm({
      title: t('market.deleteScheduleConfirmTitle'),
      message: t('market.deleteScheduleConfirmMessage', { name: row?.name ?? '' }),
      confirmText: t('common.delete'),
    });
    if (!confirmed) return;
  }
  void props.store.deleteSchedule(scheduleId);
}
</script>

<template>
  <!-- Full-width like every sibling panel — the Tailwind migration briefly
       capped this at max-w-[1120px], which left the card's right edge short
       of the full-width exchange context bar above it. -->
  <article :class="[panelCardClass, 'copy-data-shell grid gap-3']">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.ohlcvCopy') }}</div>
        <h2>{{ t('market.copyData') }}</h2>
        <p :class="noteClass">{{ t('market.copyDataNote') }}</p>
      </div>
    </div>
    <div v-if="store.feedback.value" id="copy-data-feedback" :class="calloutClass(feedbackIsWarning())">
      <span class="flex items-start gap-2">
        <PbIcon
          :icon="feedbackIsWarning() ? PhWarningCircle : PhInfo"
          :size="16"
          class="mt-0.5 shrink-0"
          :class="feedbackIsWarning() ? 'text-warning-soft' : 'text-accent-soft'"
        />
        <span class="min-w-0 [overflow-wrap:anywhere]">{{ store.feedback.value.message }}</span>
      </span>
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
        @remove="onRemoveSchedule($event)"
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
