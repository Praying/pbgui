<script setup lang="ts">
/*
 * The coin picker grid — the Vue port of the legacy dl/build picker twins
 * (populateDownload toolbar :985-992, populateBuild toolbar :1021-1031,
 * render*CoinPicker :1161-1286) driven by the shared useDragSelect engine
 * (the hl_data_actions drag handlers :817-921 map 1:1 onto it). Selection
 * state stays in the owning store; the grid is presentational plus the drag
 * wiring.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDragSelect } from '@/shared/composables/useDragSelect';

const props = defineProps<{
  /** Grid id suffix ('dl' | 'build') — hit-tests scope to #opts-<ns>. */
  ns: string;
  renderedCoins: string[];
  visibleCount: number;
  totalCoins: number;
  selected: ReadonlySet<string>;
  filter: string;
  /** build-only toggle buttons (:1023-1024). */
  showTradfiToggle?: boolean;
  showNoLocalToggle?: boolean;
  tradfiOnly?: boolean;
  noLocalData?: boolean;
}>();

const emit = defineEmits<{
  (e: 'set-filter', value: string): void;
  (e: 'select-visible'): void;
  (e: 'clear-selection'): void;
  (e: 'toggle-tradfi'): void;
  (e: 'toggle-no-local'): void;
  (e: 'apply-selection', coin: string, selected: boolean): void;
}>();

const { t } = useI18n();

const drag = useDragSelect({
  // hit-test through elementFromPoint like applyDownloadDragPath (:1137-1141)
  getRowAtPoint(x: number, y: number): string | null {
    const hit = document.elementFromPoint(x, y);
    const row = hit?.closest(`#opts-${props.ns} [data-coin-row]`) ?? null;
    if (!row) return null;
    return row.getAttribute('data-coin-row') ?? '';
  },
  isRowSelected: (coin) => props.selected.has(coin),
  setRowSelected: (coin, selected) => emit('apply-selection', coin, selected),
});

/** Row keyboard activation (:817-833). */
function onGridKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const target = event.target as HTMLElement | null;
  const row = target?.closest('[data-coin-row]') ?? null;
  if (!row) return;
  event.preventDefault();
  drag.toggleRow(row.getAttribute('data-coin-row') ?? '');
}

/* The picker mounts late (after the info load flips the section body to
   ready), so the engine installs from the component's own lifecycle. */
onMounted(() => drag.install());
onBeforeUnmount(() => drag.uninstall());
</script>

<template>
  <div class="hlda-fs">
    <slot name="label"></slot>
    <div class="hlda-picker-toolbar">
      <div class="hlda-picker-filter-wrap">
        <input
          type="text"
          class="hlda-filter-input"
          :placeholder="t('market.filterEnabledCoinList')"
          :value="filter"
          @input="emit('set-filter', ($event.target as HTMLInputElement).value)"
        />
      </div>
      <button
        v-if="showTradfiToggle"
        type="button"
        class="hlda-mini-btn pbgui-action"
        :class="{ active: tradfiOnly }"
        :id="ns + '-tradfi-only'"
        :aria-pressed="tradfiOnly ? 'true' : 'false'"
        @click="emit('toggle-tradfi')"
      >{{ t('market.tradfiOnly') }}</button>
      <button
        v-if="showNoLocalToggle"
        type="button"
        class="hlda-mini-btn pbgui-action"
        :class="{ active: noLocalData }"
        :id="ns + '-no-local-data'"
        :aria-pressed="noLocalData ? 'true' : 'false'"
        @click="emit('toggle-no-local')"
      >{{ t('market.noDownloadedHistory') }}</button>
      <button type="button" class="hlda-mini-btn pbgui-action" :id="ns + '-select-visible'" :disabled="visibleCount === 0" @click="emit('select-visible')">{{ t('market.selectVisible') }}</button>
      <button type="button" class="hlda-mini-btn pbgui-action" :id="ns + '-clear-selection'" :disabled="selected.size === 0" @click="emit('clear-selection')">{{ t('market.clearAll') }}</button>
      <span class="hlda-picker-meta">{{ t('market.selectedTotal', { selected: selected.size, total: totalCoins }) }}</span>
      <span class="hlda-picker-meta">{{ t('market.visibleCount', { visible: visibleCount }) }}</span>
    </div>
    <div class="hlda-coin-grid" :id="'opts-' + ns" @keydown="onGridKeydown">
      <button
        v-for="coin in renderedCoins"
        :key="coin"
        class="hlda-coin-row hlda-coin-btn"
        :class="{ selected: selected.has(coin) }"
        type="button"
        :data-coin-row="coin"
        :aria-pressed="selected.has(coin) ? 'true' : 'false'"
        @mousedown="drag.handleRowMouseDown($event, coin)"
      >
        <span class="hlda-coin-name">{{ coin }}</span>
      </button>
      <div v-if="renderedCoins.length === 0" class="hlda-coin-empty">{{ t('market.noCoinsMatch') }}</div>
    </div>
  </div>
</template>
