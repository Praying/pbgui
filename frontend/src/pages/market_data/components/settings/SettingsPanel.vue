<script setup lang="ts">
/*
 * Settings panel — legacy #settings-panel body (market_data_main.html:2979+):
 * settings-shell > settings-layout with the card order of
 * positionSettingsCards (:6121-6144 — a no-op in legacy since the static DOM
 * order already satisfies both branches; the port renders the same visible
 * order directly), subsection class fan-out (:6169-6172) and the subsection
 * scroll reset (:6183-6184).
 *
 * M-data-4: the tiingo (:3077-3103) and tradfi-map (:3105-3218) cards render
 * through their controllers, created in App.vue so the settings-payload
 * hooks (:7379-7401) reach them.
 */
import { watch } from 'vue';
import type { SettingsController } from '../../composables/useSettings';
import type { UseTiingo } from '../../composables/useTiingo';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import ArchiveCard from './ArchiveCard.vue';
import AwsCard from './AwsCard.vue';
import CoinPicker from './CoinPicker.vue';
import FieldsForm from './FieldsForm.vue';
import TiingoCard from '../tradfi/TiingoCard.vue';
import TradfiMapCard from '../tradfi/TradfiMapCard.vue';

const props = defineProps<{
  store: SettingsController;
  tiingo: UseTiingo;
  map: UseTradfiMap;
}>();

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
        <TiingoCard
          :tiingo="tiingo"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'tradfi' }"
        />
        <TradfiMapCard
          :map="map"
          :class="{ 'settings-subsection-hidden': store.resolvedSubsection.value !== 'tradfi' }"
        />
      </template>
      <template v-else>
        <FieldsForm :fields="store.fields" />
        <CoinPicker :store="store" />
      </template>
    </div>
  </article>
</template>
