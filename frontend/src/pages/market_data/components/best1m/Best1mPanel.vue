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
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UseBest1m } from '../../composables/useBest1m';
import AutoResizeFrame from './AutoResizeFrame.vue';
import CoinPickerBest1m from './CoinPickerBest1m.vue';
import DistributedHosts from './DistributedHosts.vue';

const props = defineProps<{
  store: UseBest1m;
}>();

const { t } = useI18n();

const picker = ref<InstanceType<typeof CoinPickerBest1m> | null>(null);

onMounted(() => picker.value?.install()); // document drag listeners (:9424, :9475)
onBeforeUnmount(() => picker.value?.uninstall());

const feedbackIsWarning = () =>
  props.store.feedback.value?.level === 'error' || props.store.feedback.value?.level === 'warning';
</script>

<template>
  <article
    class="panel-card best1m-shell best1m-panel-generic"
    id="best1m-generic-panel"
    :hidden="store.isHyperliquid.value"
  >
    <div v-if="store.feedback.value" id="best1m-feedback" class="callout" :class="{ warning: feedbackIsWarning() }">
      {{ store.feedback.value.message }}
    </div>
    <div id="best1m-generic-wrap" :hidden="store.isHyperliquid.value">
      <div class="best1m-form-grid">
        <CoinPickerBest1m ref="picker" :store="store" />
        <div class="best1m-fields">
          <label class="settings-field">
            <span class="field-label">{{ t('market.startDateOptional') }}</span>
            <input
              id="best1m-start-date"
              type="date"
              :value="store.startDate.value"
              @input="store.setStartDate(($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="settings-field">
            <span class="field-label">{{ t('market.endDateOptional') }}</span>
            <input
              id="best1m-end-date"
              type="date"
              :value="store.endDate.value"
              @input="store.setEndDate(($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <label class="settings-toggle">
          <input
            id="best1m-refetch"
            type="checkbox"
            :checked="store.refetch.value"
            @change="store.setRefetch(($event.target as HTMLInputElement).checked)"
          />
          <span id="best1m-refetch-label">{{ store.refetchLabel.value || t('market.refetchAllDays') }}</span>
        </label>
        <DistributedHosts :store="store" />
        <div class="best1m-actions">
          <button
            class="btn primary"
            id="btn-best1m-queue"
            type="button"
            :disabled="store.isQueueDisabled.value"
            @click="store.queueBest1m()"
          >{{ t('market.buildBest1m') }}</button>
        </div>
        <p class="note" id="best1m-hint">{{ store.hint.value }}</p>
      </div>
      <article
        class="best1m-job-monitor-shell"
        id="best1m-job-monitor-card"
        :hidden="!store.jobMonitorVisible.value"
      >
        <div class="panel-head">
          <div>
            <div class="eyebrow">{{ t('market.queue') }}</div>
            <h3>{{ t('market.jobMonitor') }}</h3>
            <p class="note">{{ t('market.jobMonitorNote') }}</p>
          </div>
        </div>
        <AutoResizeFrame
          v-if="store.jobMonitorSrc.value"
          frame-class="best1m-job-monitor-frame"
          frame-id="best1m-job-monitor-frame"
          :title="t('market.best1mJobMonitorTitle')"
          :src="store.jobMonitorSrc.value"
          auto-resize-mode="monitor"
        />
      </article>
    </div>
  </article>

  <div class="best1m-panel-flat" id="best1m-hyperliquid-wrap" :hidden="!store.isHyperliquid.value">
    <AutoResizeFrame
      v-if="store.isHyperliquid.value && store.hyperliquidSrc.value"
      frame-class="best1m-frame"
      frame-id="best1m-hyperliquid-frame"
      :title="t('market.hyperliquidDataActionsTitle')"
      :src="store.hyperliquidSrc.value"
      root-id="__HLDA_ROOT__"
      :frame-key="store.hyperliquidFrameKey.value"
    />
  </div>
</template>
