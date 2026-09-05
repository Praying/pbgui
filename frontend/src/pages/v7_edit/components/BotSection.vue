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
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
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

/** Highlight line → full utility tint set (the former .bot-json-error-line/
 *  .bot-json-neutralized/.bot-json-pb-default rules). Error keeps the CSS
 *  cascade precedence it had — it wins over a status tint on the same line. */
function botLineClass(line: { error: boolean; status: string | null }): string {
  if (line.error) return 'v7e-line-error';
  if (line.status === 'neutralized') return 'rounded-[2px] bg-[color-mix(in_srgb,var(--warning)_16%,transparent)]';
  if (line.status === 'pb_default') return 'rounded-[2px] bg-[color-mix(in_srgb,var(--danger)_16%,transparent)]';
  return '';
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
  <section class="edit-section-card overflow-hidden rounded-xl border border-border-default bg-panel">
    <header class="edit-section-card__header flex items-center gap-3 border-b border-border-default bg-elevated px-5 py-2.5 max-[700px]:flex-col max-[700px]:items-stretch max-[700px]:gap-2">
      <h3 class="text-md font-bold tracking-[0.01em] text-primary">{{ t('v7run.botConfiguration') }}</h3>
      <div class="form-group ml-auto w-[min(280px,45%)] max-[700px]:ml-0 max-[700px]:w-full" v-show="page.fieldVisible('strategyKind')">
        <label id="f-strategy-kind-label"><span :data-tip="t('v7run.tip.strategyKind')">strategy_kind</span></label>
        <SelectRoot v-model="state.strategyKind" @update:model-value="page.changeStrategyKind(state.strategyKind)">
          <SelectTrigger id="f-strategy-kind" aria-labelledby="f-strategy-kind-label">
            <span>{{ state.strategyKind }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="kind in strategyOptions" :key="kind.value" :value="kind.value">{{ kind.value }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
    </header>
    <div class="edit-section-body p-5">
  <div class="form-row cols-4">
    <FieldNumber id="f-long-twe" v-model="state.longTwe" :label="t('v7run.longTwe')" min="0" max="100" step="0.05" @change="onBotInputs('long')" />
    <FieldNumber id="f-long-npos" v-model="state.longNpos" :label="t('v7run.longNpositions')" min="0" max="100" step="1" @change="onBotInputs('long')" />
    <FieldNumber id="f-short-twe" v-model="state.shortTwe" :label="t('v7run.shortTwe')" min="0" max="100" step="0.05" @change="onBotInputs('short')" />
    <FieldNumber id="f-short-npos" v-model="state.shortNpos" :label="t('v7run.shortNpositions')" min="0" max="100" step="1" @change="onBotInputs('short')" />
  </div>
  <div class="form-row cols-2">
    <div class="form-group">
      <label id="lbl-long-json">{{ t('v7run.longConfigJson') }}<template v-if="page.paramLegendLong.value"> &#x25A0; <span class="text-warning">{{ t('v7run.paramNeutralized') }}</span> / &#x25A0; <span style="color: var(--danger)">{{ t('v7run.paramReview') }}</span></template></label>
      <div class="relative w-full min-w-0">
        <pre v-if="longError" class="pointer-events-none absolute inset-0 m-0 overflow-hidden border border-transparent bg-transparent p-2 font-mono text-xs leading-[1.4] text-transparent whitespace-pre-wrap break-words z-0" aria-hidden="true"><span
          v-for="(line, index) in longLines"
          :key="index"
          class="block"
          :class="botLineClass(line)"
        >{{ line.text }}
</span></pre>
        <!-- ui-migration: Textarea + the legacy json-editor class — the
             page-global un-layered rules (.json-editor/.form-group textarea)
             still own the geometry (the shared CoinOverridesPanel renders the
             same classes), and the highlight overlay aligns to that cascade. -->
        <Textarea
          id="f-long-json"
          v-model="state.longJson"
          class="json-editor relative z-[1] block w-full min-w-0"
          :class="{ 'json-invalid': !!longError }"
          rows="24"
          @blur="onBotBlur('long')"
        />
      </div>
      <div v-if="longError" class="mt-1 block rounded-sm border border-danger/35 bg-danger-deep/35 px-2.5 py-1.5 text-sm leading-[1.35] text-danger" aria-live="polite">
        <div class="font-semibold">{{ sideSummary('long') }}</div>
        <div v-if="longError.message" class="mt-0.5 text-danger-soft">{{ longError.message }}</div>
        <div v-if="longError.line != null" class="mt-2">
          <Button type="button" variant="danger" size="sm" @click="reveal('long')">{{ t('v7run.revealLineInEditor') }}</Button>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label id="lbl-short-json">{{ t('v7run.shortConfigJson') }}<template v-if="page.paramLegendShort.value"> &#x25A0; <span class="text-warning">{{ t('v7run.paramNeutralized') }}</span> / &#x25A0; <span style="color: var(--danger)">{{ t('v7run.paramReview') }}</span></template></label>
      <div class="relative w-full min-w-0">
        <pre v-if="shortError" class="pointer-events-none absolute inset-0 m-0 overflow-hidden border border-transparent bg-transparent p-2 font-mono text-xs leading-[1.4] text-transparent whitespace-pre-wrap break-words z-0" aria-hidden="true"><span
          v-for="(line, index) in shortLines"
          :key="index"
          class="block"
          :class="botLineClass(line)"
        >{{ line.text }}
</span></pre>
        <Textarea
          id="f-short-json"
          v-model="state.shortJson"
          class="json-editor relative z-[1] block w-full min-w-0"
          :class="{ 'json-invalid': !!shortError }"
          rows="24"
          @blur="onBotBlur('short')"
        />
      </div>
      <div v-if="shortError" class="mt-1 block rounded-sm border border-danger/35 bg-danger-deep/35 px-2.5 py-1.5 text-sm leading-[1.35] text-danger" aria-live="polite">
        <div class="font-semibold">{{ sideSummary('short') }}</div>
        <div v-if="shortError.message" class="mt-0.5 text-danger-soft">{{ shortError.message }}</div>
        <div v-if="shortError.line != null" class="mt-2">
          <Button type="button" variant="danger" size="sm" @click="reveal('short')">{{ t('v7run.revealLineInEditor') }}</Button>
        </div>
      </div>
    </div>
  </div>
    </div>
  </section>
</template>
