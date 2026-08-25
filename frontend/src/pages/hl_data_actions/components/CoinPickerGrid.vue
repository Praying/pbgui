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
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
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

/* Coin-row selection → full utility set (the former .hlda-coin-row.selected
   tint; keeps the `selected` test anchor). */
function coinRowClass(selected: boolean): string {
  return selected ? 'selected border-accent/24 bg-accent/12' : 'border-transparent hover:bg-accent/8';
}
</script>

<template>
  <div class="hlda-fs mb-3.5">
    <slot name="label"></slot>
    <div class="hlda-picker-toolbar mt-2.5 flex flex-wrap items-center gap-2">
      <div class="hlda-picker-filter-wrap min-w-[220px] flex-[1_1_280px]">
        <Input
          type="text"
          size="lg"
          class="hlda-filter-input"
          :placeholder="t('market.filterEnabledCoinList')"
          :model-value="filter"
          @update:model-value="emit('set-filter', String($event ?? ''))"
        />
      </div>
      <Button
        v-if="showTradfiToggle"
        type="button"
        size="lg"
        :variant="tradfiOnly ? 'info' : 'secondary'"
        class="hlda-mini-btn pbgui-action"
        :id="ns + '-tradfi-only'"
        :aria-pressed="tradfiOnly ? 'true' : 'false'"
        @click="emit('toggle-tradfi')"
      >{{ t('market.tradfiOnly') }}</Button>
      <Button
        v-if="showNoLocalToggle"
        type="button"
        size="lg"
        :variant="noLocalData ? 'info' : 'secondary'"
        class="hlda-mini-btn pbgui-action"
        :id="ns + '-no-local-data'"
        :aria-pressed="noLocalData ? 'true' : 'false'"
        @click="emit('toggle-no-local')"
      >{{ t('market.noDownloadedHistory') }}</Button>
      <Button type="button" size="lg" variant="secondary" class="hlda-mini-btn pbgui-action" :id="ns + '-select-visible'" :disabled="visibleCount === 0" @click="emit('select-visible')">{{ t('market.selectVisible') }}</Button>
      <Button type="button" size="lg" variant="secondary" class="hlda-mini-btn pbgui-action" :id="ns + '-clear-selection'" :disabled="selected.size === 0" @click="emit('clear-selection')">{{ t('market.clearAll') }}</Button>
      <span class="hlda-picker-meta whitespace-nowrap text-xs text-muted">{{ t('market.selectedTotal', { selected: selected.size, total: totalCoins }) }}</span>
      <span class="hlda-picker-meta whitespace-nowrap text-xs text-muted">{{ t('market.visibleCount', { visible: visibleCount }) }}</span>
    </div>
    <div
      class="hlda-coin-grid content-start mt-3 grid grid-cols-8 gap-1 border-t border-elevated pt-3 max-[1500px]:grid-cols-6 max-[1180px]:grid-cols-4 max-[760px]:grid-cols-2"
      :id="'opts-' + ns"
      @keydown="onGridKeydown"
    >
      <Button
        v-for="coin in renderedCoins"
        :key="coin"
        variant="ghost"
        class="hlda-coin-row hlda-coin-btn flex min-h-[34px] min-w-0 w-full justify-start gap-2 rounded-lg px-2 text-left font-normal text-primary focus-visible:outline-1 focus-visible:outline-accent/42 focus-visible:outline-offset-1 active:scale-100"
        :class="coinRowClass(selected.has(coin))"
        type="button"
        :data-coin-row="coin"
        :aria-pressed="selected.has(coin) ? 'true' : 'false'"
        @mousedown="drag.handleRowMouseDown($event, coin)"
      >
        <span class="hlda-coin-name truncate min-w-0 text-sm">{{ coin }}</span>
      </Button>
      <div v-if="renderedCoins.length === 0" class="hlda-coin-empty col-span-full p-3 text-sm text-muted">{{ t('market.noCoinsMatch') }}</div>
    </div>
  </div>
</template>
