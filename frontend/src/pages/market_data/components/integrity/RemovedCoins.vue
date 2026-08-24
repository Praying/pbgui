<script setup lang="ts">
/*
 * The removed-markets manager — #integrity-removed-card
 * (market_data_main.html:3247-3266) with the row table (:4353-4407), the
 * selection buttons (:4810-4825) and the index-range drag-select
 * (:4827-4843, bind handlers :9217-9259). The store owns the selection
 * state; this component wires the DOM events.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { btnDangerClass, noteClass, panelCardClass, panelHeadClass } from '../../lib/uiClasses';
import type { IntegrityController } from '../../composables/useIntegrity';

const props = defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

function onDocumentMouseUp(): void {
  props.store.handleRemovedMouseUp(); // :9248-9259
}

onMounted(() => {
  document.addEventListener('mouseup', onDocumentMouseUp);
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseup', onDocumentMouseUp);
});

const thClass =
  'sticky top-0 z-[1] border-b-2 border-border-default bg-panel p-2 text-left';
const tdClass =
  'border-l-[3px] border-l-transparent border-b border-border-default p-2';
</script>

<template>
  <article :class="panelCardClass" id="integrity-removed-card">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.removedMarkets') }}</div>
        <h3>{{ t('market.unavailableCoinData') }}</h3>
        <p :class="noteClass" id="integrity-removed-note">{{ store.removedNoteText.value }}</p>
      </div>
      <div class="panel-actions">
        <span :class="noteClass" id="integrity-removed-count">{{ store.removedCountText.value }}</span>
        <button
          :class="btnDangerClass"
          id="btn-integrity-remove-selected"
          type="button"
          :disabled="store.removeSelectedDisabled.value"
          @click="store.removeSelectedRemovedCoins()"
        >
          {{ store.removeSelectedLabelText.value }}
        </button>
        <button
          :class="btnDangerClass"
          id="btn-integrity-remove-all"
          type="button"
          :disabled="store.removeAllDisabled.value"
          @click="store.removeAllRemovedCoins()"
        >
          {{ t('market.removeAll') }}
        </button>
      </div>
    </div>
    <div class="integrity-table-wrap max-h-[52vh] overflow-auto rounded-md border border-border-default">
      <table class="integrity-table w-full border-collapse max-[760px]:min-w-[720px]">
        <thead>
          <tr>
            <th :class="thClass">{{ t('market.exchange') }}</th>
            <th :class="thClass">{{ t('market.coin') }}</th>
            <th :class="thClass">{{ t('market.files') }}</th>
            <th :class="thClass">{{ t('market.size') }}</th>
            <th :class="thClass">{{ t('market.from') }}</th>
            <th :class="thClass">{{ t('market.to') }}</th>
            <th :class="thClass">{{ t('market.status') }}</th>
            <th :class="thClass">{{ t('market.action') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-removed-coins" @mousemove="store.handleRemovedTableMouseMove($event)">
          <tr v-if="!store.removedRows.value.length">
            <td class="integrity-empty p-5" colspan="8">{{ store.removedEmptyMessage.value }}</td>
          </tr>
          <template v-else>
            <tr
              v-for="row in store.removedRows.value"
              :key="row.coin"
              :class="{ selected: row.removable && store.isRemovedCoinSelected(row.coin) }"
              :data-integrity-removed-row="row.removable ? '1' : undefined"
              :data-coin="row.removable ? row.coin : undefined"
              :tabindex="row.removable ? 0 : undefined"
              :aria-selected="row.removable ? (store.isRemovedCoinSelected(row.coin) ? 'true' : 'false') : undefined"
              @mousedown="row.removable && store.handleRemovedRowMouseDown($event, row.coin)"
              @keydown.enter.prevent="row.removable && store.toggleRemovedCoin(row.coin)"
              @keydown.space.prevent="row.removable && store.toggleRemovedCoin(row.coin)"
            >
              <td :class="tdClass">{{ row.exchange }}</td>
              <td :class="tdClass">{{ row.coin }}</td>
              <td :class="tdClass">{{ row.files }}</td>
              <td :class="tdClass">{{ row.size }}</td>
              <td :class="tdClass">{{ row.fromDay }}</td>
              <td :class="tdClass">{{ row.toDay }}</td>
              <td :class="tdClass">{{ row.reason }}</td>
              <td :class="tdClass">
                <button
                  v-if="row.removable"
                  :class="btnDangerClass"
                  type="button"
                  data-integrity-remove-coin="1"
                  :data-exchange="row.exchange"
                  :data-coin="row.coin"
                  @click="store.removeUnavailableIntegrityCoin(row.exchange, row.coin)"
                >
                  {{ t('market.removeCoinData') }}
                </button>
                <span v-else>{{ t('market.readOnly') }}</span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </article>
</template>

<style scoped>
/* Row-state rules (legacy :2223-2225) — the store toggles the `selected`
   class on rows with the removable marker; the cell paints follow from the
   row state (a descendant relation utilities cannot express). The data
   attribute + 'selected' remain the JS/test hooks. */
#integrity-removed-coins tr[data-integrity-removed-row] {
  cursor: pointer;
  user-select: none;
}

#integrity-removed-coins tr.selected td {
  background: rgb(var(--accent-rgb) / 0.12);
}

#integrity-removed-coins tr.selected td:first-child {
  border-left-color: var(--accent);
}
</style>
