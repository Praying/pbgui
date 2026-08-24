<script setup lang="ts">
/*
 * The mapping editor — legacy .tradfi-editor-shell (market_data_main.html
 * :3168-3217): the eight fields + invert toggle, the mode note (:3172,
 * text set at :6427/:6461-6463), read-only xyz while editing a row
 * (:6458) and the cancel/save actions (:9725-9729).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  btnPrimaryClass,
  btnSecondaryClass,
  fieldLabelClass,
  inputClass,
  noteClass,
  panelHeadClass,
  settingsFieldClass,
  settingsToggleClass,
} from '../../lib/uiClasses';
import type { UseTradfiMap } from '../../composables/useTradfiMap';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();

const modeText = computed<string>(() => {
  const mode = props.map.editorMode.value;
  if (mode.kind === 'saved') return t('market.editingSavedMapping', { coin: mode.coin });
  if (mode.kind === 'json') return t('market.editingFromMappingJson', { coin: mode.coin });
  return t('market.selectRowToEdit');
});

const editor = props.map.editor; // reactive field object — binds directly
</script>

<template>
  <div class="tradfi-editor-shell mt-3 grid gap-3 border-t border-secondary/12 pt-3" :hidden="!map.editorOpen.value || undefined">
    <div :class="panelHeadClass">
      <div>
        <h3>{{ t('market.mappingEditor') }}</h3>
        <p :class="noteClass" id="tradfi-editor-mode">{{ modeText }}</p>
      </div>
    </div>
    <div class="tradfi-editor-grid grid items-start gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.xyzCoin') }}</span>
        <input
          id="tradfi-editor-xyz-coin"
          :class="inputClass"
          v-model="editor.xyzCoin"
          type="text"
          placeholder="e.g. TSLA"
          :readonly="map.xyzReadOnly.value"
        >
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.canonicalType') }}</span>
        <select id="tradfi-editor-canonical-type" :class="inputClass" v-model="editor.canonicalType">
          <option v-for="value in map.optionLists.value.canonicalTypes" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.status') }}</span>
        <select id="tradfi-editor-status" :class="inputClass" v-model="editor.status">
          <option v-for="value in map.optionLists.value.statuses" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
      <label :class="[settingsFieldClass, 'tradfi-editor-span-2 col-span-2']">
        <span :class="fieldLabelClass">{{ t('market.description') }}</span>
        <input
          id="tradfi-editor-description"
          :class="inputClass"
          v-model="editor.description"
          type="text"
          placeholder="Human-readable symbol name"
        >
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.tiingoEquityTicker') }}</span>
        <input
          id="tradfi-editor-tiingo-ticker"
          :class="inputClass"
          v-model="editor.tiingoTicker"
          type="text"
          placeholder="e.g. TSLA"
        >
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.tiingoFxTicker') }}</span>
        <input
          id="tradfi-editor-tiingo-fx-ticker"
          :class="inputClass"
          v-model="editor.tiingoFxTicker"
          type="text"
          placeholder="e.g. XAUUSD"
        >
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.startDate') }}</span>
        <input
          id="tradfi-editor-tiingo-start-date"
          :class="inputClass"
          v-model="editor.tiingoStartDate"
          type="text"
          placeholder="YYYY-MM-DD"
        >
      </label>
      <label :class="[settingsFieldClass, 'tradfi-editor-full col-span-full']">
        <span :class="fieldLabelClass">{{ t('market.note') }}</span>
        <input id="tradfi-editor-note" :class="inputClass" v-model="editor.note" type="text" placeholder="Optional note">
      </label>
    </div>
    <label :class="settingsToggleClass">
      <input class="h-4 w-4 m-0" id="tradfi-editor-tiingo-fx-invert" v-model="editor.fxInvert" type="checkbox">
      <span>{{ t('market.invertFxQuote') }}</span>
    </label>
    <div class="tradfi-editor-actions flex flex-wrap gap-2">
      <button :class="btnSecondaryClass" id="btn-tradfi-cancel" type="button" @click="map.cancelEditor()">
        {{ t('common.cancel') }}
      </button>
      <button :class="btnPrimaryClass" id="btn-tradfi-save" type="button" @click="map.saveMapping()">
        {{ t('common.save') }}
      </button>
    </div>
  </div>
</template>
