<script setup lang="ts">
/**
 * PeriodControls — the period select + CUSTOM from/to/Now controls, the dedup
 * of the block repeated 6× in the legacy inline builders
 * (dashboard_editor.html:1262-1330 and its PNL/ADG/PPL/INCOME copies):
 *
 *  - select over PERIODS_TOP; selecting CUSTOM writes the legacy default
 *    range (30 days back → today) through the update:period event;
 *  - CUSTOM values additionally show the from/to date inputs and the Now
 *    checkbox (to-part NOW / today);
 *  - the widget owns the state write + scheduleSync + refetch — this
 *    component only renders and emits (the pure value transforms live in
 *    composables/usePeriodControls.ts).
 *
 * Quirks kept: the Now label is the untranslated legacy literal (editor
 * builds it via createTextNode('Now')), the from control gets a · separator
 * while the to control does not, and a toNow value shows today's date in the
 * disabled to-input.
 */
import { computed } from 'vue';
import {
  PERIODS_TOP,
  parseCustomPeriod,
  periodFromSelect,
  periodWithFrom,
  periodWithNow,
  periodWithTo,
  todayIso,
} from '../../composables/usePeriodControls';
import { dashT } from '../../lib/i18n';

const props = defineProps<{
  /** Legacy state[pKey] — 'THIS_MONTH' | 'CUSTOM:from:to' | … */
  period: string;
}>();

const emit = defineEmits<{ 'update:period': [value: string] }>();

const parsed = computed(() => parseCustomPeriod(props.period));

function onSelectChange(e: Event): void {
  emit('update:period', periodFromSelect((e.target as HTMLSelectElement).value));
}

function onFromChange(e: Event): void {
  emit('update:period', periodWithFrom(props.period, (e.target as HTMLInputElement).value));
}

function onToChange(e: Event): void {
  emit('update:period', periodWithTo(props.period, (e.target as HTMLInputElement).value));
}

function onNowChange(e: Event): void {
  emit('update:period', periodWithNow(props.period, (e.target as HTMLInputElement).checked));
}
</script>

<template>
  <span class="dt-meta-lbl">{{ dashT('dash.period', 'Period') }}</span>
  <select class="dt-ctrl-sel" :value="parsed.displayPeriod" @change="onSelectChange">
    <option v-for="p in PERIODS_TOP" :key="p" :value="p">{{ p }}</option>
  </select>
  <template v-if="parsed.isCustom">
    <span class="dt-meta-sep">·</span>
    <span class="dt-meta-lbl">{{ dashT('dash.from', 'From') }}</span>
    <input type="date" class="dt-ctrl-date" :value="parsed.from" @change="onFromChange" />
    <span class="dt-meta-lbl">{{ dashT('dash.to', 'To') }}</span>
    <input
      type="date"
      class="dt-ctrl-date"
      :value="parsed.toNow ? todayIso() : parsed.to"
      :disabled="parsed.toNow"
      @change="onToChange"
    />
    <label class="dt-ctrl-now-wrap">
      <input type="checkbox" :checked="parsed.toNow" @change="onNowChange" />Now
    </label>
  </template>
</template>
