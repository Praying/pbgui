<script setup lang="ts">
/*
 * The TradFi map card — legacy #settings-hyperliquid-tradfi-map
 * (market_data_main.html:3105-3218): map table + filters (:3111-3130),
 * the ten action buttons (:3131-3145, states :6388-6410), the cache note
 * (:3146), the action-result host (:3147), the specs window mount
 * (:3149-3166) and the mapping editor (:3168-3217).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { noteClass, panelCardClass, panelHeadClass } from '../../lib/uiClasses';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import ActionResult from './ActionResult.vue';
import SpecsFloatingWindow from './SpecsFloatingWindow.vue';
import TradfiEditor from './TradfiEditor.vue';
import TradfiMapTable from './TradfiMapTable.vue';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();
/** Re-wrapped so the template's top-level ref auto-unwrap applies. */
const buttons = computed(() => props.map.actionButtons.value);
</script>

<template>
  <article :class="panelCardClass" id="settings-hyperliquid-tradfi-map" data-settings-subsection="tradfi">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.tradfiSymbolMappings') }}</div>
      </div>
    </div>
    <TradfiMapTable :map="map" />
    <div class="tradfi-actions-stack mt-3 grid gap-3">
      <div class="tradfi-actions-grid grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Button variant="info" id="btn-tradfi-search-ticker" type="button" :disabled="buttons.searchTicker" @click="map.searchTicker()">
          {{ t('market.searchTicker') }}
        </Button>
        <Button variant="info" id="btn-tradfi-edit-selected" type="button" :disabled="buttons.editSelected" @click="map.editSelected()">
          {{ t('market.edit') }}
        </Button>
        <Button variant="info" id="btn-tradfi-test-resolve" type="button" :disabled="buttons.testResolve" @click="map.testResolve()">
          {{ t('market.testResolve') }}
        </Button>
        <Button variant="info" id="btn-tradfi-fetch-start-date" type="button" :disabled="buttons.fetchStartDate" @click="map.fetchStartDate()">
          {{ t('market.fetchStartDate') }}
        </Button>
        <Button variant="info" id="btn-tradfi-spec-refresh" type="button" :disabled="buttons.specRefresh" @click="map.refreshSpecs()">
          {{ t('market.refreshSpec') }}
        </Button>
      </div>
      <div class="tradfi-actions-grid grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Button variant="info" id="btn-tradfi-auto-map" type="button" :disabled="buttons.autoMap" @click="map.autoMap()">
          {{ t('market.autoMap') }}
        </Button>
        <Button variant="info" id="btn-tradfi-fetch-all-start-dates" type="button" :disabled="buttons.fetchAllStartDates" @click="map.fetchAllStartDates()">
          {{ t('market.fetchAllStartDates') }}
        </Button>
        <Button variant="info" id="btn-tradfi-refresh-metadata" type="button" :disabled="buttons.refreshMetadata" @click="map.refreshMetadata()">
          {{ t('market.refreshMetadata') }}
        </Button>
        <Button variant="info" id="btn-tradfi-refresh-prices" type="button" :disabled="buttons.refreshPrices" @click="map.refreshPrices()">
          {{ t('market.refreshPrices') }}
        </Button>
        <Button variant="info" id="btn-tradfi-view-specs" type="button" :disabled="buttons.viewSpecs" @click="map.loadSpecsView()">
          {{ t('market.viewSpecs') }}
        </Button>
      </div>
      <div :class="[noteClass, 'tradfi-cache-note']" id="tradfi-cache-note">{{ map.cacheNote.value }}</div>
      <div id="tradfi-action-result">
        <ActionResult
          v-if="map.actionResult.value"
          :result="map.actionResult.value"
          @close="map.clearActionResult()"
        />
      </div>
      <SpecsFloatingWindow :map="map" />
    </div>
    <TradfiEditor :map="map" />
  </article>
</template>
