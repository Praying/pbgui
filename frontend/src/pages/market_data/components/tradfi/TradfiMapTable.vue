<script setup lang="ts">
/*
 * The TradFi map table host — legacy .tradfi-filter-grid (:3111-3128),
 * #tradfi-map-count (:3129, render :6539-6542), .tradfi-table-wrap (:3130,
 * render :6553-6595) with the row click-select (:9648-9652) and the three
 * filter bindings (:9636-9647).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import { buildTradfiSymbol, type TradfiRow } from '../../lib/tradfiFilters';
import { formatTradfiPrice, formatTradfiTimestamp } from '../../lib/tradfiFormat';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();

const columns = computed(() => [
  t('market.symbol'),
  t('market.hlPrice'),
  t('market.tiingoPriceHeader'),
  t('market.description'),
  t('market.pyth'),
  t('market.type'),
  t('market.tiingoSymbol'),
  t('market.status'),
  t('market.startDateHeader'),
  t('market.fetchStart'),
  t('market.verified'),
  t('market.note'),
]); // :6555-6568

function tiingoSymbolOf(row: TradfiRow): string {
  return row.tiingo_symbol || buildTradfiSymbol(row); // :6586 — payload symbol wins
}

function onSymbolInput(event: Event): void {
  props.map.setFilterSymbol((event.target as HTMLInputElement).value); // :9637
}

function onTypeChange(event: Event): void {
  props.map.setFilterType((event.target as HTMLSelectElement).value); // :9641
}

function onStatusChange(event: Event): void {
  props.map.setFilterStatus((event.target as HTMLSelectElement).value); // :9645
}
</script>

<template>
  <div>
    <div class="tradfi-filter-grid">
      <label class="settings-field">
        <span class="field-label">{{ t('market.filterBySymbol') }}</span>
        <input
          id="tradfi-filter-symbol"
          type="text"
          placeholder="e.g. TSLA or XAUUSD"
          :value="map.filters.symbol"
          @input="onSymbolInput"
        >
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.filterByType') }}</span>
        <select id="tradfi-filter-type" :value="map.filters.type" @change="onTypeChange">
          <option value="all">{{ t('market.allTypes') }}</option>
          <option v-for="value in map.optionLists.value.typeValues" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
      <label class="settings-field">
        <span class="field-label">{{ t('market.filterByStatus') }}</span>
        <select id="tradfi-filter-status" :value="map.filters.status" @change="onStatusChange">
          <option value="all">{{ t('market.allStatuses') }}</option>
          <option v-for="value in map.optionLists.value.statusValues" :key="value" :value="value">
            {{ value }}
          </option>
        </select>
      </label>
    </div>
    <div class="note" id="tradfi-map-count">
      {{ map.hasRendered.value ? map.countText.value : t('market.waitingForTradfiMap') }}
    </div>
    <div class="tradfi-table-wrap" id="tradfi-table-wrap">
      <div v-if="map.loadError.value" class="tradfi-empty">{{ map.loadError.value }}</div>
      <div v-else-if="!map.filteredRows.value.length" class="tradfi-empty">
        {{ t('market.noTradfiMatch') }}
      </div>
      <table v-else class="tradfi-map-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in map.filteredRows.value"
            :key="row.xyz_coin"
            :class="{ 'is-selected': row.xyz_coin === map.selectedCoin.value }"
            :data-tradfi-xyz="row.xyz_coin"
            @click="map.selectCoin(row.xyz_coin ?? '')"
          >
            <td>
              <a
                v-if="row.hl_link"
                class="tradfi-table-link"
                :href="row.hl_link"
                target="_blank"
                rel="noopener noreferrer"
              >XYZ:{{ row.xyz_coin }}</a>
              <strong v-else>{{ row.xyz_coin }}</strong>
            </td>
            <td class="tradfi-price-cell">{{ formatTradfiPrice(row.hl_price) }}</td>
            <td class="tradfi-price-cell">{{ formatTradfiPrice(row.tiingo_price) }}</td>
            <td>{{ row.description }}</td>
            <td>
              <a
                v-if="row.pyth_link"
                class="tradfi-table-link-muted"
                :href="row.pyth_link"
                target="_blank"
                rel="noopener noreferrer"
              >{{ t('market.open') }}</a>
            </td>
            <td>{{ row.canonical_type }}</td>
            <td>{{ tiingoSymbolOf(row) }}</td>
            <td><span class="tradfi-pill">{{ row.status }}</span></td>
            <td>{{ row.tiingo_start_date }}</td>
            <td>{{ row.tiingo_fetch_start }}</td>
            <td>{{ formatTradfiTimestamp(row.last_verified) }}</td>
            <td class="tradfi-note-cell" :title="row.note">{{ row.note }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
