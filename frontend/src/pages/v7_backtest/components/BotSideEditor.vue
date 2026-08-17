<script setup lang="ts">
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { botHighlightLines } from '@/shared/botHighlight';
import { getSideValue } from '../lib/sideValues';
import type { BacktestVersion } from '../types';

/**
 * BotSideEditor — one side of the Bot Configuration block
 * (v7_backtest.html:2816-2870): TWE/npos steppers that patch the JSON
 * (botSyncFromFields :4635-4648) and the full-config JSON textarea with
 * the param-status highlight overlay (_applyBotJsonHighlight
 * :4522-4633) and its validation status (:2840).
 */

const model = defineModel<string>({ required: true });
const props = withDefaults(
  defineProps<{
    side: 'long' | 'short';
    twe: string;
    npos: string;
    paramStatus?: Record<string, string>;
    /** JSON parse error line, if any (validation, :3196-3206). */
    errorLine?: number | null;
    tweStep?: number;
    version?: BacktestVersion;
  }>(),
  { paramStatus: () => ({}), errorLine: null, tweStep: 0.05, version: 'v7' }
);

const emit = defineEmits<{ 'update:twe': [value: string]; 'update:npos': [value: string] }>();

const { t } = useI18n();

const lines = computed(() => botHighlightLines(model.value, props.paramStatus, props.errorLine));

function objectOf(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** botSyncFromFields (:4635-4648) — steppers rewrite the JSON object. */
function syncField(field: 'total_wallet_exposure_limit' | 'n_positions', raw: string): void {
  if (field === 'total_wallet_exposure_limit') emit('update:twe', raw);
  else emit('update:npos', raw);
  const obj = objectOf(model.value);
  if (Object.keys(obj).length === 0) return;
  const value = field === 'total_wallet_exposure_limit' ? parseFloat(raw) : parseInt(raw, 10);
  if (Number.isNaN(value)) return;
  obj[field] = value;
  model.value = JSON.stringify(obj, null, 2);
}

function step(field: 'total_wallet_exposure_limit' | 'n_positions', delta: number, decimals: number, min?: number, max?: number): void {
  const current = field === 'total_wallet_exposure_limit' ? parseFloat(props.twe) : parseInt(props.npos, 10);
  let next = (Number.isNaN(current) ? 0 : current) + delta;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  syncField(field, String(Number(next.toFixed(decimals))));
}

const hasStatus = computed(() => Object.keys(props.paramStatus).length > 0);
const long = computed(() => props.side === 'long');

/** botSyncFromJson (:4649-4659) — a JSON edit updates the TWE/npos inputs. */
watch(model, (raw) => {
  const obj = objectOf(raw);
  if (Object.keys(obj).length === 0) return;
  emit('update:twe', String(getSideValue(props.version, obj, 'total_wallet_exposure_limit', props.twe)));
  emit('update:npos', String(getSideValue(props.version, obj, 'n_positions', props.npos)));
});
</script>

<template>
  <div>
    <div :style="{ fontWeight: 600, fontSize: 'var(--fs-sm)', marginBottom: 'var(--sp-sm)', color: long ? 'var(--green)' : 'var(--red)' }">
      {{ t(side === 'long' ? 'v7backtest.long' : 'v7backtest.short') }}
    </div>
    <div class="form-row cols-2" style="margin-bottom: var(--sp-sm)">
      <div class="form-group">
        <label>total_wallet_exposure_limit</label>
        <div class="num-stepper">
          <button type="button" class="stepper-btn" @click="step('total_wallet_exposure_limit', -tweStep, 10)">−</button>
          <input type="number" :value="twe" step="0.05" @input="syncField('total_wallet_exposure_limit', ($event.target as HTMLInputElement).value)" />
          <button type="button" class="stepper-btn" @click="step('total_wallet_exposure_limit', tweStep, 10)">+</button>
        </div>
      </div>
      <div class="form-group">
        <label>n_positions</label>
        <div class="num-stepper">
          <button type="button" class="stepper-btn" @click="step('n_positions', -1, 10)">−</button>
          <input type="number" :value="npos" step="1" @input="syncField('n_positions', ($event.target as HTMLInputElement).value)" />
          <button type="button" class="stepper-btn" @click="step('n_positions', 1, 10)">+</button>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>
        {{ t('v7backtest.fullConfigJson') }}
        <span v-if="hasStatus" style="font-size: var(--fs-xs, 11px); font-weight: 400; opacity: 0.8">
          ■ <span style="color: #f0a500">{{ t('v7backtest.neutralized') }}</span>
          &nbsp;■ <span style="color: #e05252">{{ t('v7backtest.review') }}</span>
        </span>
      </label>
      <div class="bot-json-highlight-wrap" style="position: relative">
        <pre class="bot-json-highlight-pre" aria-hidden="true" style="position: absolute; inset: 0; margin: 0; overflow: hidden; pointer-events: none; z-index: 0; color: transparent; white-space: pre-wrap; word-wrap: break-word"><span
          v-for="(line, i) in lines"
          :key="i"
          :style="{
            display: 'block',
            background:
              line.error
                ? 'rgba(255,75,75,0.16)'
                : line.status === 'neutralized'
                  ? 'color-mix(in srgb,#f0a500 16%,transparent)'
                  : line.status === 'pb_default'
                    ? 'color-mix(in srgb,#e05252 16%,transparent)'
                    : 'transparent',
            borderRadius: line.status || line.error ? '2px' : undefined,
            boxShadow: line.error ? 'inset 3px 0 0 rgba(255,75,75,0.95)' : undefined,
          }"
          >{{ line.text }}</span></pre>
        <textarea
          v-model="model"
          style="position: relative; z-index: 1; background: transparent; overflow: hidden; resize: vertical"
          :data-test="'cfg-bot-' + side"
        ></textarea>
      </div>
      <div :id="'cfg-bot-' + side + '-status'" class="field-status field-status-inline" aria-live="polite"></div>
    </div>
  </div>
</template>
