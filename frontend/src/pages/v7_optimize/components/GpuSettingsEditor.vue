<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import {
  gpuAutoPlaceholder,
  gpuContractItem,
  gpuDefaults,
  gpuUnavailableMessage,
  isObject,
  type GpuContractItem,
  type JsonObject,
} from '../lib/configModel';

const props = defineProps<{
  gpu: JsonObject;
  optimizeDefaults: Record<string, unknown>;
  contract: unknown;
}>();
const emit = defineEmits<{ 'update:gpu': [value: JsonObject] }>();
const { t } = useI18n();

const capability = computed<GpuContractItem | null>(() => gpuContractItem(props.contract, 'gpu'));
const defaults = computed<JsonObject>(() => gpuDefaults(props.optimizeDefaults));
const halvingDefaults = computed<JsonObject>(() => {
  const value = defaults.value.successive_halving;
  return isObject(value) ? value : {};
});
const unavailableMessage = computed(() => gpuUnavailableMessage(capability.value));

function halvingObject(): JsonObject {
  const current = props.gpu.successive_halving;
  return isObject(current) ? current : {};
}
function fieldValue(key: string): unknown {
  return Object.prototype.hasOwnProperty.call(props.gpu, key) ? props.gpu[key] : defaults.value[key];
}
function halvingValue(key: string): unknown {
  const current = halvingObject();
  return Object.prototype.hasOwnProperty.call(current, key) ? current[key] : halvingDefaults.value[key];
}
function fieldText(key: string): string {
  const value = fieldValue(key);
  return value == null ? '' : String(value);
}
function halvingText(key: string): string {
  const value = halvingValue(key);
  return value == null ? '' : String(value);
}
function fractionsText(): string {
  const value = halvingValue('history_fractions');
  return Array.isArray(value) ? value.join(', ') : String(value ?? '');
}

function emitField(key: string, value: unknown): void {
  emit('update:gpu', { ...props.gpu, [key]: value });
}
function emitHalving(key: string, value: unknown): void {
  emit('update:gpu', { ...props.gpu, successive_halving: { ...halvingObject(), [key]: value } });
}

function nullablePositiveInteger(value: string): number | null | string {
  const text = value.trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : text;
}
function nonnegativeInteger(value: string): number | string {
  const text = value.trim();
  if (!text) return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : text;
}
function numeric(value: string): number | string {
  const text = value.trim();
  if (!text) return '';
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : text;
}

function reset(): void {
  emit('update:gpu', gpuDefaults(props.optimizeDefaults));
}

const fieldGrid = 'grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2.5 max-[600px]:grid-cols-1 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))]';
const fieldLabel = 'grid gap-1.5 text-xs text-secondary';
const headingLabel = 'col-span-4 text-xs font-semibold text-secondary max-[600px]:col-span-1 max-[900px]:col-span-2';
</script>

