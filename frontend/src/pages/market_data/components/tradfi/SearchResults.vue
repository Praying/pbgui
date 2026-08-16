<script setup lang="ts">
/*
 * The search window content — legacy renderTradfiSearchResults
 * (market_data_main.html:5812-5902): query controls (:5855-5861), the
 * status box (:5862), result rows with price metas (:5863-5887), the
 * apply buttons (:5884) and the empty-state ladder (:5844-5848).
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UseTradfiMap } from '../../composables/useTradfiMap';
import { formatTradfiPrice, formatTradfiTimestamp } from '../../lib/tradfiFormat';

const props = defineProps<{
  map: UseTradfiMap;
}>();

const { t } = useI18n();

const row = computed(() => props.map.selectedRow.value);
const rowCoin = computed(() => String(row.value?.xyz_coin ?? ''));
/** sameCoin (:5832) — search state belongs to the coin it ran for. */
const sameCoin = computed(() => props.map.searchCoin.value === rowCoin.value);
/** Query shown in the input (:5833). */
const effectiveQuery = computed(
  () => (sameCoin.value ? String(props.map.searchQuery.value || '') : '').trim() || rowCoin.value
);

const message = computed(() => (sameCoin.value ? props.map.searchMessage.value : ''));
const messageLevel = computed(() =>
  sameCoin.value ? props.map.searchMessageLevel.value || 'info' : 'info'
);
const results = computed(() =>
  sameCoin.value && Array.isArray(props.map.searchResults.value) ? props.map.searchResults.value : []
);
const isSearching = computed(() => props.map.searchLoading.value && sameCoin.value);

const emptyMessage = computed(() => {
  if (isSearching.value) return t('market.searchingTiingo'); // :5844-5845
  if (sameCoin.value && props.map.searchQuery.value) {
    return t('market.noTiingoMatchesFor', { query: props.map.searchQuery.value }); // :5846-5847
  }
  return t('market.runSearchTiingo', { coin: rowCoin.value }); // :5848
});

/** Hyperliquid price meta line (:5837-5843). */
const hlPriceMeta = computed(() => {
  const raw = row.value?.hl_price;
  const parsed =
    raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  return Number.isFinite(parsed)
    ? t('market.hyperliquidPrice', { price: formatTradfiPrice(parsed) })
    : t('market.hyperliquidPriceUnavailable');
});

/** Result price label + optional timestamp (:5866-5875). */
function priceMeta(item: {
  tiingo_price?: unknown;
  tiingo_price_timestamp?: unknown;
  tiingo_price_source?: unknown;
}): string {
  const raw = item.tiingo_price;
  const parsed = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw);
  const label = Number.isFinite(parsed)
    ? `${item.tiingo_price_source === 'iex_search' ? t('market.tiingoPrice') : t('market.tiingoCachedPrice')}: ${formatTradfiPrice(parsed)}`
    : t('market.tiingoPriceUnavailable');
  const timestamp = formatTradfiTimestamp(item.tiingo_price_timestamp);
  return timestamp ? `${label} · ${timestamp} UTC` : label;
}

function run(): void {
  void props.map.runSearch(String(inputEl.value ? inputEl.value.value : '')); // :6660 — live input text
}

function onQueryKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter') return;
  event.preventDefault(); // :9669
  run();
}

/* legacy refocuses the query input after every render (:5891-5901) */
const inputEl = ref<HTMLInputElement | null>(null);
watch(
  () => [props.map.searchCoin.value, props.map.searchQuery.value, props.map.searchLoading.value],
  () => {
    void nextTick(() => {
      const input = inputEl.value;
      if (!input || document.activeElement === input) return;
      input.focus();
      input.select();
    });
  },
  { immediate: true }
);
</script>

<template>
  <div v-if="!row" class="tradfi-search-window-content">
    <div class="tradfi-search-window-empty">{{ t('market.selectTradfiRow') }}</div>
  </div>
  <div v-else class="tradfi-search-window-content">
    <div class="tradfi-search-window-header-block">
      <div class="tradfi-search-title">{{ t('market.searchTiingoTickerFor', { coin: rowCoin }) }}</div>
      <div class="tradfi-search-window-caption">{{ t('market.tiingoSearchCaption') }}</div>
    </div>
    <div class="tradfi-search-window-controls">
      <label class="settings-field tradfi-search-window-query-field">
        <span class="field-label">{{ t('market.query') }}</span>
        <input
          id="tradfi-search-window-query"
          ref="inputEl"
          type="text"
          :value="effectiveQuery"
          :placeholder="t('market.tickerOrCompany')"
          @keydown="onQueryKeydown"
        >
      </label>
      <button
        class="btn secondary"
        id="btn-tradfi-search-window-run"
        type="button"
        :disabled="isSearching"
        @click="run"
      >{{ isSearching ? t('market.searching') : t('common.search') }}</button>
    </div>
    <div
      v-if="message"
      class="tradfi-search-window-status"
      :class="messageLevel"
    >{{ message }}</div>
    <div v-if="results.length" class="tradfi-search-list">
      <div v-for="(item, index) in results" :key="index" class="tradfi-search-item">
        <div class="tradfi-search-item-main">
          <div class="tradfi-search-title">{{ item.ticker }} · {{ item.name }}</div>
          <div class="tradfi-search-meta">
            {{ (item.asset_type || 'unknown') + ' · ' + (item.is_active ? t('market.active') : t('market.inactive')) }}
          </div>
          <div class="tradfi-search-meta">{{ priceMeta(item) }}</div>
          <div class="tradfi-search-meta">{{ hlPriceMeta }}</div>
        </div>
        <button
          class="btn secondary"
          type="button"
          :data-tradfi-search-index="index"
          @click="map.applySearchResult(index)"
        >{{ t('market.apply') }}</button>
      </div>
    </div>
    <div v-else class="tradfi-search-window-empty">{{ emptyMessage }}</div>
  </div>
</template>
