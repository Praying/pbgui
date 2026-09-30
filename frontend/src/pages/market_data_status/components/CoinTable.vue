<script setup lang="ts">
/*
 * Coin table (legacy mds-coin-table-container, market_data_status.html:293-318
 * and updateCoinTable :475-499):
 *   - before the first market_data_status frame: ⏳ waiting empty state
 *   - frame with no rows: 📊 no-coin empty state
 *   - rows: strong coin · de-DE last fetch · result accent class ·
 *     lookback/minutes/newest (falsy → '') · formatted next-run ·
 *     ellipsized note with a title tooltip
 */
import { useI18n } from 'vue-i18n';
import { PhChartBar, PhHourglass } from '@phosphor-icons/vue';
import { EmptyRow } from '@/shared/components/ui/table';
import { formatNextRun, formatTimestamp, resultClass } from '../format';
import type { CoinRow } from '../types';

defineProps<{ rows: CoinRow[]; received: boolean }>();

const { t } = useI18n();

function dashIfFalsy(value: string | number): string {
  return String(value || '');
}
</script>

<template>
  <div class="mds-coin-table-container">
    <div class="mds-table-wrapper">
      <table>
        <thead>
          <tr>
            <th>{{ t('misc.mds.coin') }}</th>
            <th>{{ t('misc.mds.lastFetch') }}</th>
            <th>{{ t('misc.mds.result') }}</th>
            <th>{{ t('misc.mds.lookbackDays') }}</th>
            <th>{{ t('misc.mds.minutesWritten') }}</th>
            <th>{{ t('misc.mds.newestDay') }}</th>
            <th>{{ t('misc.mds.nextRunS') }}</th>
            <th>{{ t('misc.mds.note') }}</th>
          </tr>
        </thead>
        <tbody>
          <EmptyRow
            v-if="rows.length === 0"
            size="inline"
            colspan="8"
            :icon="received ? PhChartBar : PhHourglass"
            :title="received ? t('misc.mds.noCoinStatusAvailable') : t('misc.mds.waitingForStatus')"
          />
          <tr v-for="row in rows" v-else :key="row.coin">
            <td><strong>{{ row.coin }}</strong></td>
            <td>{{ formatTimestamp(row.last_fetch || '') }}</td>
            <td :class="resultClass(row.result)">{{ row.result }}</td>
            <td>{{ dashIfFalsy(row.lookback_days) }}</td>
            <td>{{ dashIfFalsy(row.minutes_written) }}</td>
            <td>{{ dashIfFalsy(row.newest_day) }}</td>
            <td>{{ formatNextRun(row.next_run_in_s, t('misc.mds.ready')) }}</td>
            <td class="mds-note-cell" :title="row.note">{{ row.note }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Ported from .mds-root .mds-coin-table-container … (market_data_status.html:159-243). */
.mds-coin-table-container {
  width: 100%;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-default);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.mds-table-wrapper {
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: auto;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  position: sticky;
  top: 0;
  background: var(--bg-card);
  z-index: 2;
}

th {
  padding: var(--sp-sm) var(--sp-md);
  text-align: left;
  font-weight: 600;
  color: var(--text-primary);
  border-bottom: 2px solid var(--border-default);
  font-size: var(--text-sm);
  text-transform: uppercase;
  letter-spacing: var(--tracking-label);
  white-space: nowrap;
}

td {
  padding: var(--sp-sm) var(--sp-md);
  border-bottom: 1px solid var(--border-subtle);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

tbody tr:hover {
  background: var(--surface-hover);
}

.mds-result-success {
  color: var(--success);
  font-weight: 500;
}

.mds-result-error {
  color: var(--danger);
  font-weight: 500;
}

.mds-note-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--warning);
}

</style>
