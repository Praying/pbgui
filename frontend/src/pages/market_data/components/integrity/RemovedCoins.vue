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
</script>

<template>
  <article class="panel-card" id="integrity-removed-card">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.removedMarkets') }}</div>
        <h3>{{ t('market.unavailableCoinData') }}</h3>
        <p class="note" id="integrity-removed-note">{{ store.removedNoteText.value }}</p>
      </div>
      <div class="panel-actions">
        <span class="note" id="integrity-removed-count">{{ store.removedCountText.value }}</span>
        <button
          class="btn danger"
          id="btn-integrity-remove-selected"
          type="button"
          :disabled="store.removeSelectedDisabled.value"
          @click="store.removeSelectedRemovedCoins()"
        >
          {{ store.removeSelectedLabelText.value }}
        </button>
        <button
          class="btn danger"
          id="btn-integrity-remove-all"
          type="button"
          :disabled="store.removeAllDisabled.value"
          @click="store.removeAllRemovedCoins()"
        >
          {{ t('market.removeAll') }}
        </button>
      </div>
    </div>
    <div class="integrity-table-wrap">
      <table class="integrity-table">
        <thead>
          <tr>
            <th>{{ t('market.exchange') }}</th>
            <th>{{ t('market.coin') }}</th>
            <th>{{ t('market.files') }}</th>
            <th>{{ t('market.size') }}</th>
            <th>{{ t('market.from') }}</th>
            <th>{{ t('market.to') }}</th>
            <th>{{ t('market.status') }}</th>
            <th>{{ t('market.action') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-removed-coins" @mousemove="store.handleRemovedTableMouseMove($event)">
          <tr v-if="!store.removedRows.value.length">
            <td class="integrity-empty" colspan="8">{{ store.removedEmptyMessage.value }}</td>
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
            <td>{{ row.exchange }}</td>
            <td>{{ row.coin }}</td>
            <td>{{ row.files }}</td>
            <td>{{ row.size }}</td>
            <td>{{ row.fromDay }}</td>
            <td>{{ row.toDay }}</td>
            <td>{{ row.reason }}</td>
            <td>
              <button
                v-if="row.removable"
                class="btn danger"
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
