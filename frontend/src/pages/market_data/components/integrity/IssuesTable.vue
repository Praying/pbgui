<script setup lang="ts">
/*
 * The repair queue — the #integrity-issues card
 * (market_data_main.html:3297-3315): issue rows grouped per coin
 * (:4409-4488) with the Details (gap modal) and Repair coin actions
 * (:9178-9197). canRepair is hardcoded true in legacy (:4471) — the
 * read-only branch stays unported.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { noteClass, panelCardClass, panelHeadClass } from '../../lib/uiClasses';
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

const thClass =
  'sticky top-0 z-[1] border-b-2 border-border-default bg-panel p-2 text-left';
const tdClass =
  'border-l-[3px] border-l-transparent border-b border-border-default p-2';
</script>

<template>
  <article :class="panelCardClass">
    <div :class="panelHeadClass">
      <div>
        <div class="eyebrow">{{ t('market.damagedDays') }}</div>
        <h3>{{ t('market.repairQueue') }}</h3>
        <p :class="noteClass" id="integrity-issues-note">{{ t('market.repairQueueNote') }}</p>
      </div>
      <div class="panel-actions">
        <span :class="noteClass" id="integrity-issue-count">{{ store.issueCountText.value }}</span>
        <Button
          variant="primary"
          id="btn-integrity-repair-all"
          type="button"
          :disabled="store.repairAllDisabled.value"
          @click="store.queueRepairAll()"
        >
          {{ t('market.repairAll') }}
        </Button>
      </div>
    </div>
    <div class="integrity-table-wrap max-h-[52dvh] overflow-auto rounded-md border border-border-default">
      <table class="integrity-table w-full border-collapse max-[760px]:min-w-[720px]">
        <thead>
          <tr>
            <th :class="thClass">{{ t('market.exchange') }}</th>
            <th :class="thClass">{{ t('market.coin') }}</th>
            <th :class="thClass">{{ t('market.damagedDays') }}</th>
            <th :class="thClass">{{ t('market.dateRange') }}</th>
            <th :class="thClass">{{ t('market.missing') }}</th>
            <th :class="thClass">{{ t('market.reasons') }}</th>
            <th :class="thClass">{{ t('market.action') }}</th>
          </tr>
        </thead>
        <tbody id="integrity-issues">
          <tr v-if="!store.issueGroups.value.length">
            <td class="integrity-empty p-5" colspan="7">{{ store.issuesEmptyText.value }}</td>
          </tr>
          <template v-else>
            <tr v-for="row in store.issueGroups.value" :key="`${row.exchange}/${row.coin}`">
            <td :class="tdClass">{{ row.exchange }}</td>
            <td :class="tdClass">{{ row.coin }}</td>
            <td :class="tdClass">{{ row.days }}</td>
            <td :class="tdClass">{{ dateRange(row) }}</td>
            <td :class="tdClass">{{ row.missing }}</td>
            <td :class="tdClass">{{ reasons(row) }}</td>
            <td :class="tdClass">
              <div class="integrity-action-group flex flex-wrap gap-1">
                <Button
                  variant="info"
                  type="button"
                  data-integrity-gap-details="1"
                  :data-exchange="row.exchange"
                  :data-coin="row.coin"
                  @click="store.openGapDetails(row.exchange, row.coin)"
                >
                  {{ t('market.details') }}
                </Button>
                <Button
                  variant="info"
                  type="button"
                  data-integrity-repair-coin="1"
                  :data-exchange="row.exchange"
                  :data-coin="row.coin"
                  @click="store.queueRepairCoin(row.exchange, row.coin)"
                >
                  {{ t('market.repairCoin') }}
                </Button>
              </div>
            </td>
          </tr>
          </template>
        </tbody>
      </table>
    </div>
  </article>
</template>
