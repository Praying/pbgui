<script setup lang="ts">
/*
 * l2Book archive card — legacy #settings-hyperliquid-archive
 * (market_data_main.html:3063-3075).
 */
import { useI18n } from 'vue-i18n';
import {
  fieldLabelClass,
  inputClass,
  panelCardClass,
  settingsFieldClass,
  settingsGridWideClass,
} from '../../lib/uiClasses';
import { SETTINGS_FIELD_IDS, type SettingsFieldValues } from '../../lib/settingsFields';

defineProps<{
  fields: SettingsFieldValues;
}>();

const { t } = useI18n();
const IDS = SETTINGS_FIELD_IDS;
</script>

<template>
  <article :class="panelCardClass" id="settings-hyperliquid-archive" data-settings-subsection="aws">
    <div class="eyebrow">{{ t('market.l2bookArchiveNas') }}</div>
    <div :class="settingsGridWideClass">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.archiveEnabled') }}</span>
        <span class="settings-toggle flex min-h-8 items-center gap-2 text-base text-primary">
          <input class="h-4 w-4 m-0" :id="IDS.archiveEnabled" v-model="fields.archiveEnabled" type="checkbox">
          <span>{{ t('market.moveBuiltSourceFiles') }}</span>
        </span>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.archiveDirectory') }}</span>
        <input :id="IDS.archiveDir" :class="inputClass" v-model="fields.archiveDir" type="text" placeholder="/mnt/nas/ohlcv/l2books">
      </label>
    </div>
  </article>
</template>
