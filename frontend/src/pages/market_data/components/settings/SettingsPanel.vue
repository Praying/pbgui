<script setup lang="ts">
/*
 * Settings panel — legacy #settings-panel body (market_data_main.html:2979+):
 * settings-shell > settings-layout with the card order of
 * positionSettingsCards (:6121-6144 — a no-op in legacy since the static DOM
 * order already satisfies both branches; the port renders the same visible
 * order directly), subsection class fan-out (:6169-6172) and the subsection
 * scroll reset (:6183-6184).
 *
 * The tiingo + tradfi-map cards (:3077-3222) are M-data-4 scope: they stay
 * as data-settings-subsection="tradfi" placeholders so the subsection nav is
 * fully live now.
 */
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { SettingsController } from '../../composables/useSettings';
import ArchiveCard from './ArchiveCard.vue';
import AwsCard from './AwsCard.vue';
import CoinPicker from './CoinPicker.vue';
import FieldsForm from './FieldsForm.vue';

const props = defineProps<{
  store: SettingsController;
}>();

const { t } = useI18n();

/* setActiveSettingsSubsection tail (:6183-6184) — reset the panel scroll. */
watch(
  () => props.store.activeSubsection.value,
  () => {
    const panel = document.getElementById('settings-panel');
    if (panel) panel.scrollTop = 0;
  }
);
</script>

<template>
  <article class="settings-shell">
    <div class="settings-layout">
      <template v-if="store.isHyperliquid.value">
        <FieldsForm
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'normal' }"
        />
        <CoinPicker
          :store="store"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'normal' }"
        />
        <AwsCard
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'aws' }"
        />
        <ArchiveCard
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'aws' }"
        />
        <article
          class="panel-card panel-placeholder"
          id="settings-hyperliquid-tiingo"
          data-settings-subsection="tradfi"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'tradfi' }"
        >
          <div class="panel-placeholder-name">{{ t('market.tiingoSettingsStockPerp') }}</div>
          <div class="panel-placeholder-hint">#settings-hyperliquid-tiingo · M-data-4</div>
        </article>
        <article
          class="panel-card panel-placeholder"
          id="settings-hyperliquid-tradfi-map"
          data-settings-subsection="tradfi"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'tradfi' }"
        >
          <div class="panel-placeholder-name">{{ t('market.tradfiSymbolMappings') }}</div>
          <div class="panel-placeholder-hint">#settings-hyperliquid-tradfi-map · M-data-4</div>
        </article>
      </template>
      <template v-else>
        <FieldsForm :fields="store.fields" />
        <CoinPicker :store="store" />
      </template>
    </div>
  </article>
</template>
