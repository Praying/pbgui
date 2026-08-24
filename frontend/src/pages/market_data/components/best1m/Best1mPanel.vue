<script setup lang="ts">
/*
 * The best-1m panel — legacy #best1m-panel (market_data_main.html:3346-3410):
 * the generic shell (coin picker + dates + refetch + distributed hosts +
 * queue action + job monitor) and the hyperliquid flat iframe variant
 * (refreshBest1mPanel :7662-7685 — one is hidden at a time; hyperliquid
 * delegates entirely to the hl_data_actions iframe :7577-7586).
 *
 * The best1m feedback callout (:3348, setBest1mFeedback :5004-5021) and the
 * queue button (:3390, disabled while loading/queueing :7626, :7713) come
 * from the store.
 *
 * Rail migration: the sidebar shortcut links — #sidebar-best-1m-link
 * (:2946, build) and the hyperliquid-only #sidebar-l2books-link (:2948,
 * download) — became this in-panel mode switch. Selecting a mode emits to
 * App's openBest1mPanel (:7687-7691: section normalize → panel switch →
 * refresh); off hyperliquid only build applies (:7683), so the switch
 * renders there as little as the l2books link did (:7422).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  best1mFrameClass,
  btnPrimaryClass,
  calloutClass,
  fieldLabelClass,
  jobMonitorFrameClass,
  noteClass,
  panelHeadClass,
  sbBtnClass,
  settingsFieldClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import type { Best1mSection } from '../../composables/useContextExchange';
import type { UseBest1m } from '../../composables/useBest1m';
import AutoResizeFrame from './AutoResizeFrame.vue';
import CoinPickerBest1m from './CoinPickerBest1m.vue';
import DistributedHosts from './DistributedHosts.vue';

const props = defineProps<{
  store: UseBest1m;
  /** Current best-1m section mode (uiState.best1mPanelSection). */
  activeMode?: Best1mSection;
}>();

const emit = defineEmits<{
  /** Mode switch → openBest1mPanel(mode). */
  selectMode: [mode: Best1mSection];
}>();

const { t } = useI18n();

const isDownloadMode = () => props.activeMode === 'download';

const picker = ref<InstanceType<typeof CoinPickerBest1m> | null>(null);

onMounted(() => picker.value?.install()); // document drag listeners (:9424, :9475)
onBeforeUnmount(() => picker.value?.uninstall());

const feedbackIsWarning = () =>
  props.store.feedback.value?.level === 'error' || props.store.feedback.value?.level === 'warning';
</script>

<template>
  <!-- build/download mode switch (legacy sidebar shortcuts :2946/:2948) —
       sits above both variants so either mode stays reachable -->
  <div v-if="store.isHyperliquid.value" id="best1m-mode-switch" class="best1m-mode-switch flex flex-none flex-wrap gap-1">
    <button
      id="best1m-mode-build"
      :class="sbBtnClass(!isDownloadMode())"
      type="button"
      @click="emit('selectMode', 'build')"
    >{{ t('market.buildBest1mTitle') }}</button>
    <button
      id="best1m-mode-download"
      :class="sbBtnClass(isDownloadMode())"
      type="button"
      @click="emit('selectMode', 'download')"
    >{{ t('market.downloadL2books') }}</button>
  </div>

  <article
    class="panel-card best1m-shell best1m-panel-generic flex min-h-0 flex-1 flex-col gap-3"
    id="best1m-generic-panel"
    :hidden="store.isHyperliquid.value"
  >
    <div v-if="store.feedback.value" id="best1m-feedback" :class="calloutClass(feedbackIsWarning())">
      {{ store.feedback.value.message }}
    </div>
    <div id="best1m-generic-wrap" :hidden="store.isHyperliquid.value">
      <div class="best1m-form-grid grid gap-3">
        <CoinPickerBest1m ref="picker" :store="store" />
        <div class="best1m-fields grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
          <label :class="settingsFieldClass">
            <span :class="fieldLabelClass">{{ t('market.startDateOptional') }}</span>
            <input
              id="best1m-start-date"
              type="date"
              :value="store.startDate.value"
              @input="store.setStartDate(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label :class="settingsFieldClass">
            <span :class="fieldLabelClass">{{ t('market.endDateOptional') }}</span>
            <input
              id="best1m-end-date"
              type="date"
              :value="store.endDate.value"
              @input="store.setEndDate(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <label :class="settingsToggleClass">
          <input
            id="best1m-refetch"
            class="h-4 w-4 m-0"
            type="checkbox"
            :checked="store.refetch.value"
            @change="store.setRefetch(($event.target as HTMLInputElement).checked)"
          />
          <span id="best1m-refetch-label">{{ store.refetchLabel.value || t('market.refetchAllDays') }}</span>
        </label>
        <DistributedHosts :store="store" />
        <div class="best1m-actions flex flex-wrap items-center gap-3">
          <button
            :class="btnPrimaryClass"
            id="btn-best1m-queue"
            type="button"
            :disabled="store.isQueueDisabled.value"
            @click="store.queueBest1m()"
          >{{ t('market.buildBest1m') }}</button>
        </div>
        <p :class="noteClass" id="best1m-hint">{{ store.hint.value }}</p>
      </div>
      <article
        class="best1m-job-monitor-shell mt-3 grid gap-3 border-t border-secondary/12 pt-3"
        id="best1m-job-monitor-card"
        :hidden="!store.jobMonitorVisible.value"
      >
        <div :class="panelHeadClass">
          <div>
            <div class="eyebrow">{{ t('market.queue') }}</div>
            <h3>{{ t('market.jobMonitor') }}</h3>
            <p :class="noteClass">{{ t('market.jobMonitorNote') }}</p>
          </div>
        </div>
        <AutoResizeFrame
          v-if="store.jobMonitorSrc.value"
          :frame-class="jobMonitorFrameClass"
          frame-id="best1m-job-monitor-frame"
          :title="t('market.best1mJobMonitorTitle')"
          :src="store.jobMonitorSrc.value"
          auto-resize-mode="monitor"
        />
      </article>
    </div>
  </article>

  <div class="best1m-panel-flat min-h-0 flex-1 pr-0" id="best1m-hyperliquid-wrap" :hidden="!store.isHyperliquid.value">
    <AutoResizeFrame
      v-if="store.isHyperliquid.value && store.hyperliquidSrc.value"
      :frame-class="best1mFrameClass"
      frame-id="best1m-hyperliquid-frame"
      :title="t('market.hyperliquidDataActionsTitle')"
      :src="store.hyperliquidSrc.value"
      root-id="__HLDA_ROOT__"
      :frame-key="store.hyperliquidFrameKey.value"
    />
  </div>
</template>
