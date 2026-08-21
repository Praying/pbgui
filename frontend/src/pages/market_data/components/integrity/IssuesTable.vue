<script setup lang="ts">
/*
 * The repair queue — the #integrity-issues card
 * (market_data_main.html:3297-3315): issue rows grouped per coin
 * (:4409-4488) with the Details (gap modal) and Repair coin actions
 * (:9178-9197). canRepair is hardcoded true in legacy (:4471) — the
 * read-only branch stays unported.
 */
import { useI18n } from 'vue-i18n';
import type { IntegrityController } from '../../composables/useIntegrity';
import type { IssueGroup } from '../../lib/integrityView';

const props = defineProps<{
  store: IntegrityController;
}>();

const { t } = useI18n();

/** Date range cell (:4451). */
function dateRange(row: IssueGroup): string {
  return row.oldest === row.latest ? row.latest : t('market.dateRangeTo', { oldest: row.oldest, latest: row.latest });
}

/** Reasons cell (:4452-4454) — `3x checksum mismatch; 1x candle count`. */
function reasons(row: IssueGroup): string {
  return Object.keys(row.reasons)
    .map((reason) => `${String(row.reasons[reason])}x ${reason}`)
    .join('; ');
}
</script>

<template>
  <article class="panel-card">
    <div class="panel-head">
      <div>
        <div class="eyebrow">{{ t('market.damagedDays') }}</div>
        <h3>{{ t('market.repairQueue') }}</h3>
        <p class="note" id="integrity-issues-note">{{ t('market.repairQueueNote') }}</p>
      </div>
      <div class="panel-actions">
        <span class="note" id="integrity-issue-count">{{ store.issueCountText.value }}</span>
        <button
          class="btn pbgui-btn btn-primary primary"
          id="btn-integrity-repair-all"
          type="button"
          :disabled="store.repairAllDisabled.value"
          @click="store.queueRepairAll()"
        >
          {{ t('market.repairAll') }}
        </button>
      </div>
    </div>
    <div class="integrity-table-wrap">
      <table class="integrity-table">
        <thead>
          <tr>
            <th>{{ t('market.exchange') }}</th>
            <th>{{ t('market.coin') }}</th>
            <th>{{ t('market.damagedDays') }}</th>
            <th>{{ t('market.dateRange') }}</th>
            <th>{{ t('market.missing') }}</th>
            <th>{{ t('market.reasons') }}</th>
            <th>{{ t('market.action') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-issues">
          <tr v-if="!store.issueGroups.value.length">
            <td class="integrity-empty" colspan="7">{{ store.issuesEmptyText.value }}</td>
          </tr>
          <template v-else>
            <tr v-for="row in store.issueGroups.value" :key="`${row.exchange}/${row.coin}`">
            <td>{{ row.exchange }}</td>
            <td>{{ row.coin }}</td>
            <td>{{ row.days }}</td>
            <td>{{ dateRange(row) }}</td>
            <td>{{ row.missing }}</td>
            <td>{{ reasons(row) }}</td>
            <td>
              <div class="integrity-action-group">
                <button
                  class="btn pbgui-btn btn-secondary secondary"
                  type="button"
                  data-integrity-gap-details="1"
                  :data-exchange="row.exchange"
                  :data-coin="row.coin"
                  @click="store.openGapDetails(row.exchange, row.coin)"
                >
                  {{ t('market.details') }}
                </button>
                <button
                  class="btn pbgui-btn btn-secondary secondary"
                  type="button"
                  data-integrity-repair-coin="1"
                  :data-exchange="row.exchange"
                  :data-coin="row.coin"
                  @click="store.queueRepairCoin(row.exchange, row.coin)"
                >
                  {{ t('market.repairCoin') }}
                </button>
              </div>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
  </article>
</template>
