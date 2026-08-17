<script setup lang="ts">
/**
 * Bot configuration section — v7_edit.html:1084-1124: strategy_kind select
 * (v8), Long/Short TWE + n_positions inputs, and the full side-config JSON
 * textareas with the param-status legend (:2228-2238).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import FieldNumber from './FieldNumber.vue';
import { useEditPageContext } from '../composables/useEditPage';

const { t } = useI18n();
const page = useEditPageContext();
const state = page.state;

const strategyOptions = computed(() =>
  page.strategyKinds.value.map((kind) => ({ value: kind }))
);

const longLabel = computed(() =>
  t('v7run.longConfigJson') + (page.paramLegendLong.value ? ' ■ ' + t('v7run.paramNeutralized') + ' / ■ ' + t('v7run.paramReview') : '')
);
const shortLabel = computed(() =>
  t('v7run.shortConfigJson') + (page.paramLegendShort.value ? ' ■ ' + t('v7run.paramNeutralized') + ' / ■ ' + t('v7run.paramReview') : '')
);
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
    <FieldNumber id="f-long-twe" v-model="state.longTwe" :label="t('v7run.longTwe')" min="0" max="100" step="0.05" />
    <FieldNumber id="f-long-npos" v-model="state.longNpos" :label="t('v7run.longNpositions')" min="0" max="100" step="1" />
    <FieldNumber id="f-short-twe" v-model="state.shortTwe" :label="t('v7run.shortTwe')" min="0" max="100" step="0.05" />
    <FieldNumber id="f-short-npos" v-model="state.shortNpos" :label="t('v7run.shortNpositions')" min="0" max="100" step="1" />
  </div>
  <div class="form-row cols-2">
    <div class="form-group">
      <label id="lbl-long-json">{{ longLabel }}</label>
      <textarea id="f-long-json" v-model="state.longJson" class="json-editor" rows="24"></textarea>
      <div id="f-long-json-status" class="field-status field-status-inline" aria-live="polite"></div>
    </div>
    <div class="form-group">
      <label id="lbl-short-json">{{ shortLabel }}</label>
      <textarea id="f-short-json" v-model="state.shortJson" class="json-editor" rows="24"></textarea>
      <div id="f-short-json-status" class="field-status field-status-inline" aria-live="polite"></div>
    </div>
  </div>
</template>
