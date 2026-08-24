<script setup lang="ts">
/*
 * The reference-differences table — the #integrity-differences card
 * (market_data_main.html:3317-3332, rows :4490-4518).
 */
import { useI18n } from 'vue-i18n';
import { noteClass, panelCardClass, panelHeadClass } from '../../lib/uiClasses';
import type { IntegrityController } from '../../composables/useIntegrity';

defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

const thClass =
  'sticky top-0 z-[1] border-b-2 border-border-default bg-panel p-2 text-left';
</script>

<template>
  <article :class="panelCardClass">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.referenceDifferences') }}</div>
        <h3>{{ t('market.localVsPublic') }}</h3>
        <p :class="noteClass">{{ t('market.referenceDiffNote') }}</p>
      </div>
      <span :class="noteClass" id="integrity-difference-count">{{ store.differenceCountText.value }}</span>
    </div>
    <div class="integrity-table-wrap max-h-[52vh] overflow-auto rounded-md border border-border-default">
      <table class="integrity-table w-full border-collapse max-[760px]:min-w-[720px]">
        <thead>
          <tr>
            <th :class="thClass">{{ t('market.kind') }}</th>
            <th :class="thClass">{{ t('market.exchange') }}</th>
            <th :class="thClass">{{ t('market.coin') }}</th>
            <th :class="thClass">{{ t('market.day') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-differences">
          <tr v-if="!store.differences.value.length">
            <td class="integrity-empty p-5" colspan="4">{{ store.differencesEmptyText.value }}</td>
          </tr>
          <template v-else>
            <tr v-for="(row, index) in store.differences.value" :key="index">
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ row.kind }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ row.exchange }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ row.coin }}</td>
              <td class="border-l-[3px] border-l-transparent border-b border-border-default p-2">{{ row.day }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </article>
</template>
