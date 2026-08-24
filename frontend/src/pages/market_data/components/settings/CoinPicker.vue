<script setup lang="ts">
/*
 * Coin picker card — legacy #settings-enabled-coins-card
 * (market_data_main.html:3007-3025) plus the picker body (renderCoinOptions
 * :7028-7063, summaries :7065-7085, drag/keyboard selection :7087-7133,
 * :9297-9305, :9387-9402, :9424-9440, :9475-9486) through the shared
 * useDragSelect engine (dedupe of the best1m twin, recon §2.1).
 *
 * Legacy mutated DOM row classes during a drag and synced them into state at
 * mouseup; the port writes the selection straight into the store, so the
 * mid-drag highlighting and the committed result are identical while
 * renderedCoins (the row order snapshot) stays stable between explicit
 * renders — exactly the legacy re-render call sites.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  btnClass,
  coinPickerRowClass,
  inputClass,
  noteClass,
  panelCardClass,
} from '../../lib/uiClasses';
import type { SettingsController } from '../../composables/useSettings';
import { useDragSelect } from '@/shared/composables/useDragSelect';

const props = defineProps<{
  store: SettingsController;
}>();

const { t } = useI18n();

const drag = useDragSelect({
  // hit-test through elementFromPoint like applySettingsCoinDragPath (:7106-7107)
  getRowAtPoint(x, y) {
    const hit = document.elementFromPoint(x, y);
    const row = hit?.closest('#settings-enabled-coins [data-settings-coin-row]') ?? null;
    if (!row) return null;
    return row.getAttribute('data-settings-coin-row') ?? '';
  },
  isRowSelected: (coin) => props.store.isCoinSelected(coin),
  setRowSelected: (coin, selected) => props.store.setCoinSelected(coin, selected),
  isDisabled: () => props.store.autoEnableNewCoins.value, // :9390
});

onMounted(() => drag.install()); // document mousemove/mouseup (:9424, :9475)
onBeforeUnmount(() => drag.uninstall());

/** Row keyboard activation (:9297-9305) — guarded by auto-enable. */
function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  if (props.store.autoEnableNewCoins.value) return; // :9299
  const target = event.target as HTMLElement | null;
  const row = target?.closest('[data-settings-coin-row]') ?? null; // :9300-9301
  if (!row) return;
  event.preventDefault(); // :9302
  drag.toggleRow(row.getAttribute('data-settings-coin-row') ?? ''); // :9303
}
</script>

<template>
  <article :class="[panelCardClass, 'coin-picker-card']" id="settings-enabled-coins-card" data-settings-subsection="normal">
    <div class="eyebrow">{{ t('market.enabledCoins') }}</div>
    <label class="settings-toggle coin-picker-auto-toggle mt-1 flex min-h-8 items-center gap-2 text-base text-primary">
      <input
        id="settings-auto-enable-new-coins"
        class="h-4 w-4 m-0"
        type="checkbox"
        :checked="store.autoEnableNewCoins.value"
        @change="store.setAutoEnableNewCoins(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('market.autoEnableNewCoins') }}</span>
    </label>
    <div
      :class="[noteClass, 'settings-inline-note mt-2']"
      id="settings-auto-enable-note"
      :hidden="!store.autoEnableNewCoins.value"
    >
      {{ store.autoEnableNewCoins.value ? t('market.autoEnableNote') : '' }}
    </div>
    <div class="coin-picker-toolbar flex flex-wrap items-center gap-2">
      <div class="coin-filter-wrap min-w-[220px] flex-[1_1_360px]">
        <input
          id="settings-coin-filter"
          :class="inputClass"
          type="text"
          :placeholder="t('market.filterEnabledCoinList')"
          :value="store.coinFilter.value"
          @input="store.setCoinFilter(($event.target as HTMLInputElement).value)"
        />
      </div>
      <button
        :class="btnClass('secondary')"
        id="btn-select-all-coins"
        type="button"
        :disabled="store.autoEnableNewCoins.value"
        @click="store.selectVisibleCoins()"
      >{{ t('market.selectVisible') }}</button>
      <button
        :class="btnClass('secondary')"
        id="btn-clear-all-coins"
        type="button"
        :disabled="store.autoEnableNewCoins.value"
        @click="store.clearAllCoins()"
      >{{ t('market.clearAll') }}</button>
      <span :class="[noteClass, 'whitespace-nowrap']" id="settings-enabled-count">{{
        t('market.selectedTotal', {
          selected: store.selectedCoins.value.size,
          total: store.allCoins.value.length,
        })
      }}</span>
      <span :class="[noteClass, 'whitespace-nowrap']" id="settings-filtered-count">{{
        t('market.visibleCount', { visible: store.renderedCoins.value.length })
      }}</span>
    </div>
    <div
      class="coin-picker-list mt-3 grid content-start grid-cols-[repeat(8,minmax(0,1fr))] gap-1 border-t border-secondary/14 pt-2"
      id="settings-enabled-coins"
      @keydown="onKeydown"
    >
      <button
        v-for="coin in store.renderedCoins.value"
        :key="coin"
        :class="coinPickerRowClass(store.isCoinSelected(coin), store.autoEnableNewCoins.value) + ' settings-coin-row'"
        type="button"
        :data-settings-coin-row="coin"
        :aria-pressed="store.isCoinSelected(coin) ? 'true' : 'false'"
        :disabled="store.autoEnableNewCoins.value"
        @mousedown="drag.handleRowMouseDown($event, coin)"
      >
        <span class="coin-picker-coin min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base leading-[1.4] text-primary">{{ coin }}</span>
      </button>
      <div v-if="store.renderedCoins.value.length === 0" class="coin-picker-empty col-span-full p-3 text-base text-secondary">
        {{ t('market.noCoinsMatch') }}
      </div>
    </div>
    <div
      :class="[noteClass, 'settings-inline-note mt-2']"
      id="settings-missing-coins"
      :hidden="store.missingSavedCoins.value.length === 0"
    >
      {{ t('market.ignoredMissingCoins', { coins: store.missingSavedCoins.value.join(', ') }) }}
    </div>
  </article>
</template>
