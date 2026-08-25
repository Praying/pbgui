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
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
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
import {
  dtCtrlDateClass,
  dtCtrlNowWrapClass,
  dtCtrlSelClass,
  dtMetaLblClass,
  dtMetaSepClass,
} from './uiClasses';

const props = defineProps<{
  /** Legacy state[pKey] — 'THIS_MONTH' | 'CUSTOM:from:to' | … */
  period: string;
}>();

const emit = defineEmits<{ 'update:period': [value: string] }>();

const parsed = computed(() => parseCustomPeriod(props.period));

/* The legacy <select> change event carried the value through
   e.target.value; the reka listbox delivers it as the update payload. */
function onPeriodUpdate(value: unknown): void {
  emit('update:period', periodFromSelect(String(value)));
}

function onFromChange(e: Event): void {
  emit('update:period', periodWithFrom(props.period, (e.target as HTMLInputElement).value));
}

function onToChange(e: Event): void {
  emit('update:period', periodWithTo(props.period, (e.target as HTMLInputElement).value));
}

function onNowUpdate(checked: boolean | 'indeterminate'): void {
  emit('update:period', periodWithNow(props.period, checked === true));
}
</script>

<template>
  <span :class="dtMetaLblClass">{{ dashT('dash.period', 'Period') }}</span>
  <SelectRoot :model-value="parsed.displayPeriod" @update:model-value="onPeriodUpdate">
    <SelectTrigger :class="dtCtrlSelClass" :aria-label="dashT('dash.period', 'Period')">
      <span>{{ parsed.displayPeriod }}</span>
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="p in PERIODS_TOP" :key="p" :value="p">{{ p }}</SelectItem>
    </SelectContent>
  </SelectRoot>
  <template v-if="parsed.isCustom">
    <span :class="dtMetaSepClass">·</span>
    <span :class="dtMetaLblClass">{{ dashT('dash.from', 'From') }}</span>
    <Input type="date" size="sm" :class="dtCtrlDateClass" :model-value="parsed.from" @change="onFromChange" />
    <span :class="dtMetaLblClass">{{ dashT('dash.to', 'To') }}</span>
    <Input
      type="date"
      size="sm"
      :class="dtCtrlDateClass"
      :model-value="parsed.toNow ? todayIso() : parsed.to"
      :disabled="parsed.toNow"
      @change="onToChange"
    />
    <label :class="dtCtrlNowWrapClass">
      <Checkbox :model-value="parsed.toNow" @update:model-value="onNowUpdate" />Now
    </label>
  </template>
</template>
