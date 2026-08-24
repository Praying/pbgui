<script setup lang="ts">
/*
 * Coin refresh fields — legacy #settings-primary-card
 * (market_data_main.html:2982-3005). Inputs keep the legacy ids verbatim;
 * edits bind straight into the store's reactive field object (the store owns
 * dirty tracking reactively, so no per-input events are needed).
 */
import { useI18n } from 'vue-i18n';
import {
  fieldLabelClass,
  inputClass,
  panelCardClass,
  settingsFieldClass,
  settingsGridClass,
} from '../../lib/uiClasses';
import { SETTINGS_FIELD_IDS, type SettingsFieldValues } from '../../lib/settingsFields';

defineProps<{
  fields: SettingsFieldValues;
}>();

const { t } = useI18n();
const IDS = SETTINGS_FIELD_IDS;
</script>

<template>
  <article :class="panelCardClass" id="settings-primary-card" data-settings-subsection="normal">
    <div :class="settingsGridClass">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.cycleIntervalSeconds') }}</span>
        <input :id="IDS.intervalSeconds" :class="inputClass" :value="fields.intervalSeconds" type="number" min="60" step="30" @input="fields.intervalSeconds = ($event.target as HTMLInputElement).value">
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.pauseBetweenCoinsSeconds') }}</span>
        <input :id="IDS.coinPauseSeconds" :class="inputClass" :value="fields.coinPauseSeconds" type="number" min="0" max="10" step="0.1" @input="fields.coinPauseSeconds = ($event.target as HTMLInputElement).value">
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.apiTimeoutPerCoinSeconds') }}</span>
        <input :id="IDS.apiTimeoutSeconds" :class="inputClass" :value="fields.apiTimeoutSeconds" type="number" min="10" max="120" step="5" @input="fields.apiTimeoutSeconds = ($event.target as HTMLInputElement).value">
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.minLookbackDays') }}</span>
        <input :id="IDS.minLookbackDays" :class="inputClass" :value="fields.minLookbackDays" type="number" min="1" max="10" step="1" @input="fields.minLookbackDays = ($event.target as HTMLInputElement).value">
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.maxLookbackDays') }}</span>
        <input :id="IDS.maxLookbackDays" :class="inputClass" :value="fields.maxLookbackDays" type="number" min="1" max="30" step="1" @input="fields.maxLookbackDays = ($event.target as HTMLInputElement).value">
      </label>
    </div>
  </article>
</template>
