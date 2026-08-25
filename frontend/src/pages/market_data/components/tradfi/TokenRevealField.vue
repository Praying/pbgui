<script setup lang="ts">
/*
 * The token reveal field — the .pw-wrap slice of #settings-hyperliquid-tiingo
 * (market_data_main.html:3092-3095). The eye drives the controller's
 * toggleTiingoTokenVisible (:5598-5640); glyphs :5606/:5612/:5595.
 */
import { useI18n } from 'vue-i18n';
import { PhEye, PhEyeSlash } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import type { UseTiingo } from '../../composables/useTiingo';

defineProps<{
  tiingo: UseTiingo;
}>();

const { t } = useI18n();

/** The former .pw-wrap / .pw-eye-btn rules (36px eye gutter + overlay). */
const pwWrapClass = 'pw-wrap relative flex w-full items-center';
const pwEyeBtnClass =
  'pw-eye-btn absolute right-2 cursor-pointer border-none bg-transparent p-0 text-md leading-none text-muted select-none hover:text-secondary';
</script>

<template>
  <div :class="pwWrapClass">
    <Input
      id="settings-tiingo-token"
      class="pr-9"
      v-model="tiingo.tokenValue.value"
      :type="tiingo.visible.value ? 'text' : 'password'"
      autocomplete="new-password"
      autocapitalize="off"
      spellcheck="false"
      :placeholder="tiingo.configured.value ? t('market.storedInVault') : t('market.enterTiingoToken')"
      :disabled="tiingo.inputDisabled.value"
    />
    <Button
      type="button"
      variant="ghost"
      size="sm"
      :class="pwEyeBtnClass"
      :aria-label="t('market.showHideTiingoToken')"
      :title="t('market.showHideTiingoToken')"
      :disabled="tiingo.revealLoading.value"
      @click="tiingo.toggleVisible()"
    ><PbIcon :icon="tiingo.visible.value ? PhEyeSlash : PhEye" /></Button>
  </div>
</template>
