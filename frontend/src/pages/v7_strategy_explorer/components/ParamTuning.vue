<script setup lang="ts">
/**
 * One side's tuning column — the segment tabs + param fields of
 * renderSideTuning/renderParamField (:1812-1913). Sliders/selects/bools/
 * texts write through setParamValue and recalculate on change; the live
 * value span (sv-<prefix><side>-<name>) is reactive here.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { fmt } from '../lib/format';
import { paramBounds, paramLabel, paramNearBound, paramTooltip } from '../lib/params';
import { deepGet } from '../lib/format';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import type { ParamFieldMeta } from '../types';

const props = defineProps<{ store: ExplorerStore; sideKey: 'long' | 'short'; prefix?: string }>();
const { t } = useI18n();
const store = props.store;
const prefix = props.prefix ?? '';

const segmentKey = computed(() => (props.sideKey === 'long' ? store.state.longSegment : store.state.shortSegment));
const segment = computed(() => store.segments.value.find((s) => s.key === segmentKey.value) || store.segments.value[0]!);

interface FieldView {
  name: string;
  label: string;
  tip: string;
  kind: 'bool' | 'select' | 'text' | 'number';
  value: unknown;
  nearBound: '' | 'lower' | 'upper';
  options: string[];
  bounds?: { min: number; max: number; step: number };
  display?: string;
}

function fieldViews(): FieldView[] {
  return (segment.value.fields || []).map((name) => {
    const meta: ParamFieldMeta = store.fieldMeta(name);
    const value = store.paramValueFor(name, props.sideKey);
    const kind = meta.type === 'bool' || meta.type === 'boolean' ? 'bool' : meta.type === 'select' ? 'select' : meta.type === 'string' || meta.type === 'text' ? 'text' : 'number';
    let options: string[] = [];
    if (kind === 'select') {
      const raw = typeof meta.options === 'function' ? meta.options() : meta.options || [];
      const list = Array.isArray(raw) ? raw.slice() : [];
      const optionValues = list.map((opt) => String(opt && typeof opt === 'object' ? (opt as { value: unknown }).value : opt));
      const val = value;
      if (val !== undefined && val !== null && String(val) !== '' && !optionValues.includes(String(val))) list.unshift(String(val));
      options = list.map((opt) => (opt && typeof opt === 'object' ? String((opt as { value: unknown }).value) : String(opt)));
    }
    const bounds = kind === 'number' ? paramBounds(name, Number(value || 0), meta) : undefined;
    const numVal = Number(value || 0);
    return {
      name,
      label: paramLabel(name, meta),
      tip: paramTooltip(name, store.strategyLabel.value, (key, p) => t(key, p ?? {}), meta),
      kind,
      value,
      nearBound: paramNearBound(store.adapter.flavor, props.sideKey, name, value, store.state.config || {}, meta),
      options,
      bounds,
      display: bounds ? numVal.toFixed(bounds.step >= 1 ? 2 : 4) : undefined,
    };
  });
}

function setSegment(key: string): void {
  if (props.sideKey === 'long') store.state.longSegment = key;
  else store.state.shortSegment = key;
}
/** updateSliderFill (:572-579) — the --range-fill CSS var as a percentage. */
function rangeFill(field: FieldView): string {
  const b = field.bounds!;
  const value = Number(field.value || 0);
  const pct = b.max > b.min ? Math.max(0, Math.min(100, ((value - b.min) / (b.max - b.min)) * 100)) : 0;
  return pct.toFixed(2) + '%';
}
function onSliderInput(field: FieldView, event: Event): void {
  const el = event.target as HTMLInputElement;
  const val = Number(el.value || 0);
  store.setParam(props.sideKey, field.name!, val);
}
function sliderDisplay(field: FieldView): string {
  const b = field.bounds!;
  return Number(field.value || 0).toFixed(b.step >= 1 ? 2 : 4);
}
function onSliderChange(): void {
  void store.recalculate();
}

/* Segment tab colour sets — the former .segment-tabs button base/active
   rules of styles/explorer.css (the active branch keeps the plain :hover
   tint, matching the legacy cascade where :hover beat .active). Full
   colour set per branch; the neutral branch never fights the static
   utilities. */
function segmentTabClass(isActive: boolean): string {
  return isActive
    ? 'active bg-accent-deep/22 text-primary outline-1 outline-accent/75 -outline-offset-1 hover:bg-accent/8 hover:text-primary'
    : 'bg-transparent text-muted hover:bg-secondary/8 hover:text-primary';
}
</script>