<template>
  <div class="col-span-4 grid gap-3 max-[600px]:col-span-1 max-[900px]:col-span-2">
    <div v-if="unavailableMessage" class="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">{{ unavailableMessage }}</div>
    <div class="flex items-center gap-2.5">
      <strong class="text-sm">Apple MPS GPU</strong>
      <Button type="button" variant="default" size="sm" data-action="reset-gpu" @click="reset">Reset GPU defaults</Button>
    </div>

    <div :class="fieldGrid">
      <div :class="headingLabel">Automatic sizing</div>
      <label><Checkbox data-field="gpu-auto-lean" :model-value="fieldValue('auto_lean_parallelism') !== false" @update:model-value="emitField('auto_lean_parallelism', ($event === true))" /> <span :data-tip="t('v7optimize.tip.gpu.auto_lean_parallelism')">auto_lean_parallelism</span></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.population_size')">population_size</span><Input data-field="gpu-population-size" type="number" step="1" :placeholder="gpuAutoPlaceholder(capability, 'population_size')" :model-value="fieldText('population_size')" @update:model-value="emitField('population_size', nullablePositiveInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.batch_size')">batch_size</span><Input data-field="gpu-batch-size" type="number" step="1" :placeholder="gpuAutoPlaceholder(capability, 'batch_size')" :model-value="fieldText('batch_size')" @update:model-value="emitField('batch_size', nullablePositiveInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.max_dispatch_candidate_bars')">max_dispatch_candidate_bars</span><Input data-field="gpu-max-dispatch-bars" type="number" step="1" :placeholder="gpuAutoPlaceholder(capability, 'max_dispatch_candidate_bars')" :model-value="fieldText('max_dispatch_candidate_bars')" @update:model-value="emitField('max_dispatch_candidate_bars', nullablePositiveInteger(String($event ?? '')))" /></label>

      <div :class="headingLabel">Exact validation &amp; checkpointing</div>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.exact_workers')">exact_workers</span><Input data-field="gpu-exact-workers" type="number" step="1" :model-value="fieldText('exact_workers')" @update:model-value="emitField('exact_workers', nonnegativeInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.max_pending_exact')">max_pending_exact</span><Input data-field="gpu-max-pending-exact" type="number" step="1" :model-value="fieldText('max_pending_exact')" @update:model-value="emitField('max_pending_exact', nonnegativeInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.validate_per_generation')">validate_per_generation</span><Input data-field="gpu-validate-generation" type="number" step="1" :model-value="fieldText('validate_per_generation')" @update:model-value="emitField('validate_per_generation', nullablePositiveInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.checkpoint_interval_seconds')">checkpoint_interval_seconds</span><Input data-field="gpu-checkpoint-seconds" type="number" step="any" :model-value="fieldText('checkpoint_interval_seconds')" @update:model-value="emitField('checkpoint_interval_seconds', numeric(String($event ?? '')))" /></label>

      <div :class="headingLabel">Drift safety</div>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.drift_probes')">drift_probes</span><Input data-field="gpu-drift-probes" type="number" step="1" :model-value="fieldText('drift_probes')" @update:model-value="emitField('drift_probes', nonnegativeInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.drift_window')">drift_window</span><Input data-field="gpu-drift-window" type="number" step="1" :model-value="fieldText('drift_window')" @update:model-value="emitField('drift_window', nullablePositiveInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.drift_min_samples')">drift_min_samples</span><Input data-field="gpu-drift-min-samples" type="number" step="1" :model-value="fieldText('drift_min_samples')" @update:model-value="emitField('drift_min_samples', nullablePositiveInteger(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.drift_halt')">drift_halt</span><Input data-field="gpu-drift-halt" type="number" step="any" :model-value="fieldText('drift_halt')" @update:model-value="emitField('drift_halt', numeric(String($event ?? '')))" /></label>

      <div :class="headingLabel">Successive halving</div>
      <label><Checkbox data-field="gpu-halving-enabled" :model-value="!!halvingValue('enabled')" @update:model-value="emitHalving('enabled', ($event === true))" /> <span :data-tip="t('v7optimize.tip.gpu.halving.enabled')">enabled</span></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.halving.history_fractions')">history_fractions</span><Input data-field="gpu-halving-fractions" type="text" :model-value="fractionsText()" @update:model-value="emitHalving('history_fractions', String($event ?? ''))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.halving.survival_fraction')">survival_fraction</span><Input data-field="gpu-halving-survival" type="number" step="any" :model-value="halvingText('survival_fraction')" @update:model-value="emitHalving('survival_fraction', numeric(String($event ?? '')))" /></label>
      <label :class="fieldLabel"><span :data-tip="t('v7optimize.tip.gpu.halving.min_survivors')">min_survivors</span><Input data-field="gpu-halving-min-survivors" type="number" step="1" :model-value="halvingText('min_survivors')" @update:model-value="emitHalving('min_survivors', nullablePositiveInteger(String($event ?? '')))" /></label>
    </div>
  </div>
</template>
