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
      <div class="panel-actions tiingo-actions w-full sm:w-auto sm:justify-end">
        <div
          class="tiingo-resource-actions inline-flex w-full items-center gap-1 rounded-lg border border-border-subtle bg-surface-deep/55 p-1 sm:w-auto"
          role="group"
          :aria-label="t('market.tiingoResources')"
        >
          <!-- Direct links to Tiingo's token and usage pages (v2.02.5). -->
          <Button
            as="a"
            size="sm"
            variant="secondary"
            class="min-w-0 flex-1 sm:flex-none"
            href="https://www.tiingo.com/account/api/token"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('market.tiingoGetApiToken') }}</Button>
          <Button
            as="a"
            size="sm"
            variant="secondary"
            class="min-w-0 flex-1 sm:flex-none"
            href="https://www.tiingo.com/account/api/usage"
            target="_blank"
            rel="noopener noreferrer"
          >{{ t('market.tiingoOfficialUsage') }}</Button>
        </div>
        <Button
          variant="primary"
          size="sm"
          class="w-full sm:w-auto"
          id="btn-test-tiingo"
          type="button"
          @click="tiingo.test()"
        >{{ t('market.testTiingo') }}</Button>
      </div>
    </div>
    <div :class="calloutClass(false)" id="settings-tiingo-credential-status">
      {{ tiingo.configured.value ? t('market.tiingoActiveProfile') : t('market.tiingoNoProfile') }}
    </div>
    <div class="settings-tiingo-token-row mt-3 flex flex-wrap items-end gap-3">
      <label :class="[settingsFieldClass, 'min-w-[240px] max-w-[640px] flex-1']">
        <span :class="fieldLabelClass">{{ t('market.newTiingoApiToken') }}</span>
        <TokenRevealField :tiingo="tiingo" />
      </label>
      <Button
        class="flex-none"
        variant="primary"
        id="btn-save-tiingo-token"
        type="button"
        :disabled="tiingo.saveLoading.value"
        @click="tiingo.saveToken()"
      >{{ t('market.saveTokenToVault') }}</Button>
    </div>
    <div :class="[noteClass, 'mt-2']">{{ t('market.tiingoEyeNote') }}</div>
    <div id="settings-tiingo-usage" :class="[stackClass, 'mt-3']">
      <UsagePanel :usage="tiingo.usage.value" :configured="tiingo.usageConfigured.value" />
    </div>
  </article>
</template>