<template>
  <div
    :id="prefix + sideKey + '-tuning'"
    :class="prefix ? '' : 'p-3 border border-secondary/13 border-t-0 rounded-b-[10px] bg-page/74'"
  >
    <div class="flex flex-col gap-1"><label class="text-secondary text-xs uppercase tracking-[0.04em]">{{ t('v7explore.segment') }}</label></div>
    <div class="pbgui-tab-bar grid grid-cols-[repeat(auto-fit,minmax(92px,1fr))] gap-0 mt-1.25 mb-3.5 overflow-hidden rounded-lg border border-secondary/15 bg-page/60">
      <button
        v-for="seg in store.segments.value"
        :key="seg.key"
        class="pbgui-tab min-w-0 min-h-[31px] cursor-pointer border-0 border-r border-r-secondary/12 bg-transparent px-2 py-1.25 text-xs transition-[color,background-color] duration-150 ease-[ease] last:border-r-0"
        type="button"
        :class="segmentTabClass(seg.key === segmentKey)"
        @click="setSegment(seg.key)"
      >
        {{ seg.label ?? t(seg.labelKey || '') }}
      </button>
    </div>
    <div v-for="field in fieldViews()" :key="field.name" class="pt-2 pb-2.5 mb-3 border-b border-b-secondary/8 last:border-b-0" :class="field.nearBound ? 'border-l-[3px] border-l-warning pl-2' : ''">
      <div class="flex min-h-[22px] items-center justify-between gap-2 text-sm">
        <span class="min-w-0 truncate text-secondary text-xs" :data-tip="field.tip">{{ field.label }}</span>
        <span class="inline-flex flex-none items-center gap-1.5">
          <span v-if="field.nearBound" class="px-1.5 py-0.5 rounded-full border border-warning/32 bg-warning-deep/13 text-warning-soft text-[9px] font-bold uppercase tracking-[0.04em]">{{ field.nearBound === 'lower' ? t('v7explore.nearLowerBound') : t('v7explore.nearUpperBound') }}</span>
          <span v-if="field.kind === 'select'" class="min-w-16 px-1.5 py-0.5 rounded-[5px] border border-accent/18 bg-accent-deep/8 text-right font-mono text-[10px] font-bold text-accent-soft">{{ field.value || '-' }}</span>
          <span v-else-if="field.kind === 'number'" class="min-w-16 px-1.5 py-0.5 rounded-[5px] border border-accent/18 bg-accent-deep/8 text-right font-mono text-[10px] font-bold text-accent-soft">{{ sliderDisplay(field) }}</span>
          <span class="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border-default text-accent-soft text-xs" :data-tip="field.tip">?</span>
        </span>
      </div>
      <label v-if="field.kind === 'bool'" class="mt-1.5 flex min-h-[30px] items-center gap-2 rounded-[7px] border border-secondary/12 bg-secondary/[0.045] px-2 py-1.5 text-secondary text-sm">
        <input class="param-bool w-auto accent-accent" type="checkbox" :checked="!!field.value" :aria-label="field.label" @change="store.setParam(sideKey, field.name, ($event.target as HTMLInputElement).checked); store.recalculate()">
        {{ t('common.enabled') }}
      </label>
      <select v-else-if="field.kind === 'select'" class="mt-1.5 w-full min-h-[31px] rounded-[7px] border border-secondary/15 bg-page/68 px-2 py-1.75 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" :aria-label="field.label" :data-tip="field.tip" :value="String(field.value ?? '')" @change="store.setParam(sideKey, field.name, ($event.target as HTMLSelectElement).value); store.recalculate()">
        <option v-for="opt in field.options" :key="opt" :value="opt" :selected="String(opt) === String(field.value)">{{ opt }}</option>
      </select>
      <input v-else-if="field.kind === 'text'" class="mt-1.5 w-full min-h-[31px] rounded-[7px] border border-secondary/15 bg-page/68 px-2 py-1.75 text-primary focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.13)] focus:outline-none" type="text" :aria-label="field.label" :data-tip="field.tip" :value="field.value === undefined || field.value === null ? '' : String(field.value)" @change="store.setParam(sideKey, field.name, ($event.target as HTMLInputElement).value); store.recalculate()">
      <template v-else>
        <input class="param-slider h-[18px] w-full cursor-pointer appearance-none bg-transparent accent-accent" type="range" :aria-label="field.label" :data-tip="field.tip" :min="field.bounds!.min" :max="field.bounds!.max" :step="field.bounds!.step" :value="field.value === undefined ? 0 : Number(field.value)" :style="{ '--range-fill': rangeFill(field) }" @input="onSliderInput(field, $event)" @change="onSliderChange">
      </template>
    </div>
    <div v-if="segmentKey === 'entry_grid'" class="mt-2.25 mb-2.5 border-l-2 border-l-accent rounded-r-[7px] bg-accent-deep/8 py-2 px-2.5 text-secondary text-xs">
      {{ t('v7explore.theoreticalMaxGridOrders', { count: deepGet(store.state.snapshot, ['sides', sideKey, 'summary', 'entry_orders'], 0), label: store.strategyLabel.value }) }}
    </div>
    <div v-if="segmentKey === 'entry_grid' || segmentKey === 'entry_trailing'" class="mt-2.25 mb-2.5 border-l-2 border-l-accent rounded-r-[7px] bg-accent-deep/8 py-2 px-2.5 text-secondary text-xs">
      {{ t('v7explore.injectedVolatility', { value: fmt(deepGet(store.state.snapshot, ['sides', sideKey, 'debug', 'state_params', 'entry_volatility_logrange_ema_1h'], 0), 8) }) }}
    </div>
  </div>
</template>
