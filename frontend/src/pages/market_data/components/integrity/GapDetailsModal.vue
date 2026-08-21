<script setup lang="ts">
/*
 * The OHLCV gap-details modal — #integrity-gap-modal
 * (market_data_main.html:3595-3636) fed by renderIntegrityGapDetails
 * (:4666-4753): day select (+ appended context days), summary cards, the
 * surrounding-days strip with hourly markers, the 24×60 coverage grid and
 * the missing-ranges table. v-if replaces the legacy hidden toggling; the
 * backdrop is position: fixed so nesting under the panel section is safe.
 */
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { IntegrityController } from '../../composables/useIntegrity';
import SummaryCards from './SummaryCards.vue';

const props = defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

const closeEl = ref<HTMLButtonElement | null>(null);

// :4802 — focus the close button when the modal opens
watch(
  () => props.store.gapOpen.value,
  (open) => {
    if (!open) return;
    void nextTick(() => closeEl.value?.focus());
  },
  { flush: 'post' }
);

function onDayChange(event: Event): void {
  void props.store.loadGapDay(String((event.target as HTMLSelectElement).value ?? '')); // :9200-9202
}
</script>

<template>
  <div
    v-if="store.gapOpen.value"
    class="integrity-gap-backdrop"
    id="integrity-gap-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="integrity-gap-title"
  >
    <div class="integrity-gap-dialog">
      <div class="panel-head">
        <div>
          <div class="eyebrow">{{ t('market.minuteCoverage') }}</div>
          <h2 id="integrity-gap-title">{{ t('market.gapDetailsTitle') }}</h2>
          <p class="note" id="integrity-gap-subtitle">{{ store.gapSubtitle.value }}</p>
        </div>
        <button
          class="btn pbgui-btn btn-secondary secondary"
          id="btn-integrity-gap-close"
          ref="closeEl"
          type="button"
          @click="store.closeGapDetails()"
        >
          {{ t('common.close') }}
        </button>
      </div>
      <div class="integrity-gap-controls">
        <label>
          <span>{{ t('market.damagedDay') }}</span>
          <select id="integrity-gap-day" :value="store.gapSelectedDay.value" @change="onDayChange">
            <option v-for="option in store.gapDayOptions.value" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>
      <div
        v-if="store.gapFeedback.value.message"
        class="callout"
        :class="{ warning: store.gapFeedback.value.level === 'error' }"
        id="integrity-gap-feedback"
      >
        {{ store.gapFeedback.value.message }}
      </div>
      <SummaryCards id="integrity-gap-summary" class="integrity-gap-summary" :cards="store.gapSummaryCards.value" />
      <div>
        <div class="eyebrow">{{ t('market.surroundingDays') }}</div>
        <p class="note">{{ t('market.surroundingDaysNote') }}</p>
        <div class="integrity-day-context-wrap">
          <div class="integrity-day-context" id="integrity-day-context">
            <button
              v-for="day in store.gapDayContext.value"
              :key="day.day"
              type="button"
              class="integrity-context-day"
              :class="{ selected: day.selected }"
              :disabled="day.disabled"
              :data-integrity-context-day="day.day"
              :title="day.title"
              @click="store.loadGapDay(day.day)"
            >
              <span>{{ day.day }}</span>
              <span class="integrity-context-hours">
                <i
                  v-for="(hour, index) in day.hours"
                  :key="index"
                  class="integrity-context-hour"
                  :class="hour.cls"
                  :title="hour.title"
                ></i>
              </span>
              <span class="integrity-context-meta">{{ day.candles }}</span>
              <span class="integrity-context-meta">{{ day.status }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="integrity-gap-legend">
        <span><i class="integrity-gap-swatch integrity-gap-cell"></i><span>{{ t('market.present') }}</span></span>
        <span><i class="integrity-gap-swatch integrity-gap-cell leading"></i><span>{{ t('market.leadingPossibleInception') }}</span></span>
        <span><i class="integrity-gap-swatch integrity-gap-cell internal"></i><span>{{ t('market.internalGap') }}</span></span>
        <span><i class="integrity-gap-swatch integrity-gap-cell trailing"></i><span>{{ t('market.trailingGap') }}</span></span>
      </div>
      <div class="integrity-gap-chart-wrap">
        <div class="integrity-gap-chart" id="integrity-gap-chart">
          <div v-for="row in store.gapChart.value" :key="row.label" class="integrity-gap-hour">
            <span class="integrity-gap-hour-label">{{ row.label }}</span>
            <span
              v-for="(cell, index) in row.cells"
              :key="index"
              class="integrity-gap-cell"
              :class="cell.cls"
              :title="cell.title"
            ></span>
          </div>
        </div>
      </div>
      <div class="integrity-table-wrap integrity-gap-ranges">
        <table class="integrity-table">
          <thead>
            <tr>
              <th>{{ t('market.kind') }}</th>
              <th>{{ t('market.start') }}</th>
              <th>{{ t('market.end') }}</th>
              <th>{{ t('market.minutes') }}</th>
              <th>{{ t('market.assessment') }}</th>
            </tr>
          </thead>
          <tbody id="integrity-gap-ranges">
            <tr v-for="(range, index) in store.gapRanges.value" :key="index">
              <td>{{ range.kind }}</td>
              <td>{{ range.start }}</td>
              <td>{{ range.end }}</td>
              <td>{{ range.minutes }}</td>
              <td>{{ range.assessment }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
