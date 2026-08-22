<script setup lang="ts">
/**
 * Bot configuration section — v7_edit.html:1084-1124: strategy_kind select
 * (v8), Long/Short TWE + n_positions inputs, and the full side-config JSON
 * textareas with the param-status legend (:2228-2238), the param-status
 * highlight overlay (_applyBotJsonHighlight :3531-3642), the per-side JSON
 * validation status (:1500-1548) and the TWE/npos ↔ JSON sync
 * (:3483-3524).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FieldNumber from './FieldNumber.vue';
import { useEditPageContext } from '../composables/useEditPage';
import { botHighlightLines } from '@/shared/botHighlight';
import { getJsonLineDetail } from '@/shared/jsonValidation';

const { t } = useI18n();
const page = useEditPageContext();
const state = page.state;

const strategyOptions = computed(() =>
  page.strategyKinds.value.map((kind) => ({ value: kind }))
);

const longError = computed(() => page.jsonFieldErrors.value.longJson ?? null);
const shortError = computed(() => page.jsonFieldErrors.value.shortJson ?? null);
const longLines = computed(() =>
  botHighlightLines(state.longJson, page.paramStatus.value.long, longError.value?.line)
);
const shortLines = computed(() =>
  botHighlightLines(state.shortJson, page.paramStatus.value.short, shortError.value?.line)
);

/** syncBotInputToJson (:3494-3503) — TWE/npos inputs overlay the side JSON. */
function onBotInputs(side: 'long' | 'short'): void {
  page.syncBotInputs(side);
}

/** blur half (:3516-3522) — JSON edits flow back into the inputs. */
function onBotBlur(side: 'long' | 'short'): void {
  page.readBotInputsFromJson(side);
}

function sideSummary(side: 'long' | 'short'): string {
  const error = side === 'long' ? longError.value : shortError.value;
  if (!error) return '';
  let message = t('v7run.fieldIsInvalid', { label: t(side === 'long' ? 'v7run.longConfigJsonLabel' : 'v7run.shortConfigJsonLabel') });
  if (error.line != null && error.column != null) {
    message += t('v7run.atLineColumn', { line: error.line, column: error.column });
  }
  return message;
}

/** revealJsonFieldError (:1543-1548). */
function reveal(side: 'long' | 'short'): void {
  const error = side === 'long' ? longError.value : shortError.value;
  const el = document.getElementById('f-' + side + '-json') as HTMLTextAreaElement | null;
  if (!el || !error) return;
  const detail = getJsonLineDetail(el.value || '', error.line, error.column);
  el.focus();
  if (detail) {
    try {
      el.setSelectionRange(detail.selectionStart, detail.selectionEnd);
    } catch {
      /* legacy ignored selection failures */
    }
  }
}
</script>

<template>
  <div class="section-title section-title-with-control">
    <span>{{ t('v7run.botConfiguration') }}</span>
    <div class="form-group section-title-control" v-show="page.fieldVisible('strategyKind')">
      <label><span data-tip="PB8 strategy schema reported by the installed runtime.">strategy_kind</span></label>
      <select id="f-strategy-kind" v-model="state.strategyKind" @change="page.changeStrategyKind(state.strategyKind)">
        <option v-for="kind in strategyOptions" :key="kind.value" :value="kind.value">{{ kind.value }}</option>
      </select>
    </div>
  </div>
  <div class="form-row cols-4">
    <FieldNumber id="f-long-twe" v-model="state.longTwe" :label="t('v7run.longTwe')" min="0" max="100" step="0.05" @change="onBotInputs('long')" />
    <FieldNumber id="f-long-npos" v-model="state.longNpos" :label="t('v7run.longNpositions')" min="0" max="100" step="1" @change="onBotInputs('long')" />
    <FieldNumber id="f-short-twe" v-model="state.shortTwe" :label="t('v7run.shortTwe')" min="0" max="100" step="0.05" @change="onBotInputs('short')" />
    <FieldNumber id="f-short-npos" v-model="state.shortNpos" :label="t('v7run.shortNpositions')" min="0" max="100" step="1" @change="onBotInputs('short')" />
  </div>
  <div class="form-row cols-2">
    <div class="form-group">
      <label id="lbl-long-json">{{ t('v7run.longConfigJson') }}<template v-if="page.paramLegendLong.value"> &#x25A0; <span style="color: var(--warning)">{{ t('v7run.paramNeutralized') }}</span> / &#x25A0; <span style="color: var(--danger)">{{ t('v7run.paramReview') }}</span></template></label>
      <div class="bot-json-highlight-wrap">
        <pre v-if="longError" class="bot-json-highlight-pre" aria-hidden="true"><span
          v-for="(line, index) in longLines"
          :key="index"
          class="bot-json-line"
          :class="{ 'bot-json-error-line': line.error, 'bot-json-neutralized': line.status === 'neutralized', 'bot-json-pb-default': line.status === 'pb_default' }"
        >{{ line.text }}
</span></pre>
        <textarea
          id="f-long-json"
          v-model="state.longJson"
          class="json-editor"
          :class="{ 'json-invalid': !!longError }"
          rows="24"
          @blur="onBotBlur('long')"
        ></textarea>
      </div>
      <div v-if="longError" class="field-status field-status-inline error" aria-live="polite">
        <div class="field-status-main">{{ sideSummary('long') }}</div>
        <div v-if="longError.message" class="field-status-meta">{{ longError.message }}</div>
        <div v-if="longError.line != null" class="field-status-actions">
          <button type="button" class="field-status-btn" @click="reveal('long')">{{ t('v7run.revealLineInEditor') }}</button>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label id="lbl-short-json">{{ t('v7run.shortConfigJson') }}<template v-if="page.paramLegendShort.value"> &#x25A0; <span style="color: var(--warning)">{{ t('v7run.paramNeutralized') }}</span> / &#x25A0; <span style="color: var(--danger)">{{ t('v7run.paramReview') }}</span></template></label>
      <div class="bot-json-highlight-wrap">
        <pre v-if="shortError" class="bot-json-highlight-pre" aria-hidden="true"><span
          v-for="(line, index) in shortLines"
          :key="index"
          class="bot-json-line"
          :class="{ 'bot-json-error-line': line.error, 'bot-json-neutralized': line.status === 'neutralized', 'bot-json-pb-default': line.status === 'pb_default' }"
        >{{ line.text }}
</span></pre>
        <textarea
          id="f-short-json"
          v-model="state.shortJson"
          class="json-editor"
          :class="{ 'json-invalid': !!shortError }"
          rows="24"
          @blur="onBotBlur('short')"
        ></textarea>
      </div>
      <div v-if="shortError" class="field-status field-status-inline error" aria-live="polite">
        <div class="field-status-main">{{ sideSummary('short') }}</div>
        <div v-if="shortError.message" class="field-status-meta">{{ shortError.message }}</div>
        <div v-if="shortError.line != null" class="field-status-actions">
          <button type="button" class="field-status-btn" @click="reveal('short')">{{ t('v7run.revealLineInEditor') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
