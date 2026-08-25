<script setup lang="ts">
import { PhCaretRight, PhMinus, PhPlus } from '@phosphor-icons/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
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
const invalidModel = computed(() => {
  try {
    const parsed: unknown = JSON.parse(model.value);
    return !parsed || typeof parsed !== 'object' || Array.isArray(parsed);
  } catch {
    return true;
  }
});
const needsReview = computed(() => invalidModel.value || props.errorLine !== null || Object.values(props.paramStatus).includes('pb_default'));
const long = computed(() => props.side === 'long');
const jsonOpen = ref(false);

/** botSyncFromJson (:4649-4659) — a JSON edit updates the TWE/npos inputs. */
watch(model, (raw) => {
  const obj = objectOf(raw);
  if (Object.keys(obj).length === 0) return;
  emit('update:twe', String(getSideValue(props.version, obj, 'total_wallet_exposure_limit', props.twe)));
  emit('update:npos', String(getSideValue(props.version, obj, 'n_positions', props.npos)));
});
</script>

<template>
  <section
    class="bot-side-panel min-w-0 rounded-[9px] border-x border-b border-secondary/14 bg-page/30 p-3"
    :class="long ? 'long border-t-2 border-t-success' : 'short border-t-2 border-t-danger'"
    :data-test="'bot-side-' + side"
    role="region"
    :aria-labelledby="'bot-side-title-' + side"
  >
    <header class="bot-side-head mb-2.5 flex min-w-0 items-center justify-between gap-2 border-b border-secondary/12 pb-2">
      <h3 :id="'bot-side-title-' + side" class="bot-side-title flex min-w-0 items-center justify-between gap-2">
        <span class="bot-side-direction min-w-0 font-bold text-primary [overflow-wrap:anywhere]">{{ t(side === 'long' ? 'v7backtest.long' : 'v7backtest.short') }}</span>
        <span class="bot-side-role shrink-0 font-mono text-[10px] leading-none tracking-[0.12em] text-secondary">{{ side.toUpperCase() }}</span>
      </h3>
    </header>
    <div class="form-row cols-2 bot-side-primary" style="margin-bottom: var(--sp-sm)">
      <div class="form-group">
        <label :data-tip="t('v7backtest.tip.totalWalletExposureLimit')">total_wallet_exposure_limit</label>
        <div class="num-stepper">
          <Button type="button" variant="default" class="stepper-btn" aria-label="Decrease total_wallet_exposure_limit" title="Decrease total_wallet_exposure_limit" @click="step('total_wallet_exposure_limit', -tweStep, 10)"><PbIcon :icon="PhMinus" /></Button>
          <Input type="number" :model-value="twe" step="0.05" @update:model-value="syncField('total_wallet_exposure_limit', String($event ?? ''))" />
          <Button type="button" variant="default" class="stepper-btn" aria-label="Increase total_wallet_exposure_limit" title="Increase total_wallet_exposure_limit" @click="step('total_wallet_exposure_limit', tweStep, 10)"><PbIcon :icon="PhPlus" /></Button>
        </div>
      </div>
      <div class="form-group">
        <label :data-tip="t(side === 'long' ? 'v7backtest.tip.nPositionsLong' : 'v7backtest.tip.nPositionsShort')">n_positions</label>
        <div class="num-stepper">
          <Button type="button" variant="default" class="stepper-btn" aria-label="Decrease n_positions" title="Decrease n_positions" @click="step('n_positions', -1, 10)"><PbIcon :icon="PhMinus" /></Button>
          <Input type="number" :model-value="npos" step="1" @update:model-value="syncField('n_positions', String($event ?? ''))" />
          <Button type="button" variant="default" class="stepper-btn" aria-label="Increase n_positions" title="Increase n_positions" @click="step('n_positions', 1, 10)"><PbIcon :icon="PhPlus" /></Button>
        </div>
      </div>
    </div>
    <div class="expander bot-json-expander" :class="{ open: jsonOpen, error: needsReview }" :data-test="'bot-json-expander-' + side">
      <Button
        type="button"
        variant="ghost"
        class="expander-header h-auto"
        :aria-expanded="jsonOpen"
        :aria-controls="'bot-json-content-' + side"
        :data-test="'bot-json-expander-toggle-' + side"
        @click="jsonOpen = !jsonOpen"
      >
        <PbIcon class="arrow" :icon="PhCaretRight" />
        <span>{{ t('v7backtest.fullConfigJson') }}</span>
        <span v-if="needsReview" class="bot-json-review ml-auto text-xs font-semibold text-warning">{{ t('v7backtest.review') }}</span>
      </Button>
      <div :id="'bot-json-content-' + side" class="expander-body">
        <div v-if="jsonOpen" class="form-group">
          <label :data-tip="t('v7backtest.tip.fullConfigJson')">
            {{ t('v7backtest.fullConfigJson') }}
            <span v-if="hasStatus" style="font-size: var(--fs-xs, 11px); font-weight: 400; opacity: 0.8">
              ■ <span style="color: var(--warning)">{{ t('v7backtest.neutralized') }}</span>
              &nbsp;■ <span style="color: var(--danger)">{{ t('v7backtest.review') }}</span>
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
                    ? 'rgb(var(--danger-rgb) / 0.16)'
                    : line.status === 'neutralized'
                      ? 'color-mix(in srgb,var(--warning) 16%,transparent)'
                      : line.status === 'pb_default'
                        ? 'color-mix(in srgb,var(--danger) 16%,transparent)'
                        : 'transparent',
                borderRadius: line.status || line.error ? '2px' : undefined,
                boxShadow: line.error ? 'inset 3px 0 0 rgb(var(--danger-rgb) / 0.95)' : undefined,
              }"
              >{{ line.text }}</span></pre>
            <Textarea
              v-model="model"
              style="position: relative; z-index: 1; background: transparent; overflow: hidden; resize: vertical"
              :data-test="'cfg-bot-' + side"
            />
          </div>
          <div :id="'cfg-bot-' + side + '-status'" class="field-status field-status-inline" aria-live="polite"></div>
        </div>
      </div>
    </div>
  </section>
</template>
