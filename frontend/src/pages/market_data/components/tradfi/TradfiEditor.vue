<script setup lang="ts">
/*
 * The mapping editor — legacy .tradfi-editor-shell (market_data_main.html
 * :3168-3217): the eight fields + invert toggle, the mode note (:3172,
 * text set at :6427/:6461-6463), read-only xyz while editing a row
 * (:6458) and the cancel/save actions (:9725-9729).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
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
  <div class="tradfi-editor-shell" :hidden="!map.editorOpen.value || undefined">
    <div class="panel-head">
      <div>
        <h3>{{ t('market.mappingEditor') }}</h3>
        <p class="note" id="tradfi-editor-mode">{{ modeText }}</p>
      </div>
    </div>
    <div class="tradfi-editor-grid">
      <label class="settings-field">
        <span class="field-label">{{ t('market.xyzCoin') }}</span>
        <input
          id="tradfi-editor-xyz-coin"
          v-model="editor.xyzCoin"
          type="text"
          placeholder="e.g. TSLA"
          :readonly="map.xyzReadOnly.value"
        >
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.canonicalType') }}</span>
        <select id="tradfi-editor-canonical-type" v-model="editor.canonicalType">
          <option v-for="value in map.optionLists.value.canonicalTypes" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.status') }}</span>
        <select id="tradfi-editor-status" v-model="editor.status">
          <option v-for="value in map.optionLists.value.statuses" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
      <label class="settings-field tradfi-editor-span-2">
        <span class="field-label">{{ t('market.description') }}</span>
        <input
          id="tradfi-editor-description"
          v-model="editor.description"
          type="text"
          placeholder="Human-readable symbol name"
        >
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.tiingoEquityTicker') }}</span>
        <input
          id="tradfi-editor-tiingo-ticker"
          v-model="editor.tiingoTicker"
          type="text"
          placeholder="e.g. TSLA"
        >
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.tiingoFxTicker') }}</span>
        <input
          id="tradfi-editor-tiingo-fx-ticker"
          v-model="editor.tiingoFxTicker"
          type="text"
          placeholder="e.g. XAUUSD"
        >
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.startDate') }}</span>
        <input
          id="tradfi-editor-tiingo-start-date"
          v-model="editor.tiingoStartDate"
          type="text"
          placeholder="YYYY-MM-DD"
        >
      </label>
      <label class="settings-field tradfi-editor-full">
        <span class="field-label">{{ t('market.note') }}</span>
        <input id="tradfi-editor-note" v-model="editor.note" type="text" placeholder="Optional note">
      </label>
    </div>
    <label class="settings-toggle">
      <input id="tradfi-editor-tiingo-fx-invert" v-model="editor.fxInvert" type="checkbox">
      <span>{{ t('market.invertFxQuote') }}</span>
    </label>
    <div class="tradfi-editor-actions">
      <button class="btn secondary" id="btn-tradfi-cancel" type="button" @click="map.cancelEditor()">
        {{ t('common.cancel') }}
      </button>
      <button class="btn primary" id="btn-tradfi-save" type="button" @click="map.saveMapping()">
        {{ t('common.save') }}
      </button>
    </div>
  </div>
</template>
