<script setup lang="ts">
/*
 * The token reveal field — the .pw-wrap slice of #settings-hyperliquid-tiingo
 * (market_data_main.html:3092-3095). The eye drives the controller's
 * toggleTiingoTokenVisible (:5598-5640); glyphs :5606/:5612/:5595.
 */
import { useI18n } from 'vue-i18n';
import { PhEye, PhEyeSlash } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import type { UseTiingo } from '../../composables/useTiingo';

defineProps<{
  tiingo: UseTiingo;
}>();

const { t } = useI18n();

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
      :aria-label="t('market.showHideTiingoToken')"
      :title="t('market.showHideTiingoToken')"
      :disabled="tiingo.revealLoading.value"
      @click="tiingo.toggleVisible()"
    ><PbIcon :icon="tiingo.visible.value ? PhEyeSlash : PhEye" /></button>
  </div>
</template>
