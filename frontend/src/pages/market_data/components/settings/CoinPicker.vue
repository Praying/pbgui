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
  <article class="panel-card coin-picker-card" id="settings-enabled-coins-card" data-settings-subsection="normal">
    <div class="eyebrow">{{ t('market.enabledCoins') }}</div>
    <label class="settings-toggle coin-picker-auto-toggle">
      <input
        id="settings-auto-enable-new-coins"
        type="checkbox"
        :checked="store.autoEnableNewCoins.value"
        @change="store.setAutoEnableNewCoins(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('market.autoEnableNewCoins') }}</span>
    </label>
    <div class="note settings-inline-note" id="settings-auto-enable-note" :hidden="!store.autoEnableNewCoins.value">
      {{ store.autoEnableNewCoins.value ? t('market.autoEnableNote') : '' }}
    </div>
    <div class="coin-picker-toolbar">
      <div class="coin-filter-wrap">
        <input
          id="settings-coin-filter"
          type="text"
          :placeholder="t('market.filterEnabledCoinList')"
          :value="store.coinFilter.value"
          @input="store.setCoinFilter(($event.target as HTMLInputElement).value)"
        />
      </div>
      <button
        class="btn pbgui-btn btn-secondary secondary"
        id="btn-select-all-coins"
        type="button"
        :disabled="store.autoEnableNewCoins.value"
        @click="store.selectVisibleCoins()"
      >{{ t('market.selectVisible') }}</button>
      <button
        class="btn pbgui-btn btn-secondary secondary"
        id="btn-clear-all-coins"
        type="button"
        :disabled="store.autoEnableNewCoins.value"
        @click="store.clearAllCoins()"
      >{{ t('market.clearAll') }}</button>
      <span class="note" id="settings-enabled-count">{{
        t('market.selectedTotal', {
          selected: store.selectedCoins.value.size,
          total: store.allCoins.value.length,
        })
      }}</span>
      <span class="note" id="settings-filtered-count">{{
        t('market.visibleCount', { visible: store.renderedCoins.value.length })
      }}</span>
    </div>
    <div class="coin-picker-list" id="settings-enabled-coins" @keydown="onKeydown">
      <button
        v-for="coin in store.renderedCoins.value"
        :key="coin"
        class="coin-picker-row coin-picker-button settings-coin-row"
        :class="{
          selected: store.isCoinSelected(coin),
          disabled: store.autoEnableNewCoins.value,
        }"
        type="button"
        :data-settings-coin-row="coin"
        :aria-pressed="store.isCoinSelected(coin) ? 'true' : 'false'"
        :disabled="store.autoEnableNewCoins.value"
        @mousedown="drag.handleRowMouseDown($event, coin)"
      >
        <span class="coin-picker-coin">{{ coin }}</span>
      </button>
      <div v-if="store.renderedCoins.value.length === 0" class="coin-picker-empty">
        {{ t('market.noCoinsMatch') }}
      </div>
    </div>
    <div class="note settings-inline-note" id="settings-missing-coins" :hidden="store.missingSavedCoins.value.length === 0">
      {{ t('market.ignoredMissingCoins', { coins: store.missingSavedCoins.value.join(', ') }) }}
    </div>
  </article>
</template>
