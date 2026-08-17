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
const params = computed(() => deepGet<Record<string, unknown>>(store.state.snapshot, ['sides', props.sideKey, 'params'], {}));

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
    const value = store.paramValueFor(params.value, name, props.sideKey);
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
</script>

<template>
  <div :id="prefix + sideKey + '-tuning'">
    <div class="field"><label>{{ t('v7explore.segment') }}</label></div>
    <div class="segment-tabs">
      <button v-for="seg in store.segments.value" :key="seg.key" type="button" :class="seg.key === segmentKey ? 'active' : ''" @click="setSegment(seg.key)">
        {{ seg.label ?? t(seg.labelKey || '') }}
      </button>
    </div>
    <div v-for="field in fieldViews()" :key="field.name" :class="'slider-field' + (field.nearBound ? ' near-bound' : '')">
      <div class="slider-label">
        <span class="slider-name" :data-tip="field.tip">{{ field.label }}</span>
        <span class="slider-meta">
          <span v-if="field.nearBound" class="near-bound-badge">{{ field.nearBound === 'lower' ? t('v7explore.nearLowerBound') : t('v7explore.nearUpperBound') }}</span>
          <span v-if="field.kind === 'select'" class="slider-value">{{ field.value || '-' }}</span>
          <span v-else-if="field.kind === 'number'" class="slider-value">{{ sliderDisplay(field) }}</span>
          <span class="help" :data-tip="field.tip">?</span>
        </span>
      </div>
      <label v-if="field.kind === 'bool'" class="param-check">
        <input class="param-bool" type="checkbox" :checked="!!field.value" :aria-label="field.label" @change="store.setParam(sideKey, field.name, ($event.target as HTMLInputElement).checked); store.recalculate()">
        {{ t('common.enabled') }}
      </label>
      <select v-else-if="field.kind === 'select'" class="param-select" :aria-label="field.label" :data-tip="field.tip" :value="String(field.value ?? '')" @change="store.setParam(sideKey, field.name, ($event.target as HTMLSelectElement).value); store.recalculate()">
        <option v-for="opt in field.options" :key="opt" :value="opt" :selected="String(opt) === String(field.value)">{{ opt }}</option>
      </select>
      <input v-else-if="field.kind === 'text'" class="param-text" type="text" :aria-label="field.label" :data-tip="field.tip" :value="field.value === undefined || field.value === null ? '' : String(field.value)" @change="store.setParam(sideKey, field.name, ($event.target as HTMLInputElement).value); store.recalculate()">
      <template v-else>
        <input class="param-slider" type="range" :aria-label="field.label" :data-tip="field.tip" :min="field.bounds!.min" :max="field.bounds!.max" :step="field.bounds!.step" :value="field.value === undefined ? 0 : Number(field.value)" :style="{ '--range-fill': rangeFill(field) }" @input="onSliderInput(field, $event)" @change="onSliderChange">
      </template>
    </div>
    <div v-if="segmentKey === 'entry_grid'" class="inline-note">
      {{ t('v7explore.theoreticalMaxGridOrders', { count: deepGet(store.state.snapshot, ['sides', sideKey, 'summary', 'entry_orders'], 0), label: store.strategyLabel.value }) }}
    </div>
    <div v-if="segmentKey === 'entry_grid' || segmentKey === 'entry_trailing'" class="inline-note">
      {{ t('v7explore.injectedVolatility', { value: fmt(deepGet(store.state.snapshot, ['sides', sideKey, 'debug', 'state_params', 'entry_volatility_logrange_ema_1h'], 0), 8) }) }}
    </div>
  </div>
</template>
