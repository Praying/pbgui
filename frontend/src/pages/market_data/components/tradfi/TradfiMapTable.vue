<script setup lang="ts">
/*
 * The TradFi map table host — legacy .tradfi-filter-grid (:3111-3128),
 * #tradfi-map-count (:3129, render :6539-6542), .tradfi-table-wrap (:3130,
 * render :6553-6595) with the row click-select (:9648-9652) and the three
 * filter bindings (:9636-9647).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import { fieldLabelClass, noteClass, settingsFieldClass } from '../../lib/uiClasses';
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

function onSymbolInput(value: string | number | null | undefined): void {
  props.map.setFilterSymbol(String(value ?? '')); // :9637
}

function onTypeSelect(value: unknown): void {
  props.map.setFilterType(String(value ?? '')); // :9641
}

function onStatusSelect(value: unknown): void {
  props.map.setFilterStatus(String(value ?? '')); // :9645
}
</script>

<template>
  <div>
    <div class="tradfi-filter-grid mb-3 grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass">{{ t('market.filterBySymbol') }}</span>
        <Input
          id="tradfi-filter-symbol"
          type="text"
          placeholder="e.g. TSLA or XAUUSD"
          :model-value="map.filters.symbol"
          @update:model-value="onSymbolInput"
        />
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass" id="tradfi-filter-type-label">{{ t('market.filterByType') }}</span>
        <SelectRoot :model-value="map.filters.type" @update:model-value="onTypeSelect">
          <SelectTrigger id="tradfi-filter-type" aria-labelledby="tradfi-filter-type-label">
            <span>{{ map.filters.type === 'all' ? t('market.allTypes') : map.filters.type }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ t('market.allTypes') }}</SelectItem>
            <SelectItem v-for="value in map.optionLists.value.typeValues" :key="value" :value="value">
              {{ value }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
      <label :class="settingsFieldClass">
        <span :class="fieldLabelClass" id="tradfi-filter-status-label">{{ t('market.filterByStatus') }}</span>
        <SelectRoot :model-value="map.filters.status" @update:model-value="onStatusSelect">
          <SelectTrigger id="tradfi-filter-status" aria-labelledby="tradfi-filter-status-label">
            <span>{{ map.filters.status === 'all' ? t('market.allStatuses') : map.filters.status }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{{ t('market.allStatuses') }}</SelectItem>
            <SelectItem v-for="value in map.optionLists.value.statusValues" :key="value" :value="value">
              {{ value }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>
      </label>
    </div>
    <div :class="noteClass" id="tradfi-map-count">
      {{ map.hasRendered.value ? map.countText.value : t('market.waitingForTradfiMap') }}
    </div>
    <div class="tradfi-table-wrap max-h-[420px] overflow-auto rounded-[10px] border border-secondary/14 bg-page/48" id="tradfi-table-wrap">
      <div v-if="map.loadError.value" class="tradfi-empty p-3 text-secondary">{{ map.loadError.value }}</div>
      <div v-else-if="!map.filteredRows.value.length" class="tradfi-empty p-3 text-secondary">
        {{ t('market.noTradfiMatch') }}
      </div>
      <table v-else class="tradfi-map-table w-full border-collapse">
        <thead class="sticky top-0 z-[1] bg-page">
          <tr>
            <th
              v-for="column in columns"
              :key="column"
              class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm font-semibold uppercase tracking-[0.04em] text-primary"
            >{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in map.filteredRows.value"
            :key="row.xyz_coin"
            class="cursor-pointer"
            :class="{ 'is-selected': row.xyz_coin === map.selectedCoin.value }"
            :data-tradfi-xyz="row.xyz_coin"
            @click="map.selectCoin(row.xyz_coin ?? '')"
          >
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">
              <a
                v-if="row.hl_link"
                class="tradfi-table-link font-semibold text-accent no-underline hover:underline"
                :href="row.hl_link"
                target="_blank"
                rel="noopener noreferrer"
              >XYZ:{{ row.xyz_coin }}</a>
              <strong v-else>{{ row.xyz_coin }}</strong>
            </td>
            <td class="tradfi-price-cell whitespace-nowrap border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm tabular-nums">{{ formatTradfiPrice(row.hl_price) }}</td>
            <td class="tradfi-price-cell whitespace-nowrap border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm tabular-nums">{{ formatTradfiPrice(row.tiingo_price) }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.description }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">
              <a
                v-if="row.pyth_link"
                class="tradfi-table-link-muted text-sm font-semibold text-secondary no-underline hover:text-primary hover:underline"
                :href="row.pyth_link"
                target="_blank"
                rel="noopener noreferrer"
              >{{ t('market.open') }}</a>
            </td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.canonical_type }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ tiingoSymbolOf(row) }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm"><span class="tradfi-pill inline-flex items-center whitespace-nowrap rounded-full border border-accent/20 bg-accent/12 py-[0.2rem] px-[0.55rem] text-primary">{{ row.status }}</span></td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.tiingo_start_date }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ row.tiingo_fetch_start }}</td>
            <td class="border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm">{{ formatTradfiTimestamp(row.last_verified) }}</td>
            <td class="tradfi-note-cell max-w-[320px] border-b border-secondary/12 py-[0.7rem] px-[0.8rem] text-left align-top text-sm text-secondary" :title="row.note">{{ row.note }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Row-state rules (legacy :2204-2210) — the hover/selected paints come
   from the row's state, and .is-selected must outrank :hover exactly like
   the legacy cascade order. 'tradfi-map-table' / 'is-selected' remain the
   inert anchors (the store toggles is-selected, the suite selects
   `.tradfi-map-table tbody tr`). */
.tradfi-map-table tbody tr:hover {
  background: rgb(var(--accent-rgb) / 0.08);
}

.tradfi-map-table tbody tr.is-selected {
  background: rgb(var(--accent-rgb) / 0.14);
}
</style>
