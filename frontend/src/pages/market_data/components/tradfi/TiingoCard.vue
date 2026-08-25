<script setup lang="ts">
/*
 * Tiingo card — legacy #settings-hyperliquid-tiingo (market_data_main.html
 * :3077-3103) with the Test/Save buttons (:3083, :3098), the credential
 * callout (:7390-7395) and the usage host (:3102 → UsagePanel).
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import {
  calloutClass,
  fieldLabelClass,
  noteClass,
  panelCardClass,
  panelHeadClass,
  settingsFieldClass,
  settingsGridWideClass,
  stackClass,
} from '../../lib/uiClasses';
import type { UseTiingo } from '../../composables/useTiingo';
import TokenRevealField from './TokenRevealField.vue';
import UsagePanel from './UsagePanel.vue';

defineProps<{
  tiingo: UseTiingo;
}>();

const { t } = useI18n();
</script>

<template>
  <article :class="panelCardClass" id="settings-hyperliquid-tiingo" data-settings-subsection="tradfi">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.tiingoSettingsStockPerp') }}</div>
      </div>
      <div class="panel-actions">
        <Button
          variant="info"
          id="btn-test-tiingo"
          type="button"
          @click="tiingo.test()"
        >{{ t('market.testTiingo') }}</Button>
      </div>
    </div>
    <div :class="calloutClass(false)" id="settings-tiingo-credential-status">
      {{ tiingo.configured.value ? t('market.tiingoActiveProfile') : t('market.tiingoNoProfile') }}
    </div>
    <div :class="settingsGridWideClass">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.newTiingoApiToken') }}</span>
        <TokenRevealField :tiingo="tiingo" />
      </label>
      <div :class="[settingsFieldClass, 'self-end']">
        <Button
          variant="primary"
          id="btn-save-tiingo-token"
          type="button"
          :disabled="tiingo.saveLoading.value"
          @click="tiingo.saveToken()"
        >{{ t('market.saveTokenToVault') }}</Button>
      </div>
    </div>
    <div :class="noteClass">{{ t('market.tiingoEyeNote') }}</div>
    <div id="settings-tiingo-usage" :class="stackClass">
      <UsagePanel :usage="tiingo.usage.value" :configured="tiingo.usageConfigured.value" />
    </div>
  </article>
</template>
