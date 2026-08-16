<script setup lang="ts">
/*
 * The token reveal field — the .pw-wrap slice of #settings-hyperliquid-tiingo
 * (market_data_main.html:3092-3095). The eye drives the controller's
 * toggleTiingoTokenVisible (:5598-5640); glyphs :5606/:5612/:5595.
 */
import { useI18n } from 'vue-i18n';
import type { UseTiingo } from '../../composables/useTiingo';

defineProps<{
  tiingo: UseTiingo;
}>();

const { t } = useI18n();

/** Legacy eye glyphs (:5595, :5606, :5612-5613). */
const EYE_OPEN = '👁'; // 👁
const EYE_CLOSED = '🙈'; // 🙈
</script>

<template>
  <div class="pw-wrap">
    <input
      id="settings-tiingo-token"
      v-model="tiingo.tokenValue.value"
      :type="tiingo.visible.value ? 'text' : 'password'"
      autocomplete="new-password"
      autocapitalize="off"
      spellcheck="false"
      :placeholder="tiingo.configured.value ? t('market.storedInVault') : t('market.enterTiingoToken')"
      :disabled="tiingo.inputDisabled.value"
    >
    <button
      type="button"
      class="pw-eye-btn"
      tabindex="-1"
      :title="t('market.showHideTiingoToken')"
      :disabled="tiingo.revealLoading.value"
      @click="tiingo.toggleVisible()"
    >{{ tiingo.visible.value ? EYE_CLOSED : EYE_OPEN }}</button>
  </div>
</template>
