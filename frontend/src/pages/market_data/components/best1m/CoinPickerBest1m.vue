<script setup lang="ts">
/*
 * The best-1m coin picker — legacy #best1m-coin-picker +
 * toolbar (market_data_main.html:3351-3365) with the drag-select twin of
 * the settings picker (:7188-7302, handlers :9293-9322, :9403-9416,
 * :9441-9456, :9487-9496) driven by the shared useDragSelect engine
 * (recon §2.1 dedupe — no second engine copy).
 *
 * Selection writes straight into the store (legacy flipped DOM classes and
 * synced at mouseup); the selected-first ordering lives in the store's
 * renderedCoins computed (:7193-7198).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UseBest1m } from '../../composables/useBest1m';
import { useDragSelect } from '@/shared/composables/useDragSelect';

const props = defineProps<{
  store: UseBest1m;
}>();

const { t } = useI18n();

const drag = useDragSelect({
  // hit-test through elementFromPoint like applyBest1mDragPath (:7277-7278)
  getRowAtPoint(x: number, y: number): string | null {
    const hit = document.elementFromPoint(x, y);
    const row = hit?.closest('#best1m-coin-picker [data-best1m-coin-row]') ?? null;
    if (!row) return null;
    return row.getAttribute('data-best1m-coin-row') ?? '';
  },
  isRowSelected: (coin) => props.store.isCoinSelected(coin),
  setRowSelected: (coin, selected) => props.store.setCoinSelected(coin, selected),
});

/** updateBest1mSelectionSummary queue-scope note (:7173-7183). */
const queueScope = computed(() => {
  const enabledCoins = props.store.enabledCoins.value;
  const selectedCount = props.store.selectedCoins.value.size;
  if (!enabledCoins.length) return t('market.zeroAvailableCoins');
  if (selectedCount) {
    return selectedCount === 1
      ? t('market.selectedCoinCount', { count: selectedCount })
      : t('market.selectedCoinsCount', { count: selectedCount });
  }
  return t('market.allAvailableCoins', { count: enabledCoins.length });
});

/** Row keyboard activation (:9306-9313). */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target as HTMLElement | null;
  const row = target?.closest('[data-best1m-coin-row]') ?? null;
  if (!row) return;
  event.preventDefault(); // :9311
  drag.toggleRow(row.getAttribute('data-best1m-coin-row') ?? ''); // :9312
}

function install(): void {
  drag.install(); // document mousemove/mouseup (:9424, :9475)
}

defineExpose({ install, uninstall: drag.uninstall });
</script>

<template>
  <div class="best1m-selector-stack">
    <label class="settings-field">
      <span class="field-label">{{ t('market.coinsForBuild') }}</span>
      <span class="note best1m-selection-note">{{ t('market.best1mSelectionNote') }}</span>
    </label>
    <div class="coin-picker-toolbar">
      <div class="coin-filter-wrap">
        <input
          id="best1m-coin-filter"
          type="text"
          :placeholder="t('market.filterAvailableCoinList')"
          :value="store.coinFilter.value"
          @input="store.setCoinFilter(($event.target as HTMLInputElement).value)"
        />
      </div>
      <button
        class="btn secondary"
        id="btn-best1m-select-visible"
        type="button"
        :disabled="store.visibleCoins.value.length === 0"
        @click="store.selectVisibleCoins()"
      >{{ t('market.selectVisible') }}</button>
      <button
        class="btn secondary"
        id="btn-best1m-clear-selection"
        type="button"
        :disabled="store.selectedCoins.value.size === 0"
        @click="store.clearAllCoins()"
      >{{ t('market.clearAll') }}</button>
      <span class="note" id="best1m-selected-count">{{
        t('market.selectedTotal', {
          selected: store.selectedCoins.value.size,
          total: store.enabledCoins.value.length,
        })
      }}</span>
      <span class="note" id="best1m-filtered-count">{{
        t('market.visibleCount', { visible: store.visibleCoins.value.length })
      }}</span>
    </div>
    <div class="coin-picker-list" id="best1m-coin-picker" @keydown="onKeydown">
      <template v-if="store.isLoading.value">
        <div class="coin-picker-empty">{{ t('market.loadingAvailableCoins') }}</div>
      </template>
      <template v-else>
        <button
          v-for="coin in store.renderedCoins.value"
          :key="coin"
          class="coin-picker-row coin-picker-button"
          :class="{ selected: store.isCoinSelected(coin) }"
          type="button"
          :data-best1m-coin-row="coin"
          :aria-pressed="store.isCoinSelected(coin) ? 'true' : 'false'"
          @mousedown="drag.handleRowMouseDown($event, coin)"
        >
          <span class="coin-picker-coin">{{ coin }}</span>
        </button>
        <div v-if="store.renderedCoins.value.length === 0" class="coin-picker-empty">
          {{ t('market.noCoinsMatch') }}
        </div>
      </template>
    </div>
    <span class="note" id="best1m-coin-count">{{
      store.isLoading.value
        ? t('market.loading')
        : store.loadFailed.value
          ? t('market.unavailable')
          : queueScope
    }}</span>
  </div>
</template>
