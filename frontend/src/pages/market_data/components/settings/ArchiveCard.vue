<script setup lang="ts">
/*
 * l2Book archive card — legacy #settings-hyperliquid-archive
 * (market_data_main.html:3063-3075).
 */
import { useI18n } from 'vue-i18n';
import { SETTINGS_FIELD_IDS, type SettingsFieldValues } from '../../lib/settingsFields';

defineProps<{
  fields: SettingsFieldValues;
}>();

const { t } = useI18n();
const IDS = SETTINGS_FIELD_IDS;
</script>

<template>
  <article class="panel-card" id="settings-hyperliquid-archive" data-settings-subsection="aws">
    <div class="eyebrow">{{ t('market.l2bookArchiveNas') }}</div>
    <div class="settings-grid settings-grid-wide">
      <label class="settings-field">
        <span class="field-label">{{ t('market.archiveEnabled') }}</span>
        <span class="settings-toggle">
          <input :id="IDS.archiveEnabled" v-model="fields.archiveEnabled" type="checkbox">
          <span>{{ t('market.moveBuiltSourceFiles') }}</span>
        </span>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.archiveDirectory') }}</span>
        <input :id="IDS.archiveDir" v-model="fields.archiveDir" type="text" placeholder="/mnt/nas/ohlcv/l2books">
      </label>
    </div>
  </article>
</template>
