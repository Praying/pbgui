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
 *
 * Rail migration: the sidebar context block (:2950-2958 — dirty-state save
 * button :5528-5533 + subsection nav :2953-2957, ids #sidebar-context-actions/
 * #btn-save-settings-sidebar) moved here as an in-panel toolbar; the
 * subsection nav is a segmented control over the cards below.
 */
import { watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import type { SettingsController } from '../../composables/useSettings';
import type { UseTiingo } from '../../composables/useTiingo';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import ArchiveCard from './ArchiveCard.vue';
import AwsCard from './AwsCard.vue';
import CoinPicker from './CoinPicker.vue';
import FieldsForm from './FieldsForm.vue';
import SubsectionNav from './SubsectionNav.vue';
import TiingoCard from '../tradfi/TiingoCard.vue';
import TradfiMapCard from '../tradfi/TradfiMapCard.vue';

const props = defineProps<{
  store: SettingsController;
  tiingo: UseTiingo;
  map: UseTradfiMap;
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
  <article class="settings-shell flex flex-col gap-3">
    <div id="settings-context-actions" class="settings-context-actions flex flex-wrap items-center justify-between gap-3">
      <SubsectionNav
        :available="store.availableSubsections.value"
        :active="store.resolvedSubsection.value"
        @select="store.setActiveSubsection"
      />
      <Button
        id="btn-save-settings"
        type="button"
        :variant="store.isDirty.value ? 'warning' : 'secondary'"
        :class="['save-settings-btn flex-none', { 'save-needed': store.isDirty.value }]"
        :disabled="!store.isDirty.value"
        @click="store.saveSettings()"
      >{{ t('market.saveSettings') }}</Button>
    </div>
    <div class="settings-layout mt-3 flex flex-col gap-3">
      <template v-if="store.isHyperliquid.value">
        <FieldsForm
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'normal' }"
        />
        <CoinPicker
          :store="store"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'normal' }"
        />
        <AwsCard
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'aws' }"
        />
        <ArchiveCard
          :fields="store.fields"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'aws' }"
        />
        <TiingoCard
          :tiingo="tiingo"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'tradfi' }"
        />
        <TradfiMapCard
          :map="map"
          :class="{ 'settings-subsection-hidden hidden': store.resolvedSubsection.value !== 'tradfi' }"
        />
      </template>
      <template v-else>
        <FieldsForm :fields="store.fields" />
        <CoinPicker :store="store" />
      </template>
    </div>
  </article>
</template>
