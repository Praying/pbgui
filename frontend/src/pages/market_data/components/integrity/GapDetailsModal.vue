<script setup lang="ts">
/*
 * The OHLCV gap-details modal — #integrity-gap-modal
 * (market_data_main.html:3595-3636) fed by renderIntegrityGapDetails
 * (:4666-4753): day select (+ appended context days), summary cards, the
 * surrounding-days strip with hourly markers, the 24×60 coverage grid and
 * the missing-ranges table. v-if replaces the legacy hidden toggling; the
 * backdrop is position: fixed so nesting under the panel section is safe.
 */
import { nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import {
  calloutClass,
  contextDayClass,
  contextHourClass,
  gapCellClass,
  noteClass,
  panelHeadClass,
} from '../../lib/uiClasses';
import type { IntegrityController } from '../../composables/useIntegrity';
import SummaryCards from './SummaryCards.vue';

const props = defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

// :4802 — focus the close button when the modal opens (by id: the ui/
// Button component instance has no focus()).
watch(
  () => props.store.gapOpen.value,
  (open) => {
    if (!open) return;
    void nextTick(() => document.getElementById('btn-integrity-gap-close')?.focus());
  },
  { flush: 'post' }
);

function onDaySelect(value: unknown): void {
  void props.store.loadGapDay(String(value ?? '')); // :9200-9202
}

const thClass =
  'sticky top-0 z-[1] border-b-2 border-border-default bg-panel p-2 text-left';
</script>

<template>
  <div
    v-if="store.gapOpen.value"
    class="integrity-gap-backdrop fixed inset-0 z-[20000] flex items-center justify-center bg-page/82 p-5 backdrop-blur-[3px] max-[760px]:p-2"
    id="integrity-gap-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="integrity-gap-title"
  >
    <div class="integrity-gap-dialog w-[min(1080px,100%)] max-h-[calc(100dvh-40px)] overflow-auto rounded-[10px] border border-border-default bg-panel p-5 shadow-[0_24px_80px_rgba(5,8,14,0.5)] max-[760px]:max-h-[calc(100dvh-16px)] max-[760px]:p-3">
      <div :class="panelHeadClass">
        <div>
          <div class="eyebrow">{{ t('market.minuteCoverage') }}</div>
          <h2 id="integrity-gap-title">{{ t('market.gapDetailsTitle') }}</h2>
          <p :class="noteClass" id="integrity-gap-subtitle">{{ store.gapSubtitle.value }}</p>
        </div>
        <Button
          variant="info"
          id="btn-integrity-gap-close"
          type="button"
          @click="store.closeGapDetails()"
        >
          {{ t('common.close') }}
        </Button>
      </div>
      <div class="integrity-gap-controls flex flex-wrap items-end gap-3">
        <label class="min-w-[180px]">
          <span id="integrity-gap-day-label">{{ t('market.damagedDay') }}</span>
          <SelectRoot :model-value="store.gapSelectedDay.value" @update:model-value="onDaySelect">
            <SelectTrigger id="integrity-gap-day" aria-labelledby="integrity-gap-day-label">
              <span>{{ store.gapDayOptions.value.find((option) => option.value === store.gapSelectedDay.value)?.label ?? store.gapSelectedDay.value }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="option in store.gapDayOptions.value" :key="option.value" :value="option.value">
                {{ option.label }}
              </SelectItem>
            </SelectContent>
          </SelectRoot>
        </label>
      </div>
      <div
        v-if="store.gapFeedback.value.message"
        :class="calloutClass(store.gapFeedback.value.level === 'error')"
        id="integrity-gap-feedback"
      >
        {{ store.gapFeedback.value.message }}
      </div>
      <SummaryCards id="integrity-gap-summary" class="integrity-gap-summary my-3" :cards="store.gapSummaryCards.value" />
      <div>
        <div class="eyebrow">{{ t('market.surroundingDays') }}</div>
        <p :class="noteClass">{{ t('market.surroundingDaysNote') }}</p>
        <div class="integrity-day-context-wrap my-3 overflow-x-auto">
          <div class="integrity-day-context grid min-w-[720px] gap-[3px]" id="integrity-day-context">
            <button
              v-for="day in store.gapDayContext.value"
              :key="day.day"
              type="button"
              :class="contextDayClass(day.selected)"
              :disabled="day.disabled"
              :data-integrity-context-day="day.day"
              :title="day.title"
              @click="store.loadGapDay(day.day)"
            >
              <span>{{ day.day }}</span>
              <span class="integrity-context-hours grid grid-cols-[repeat(24,minmax(5px,1fr))] gap-[2px]">
                <i
                  v-for="(hour, index) in day.hours"
                  :key="index"
                  :class="contextHourClass(hour.cls)"
                  :title="hour.title"
                ></i>
              </span>
              <span class="integrity-context-meta">{{ day.candles }}</span>
              <span class="integrity-context-meta">{{ day.status }}</span>
            </button>
          </div>
        </div>
      </div>
      <div class="integrity-gap-legend mb-2 flex flex-wrap gap-3">
        <span class="inline-flex items-center gap-1"><i class="integrity-gap-swatch w-3" :class="gapCellClass('')"></i><span>{{ t('market.present') }}</span></span>
        <span class="inline-flex items-center gap-1"><i class="integrity-gap-swatch w-3" :class="gapCellClass('leading')"></i><span>{{ t('market.leadingPossibleInception') }}</span></span>
        <span class="inline-flex items-center gap-1"><i class="integrity-gap-swatch w-3" :class="gapCellClass('internal')"></i><span>{{ t('market.internalGap') }}</span></span>
        <span class="inline-flex items-center gap-1"><i class="integrity-gap-swatch w-3" :class="gapCellClass('trailing')"></i><span>{{ t('market.trailingGap') }}</span></span>
      </div>
      <div class="integrity-gap-chart-wrap overflow-x-auto pb-2">
        <div class="integrity-gap-chart grid min-w-[650px] gap-[3px]" id="integrity-gap-chart">
          <div v-for="row in store.gapChart.value" :key="row.label" class="integrity-gap-hour grid items-center gap-px grid-cols-[42px_repeat(60,minmax(4px,1fr))]">
            <span class="integrity-gap-hour-label">{{ row.label }}</span>
            <span
              v-for="(cell, index) in row.cells"
              :key="index"
              :class="[gapCellClass(cell.cls), 'h-[9px]']"
              :title="cell.title"
            ></span>
          </div>
        </div>
      </div>
      <div class="integrity-table-wrap integrity-gap-ranges mt-3 max-h-[52vh] overflow-auto rounded-md border border-border-default">
        <table class="integrity-table w-full border-collapse max-[760px]:min-w-[720px]">
          <thead>
            <tr>
              <th :class="thClass">{{ t('market.kind') }}</th>
              <th :class="thClass">{{ t('market.start') }}</th>
              <th :class="thClass">{{ t('market.end') }}</th>
              <th :class="thClass">{{ t('market.minutes') }}</th>
              <th :class="thClass">{{ t('market.assessment') }}</th>
            </tr>
          </thead>
          <tbody id="integrity-gap-ranges">
            <tr v-for="(range, index) in store.gapRanges.value" :key="index">
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ range.kind }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ range.start }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ range.end }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ range.minutes }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ range.assessment }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
