<script setup lang="ts">
/*
 * Tiingo card — legacy #settings-hyperliquid-tiingo (market_data_main.html
 * :3077-3103) with the Test/Save buttons (:3083, :3098), the credential
 * callout (:7390-7395) and the usage host (:3102 → UsagePanel).
 */
import { useI18n } from 'vue-i18n';
import type { UseTiingo } from '../../composables/useTiingo';
import TokenRevealField from './TokenRevealField.vue';
import UsagePanel from './UsagePanel.vue';

defineProps<{
  tiingo: UseTiingo;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="panel-card" id="settings-hyperliquid-tiingo" data-settings-subsection="tradfi">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.tiingoSettingsStockPerp') }}</div>
      </div>
      <div class="panel-actions">
        <button
          class="btn secondary"
          id="btn-test-tiingo"
          type="button"
          @click="tiingo.test()"
        >{{ t('market.testTiingo') }}</button>
      </div>
    </div>
    <div class="callout" id="settings-tiingo-credential-status">
      {{ tiingo.configured.value ? t('market.tiingoActiveProfile') : t('market.tiingoNoProfile') }}
    </div>
    <div class="settings-grid settings-grid-wide">
      <label class="settings-field">
        <span class="field-label">{{ t('market.newTiingoApiToken') }}</span>
        <TokenRevealField :tiingo="tiingo" />
      </label>
      <div class="settings-field" style="align-self: end;">
        <button
          class="btn primary"
          id="btn-save-tiingo-token"
          type="button"
          :disabled="tiingo.saveLoading.value"
          @click="tiingo.saveToken()"
        >{{ t('market.saveTokenToVault') }}</button>
      </div>
    </div>
    <div class="note">{{ t('market.tiingoEyeNote') }}</div>
    <div id="settings-tiingo-usage" class="stack">
      <UsagePanel :usage="tiingo.usage.value" :configured="tiingo.usageConfigured.value" />
    </div>
  </article>
</template>
