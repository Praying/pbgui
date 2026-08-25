<script setup lang="ts">
/*
 * Coin refresh fields — legacy #settings-primary-card
 * (market_data_main.html:2982-3005). Inputs keep the legacy ids verbatim;
 * edits bind straight into the store's reactive field object (the store owns
 * dirty tracking reactively, so no per-input events are needed).
 */
import { useI18n } from 'vue-i18n';
import { Input } from '@/shared/components/ui/input';
import {
  fieldLabelClass,
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
        <Input :id="IDS.intervalSeconds" :model-value="fields.intervalSeconds" @update:model-value="fields.intervalSeconds = String($event ?? '')" type="number" min="60" step="30" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.pauseBetweenCoinsSeconds') }}</span>
        <Input :id="IDS.coinPauseSeconds" :model-value="fields.coinPauseSeconds" @update:model-value="fields.coinPauseSeconds = String($event ?? '')" type="number" min="0" max="10" step="0.1" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.apiTimeoutPerCoinSeconds') }}</span>
        <Input :id="IDS.apiTimeoutSeconds" :model-value="fields.apiTimeoutSeconds" @update:model-value="fields.apiTimeoutSeconds = String($event ?? '')" type="number" min="10" max="120" step="5" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.minLookbackDays') }}</span>
        <Input :id="IDS.minLookbackDays" :model-value="fields.minLookbackDays" @update:model-value="fields.minLookbackDays = String($event ?? '')" type="number" min="1" max="10" step="1" />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.maxLookbackDays') }}</span>
        <Input :id="IDS.maxLookbackDays" :model-value="fields.maxLookbackDays" @update:model-value="fields.maxLookbackDays = String($event ?? '')" type="number" min="1" max="30" step="1" />
      </label>
    </div>
  </article>
</template>
