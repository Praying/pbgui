<script setup lang="ts">
/*
 * The reference-differences table — the #integrity-differences card
 * (market_data_main.html:3317-3332, rows :4490-4518).
 */
import { useI18n } from 'vue-i18n';
import type { IntegrityController } from '../../composables/useIntegrity';

defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="panel-card">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.referenceDifferences') }}</div>
        <h3>{{ t('market.localVsPublic') }}</h3>
        <p class="note">{{ t('market.referenceDiffNote') }}</p>
      </div>
      <span class="note" id="integrity-difference-count">{{ store.differenceCountText.value }}</span>
    </div>
    <div class="integrity-table-wrap">
      <table class="integrity-table">
        <thead>
          <tr>
            <th>{{ t('market.kind') }}</th>
            <th>{{ t('market.exchange') }}</th>
            <th>{{ t('market.coin') }}</th>
            <th>{{ t('market.day') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-differences">
          <tr v-if="!store.differences.value.length">
            <td class="integrity-empty" colspan="4">{{ store.differencesEmptyText.value }}</td>
          </tr>
          <template v-else>
            <tr v-for="(row, index) in store.differences.value" :key="index">
              <td>{{ row.kind }}</td>
              <td>{{ row.exchange }}</td>
              <td>{{ row.coin }}</td>
              <td>{{ row.day }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </article>
</template>
