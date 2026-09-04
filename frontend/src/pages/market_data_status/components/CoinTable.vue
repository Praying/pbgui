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
import PbIcon from '@/shared/components/PbIcon.vue';
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
          <tr v-if="rows.length === 0">
            <td colspan="8" class="mds-empty-state">
              <div v-if="!received" class="mds-empty-state-icon flex justify-center"><PbIcon :icon="PhHourglass" :size="42" /></div>
              <div v-else class="mds-empty-state-icon flex justify-center"><PbIcon :icon="PhChartBar" :size="42" /></div>
              <div v-if="!received">{{ t('misc.mds.waitingForStatus') }}</div>
              <div v-else>{{ t('misc.mds.noCoinStatusAvailable') }}</div>
            </td>
          </tr>
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
  background: var(--mds-bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--mds-border-color);
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
  background: var(--mds-bg-tertiary);
  z-index: 10;
}

th {
  padding: 0.6rem 0.75rem;
  text-align: left;
  font-weight: 600;
  color: var(--mds-text-primary);
  border-bottom: 2px solid var(--mds-border-color);
  font-size: var(--fs-sm);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

td {
  padding: 0.6rem 0.75rem;
  border-bottom: 1px solid var(--mds-border-color);
  font-size: var(--fs-sm);
  color: var(--mds-text-secondary);
}

tbody tr:hover {
  background: var(--mds-bg-tertiary);
}

.mds-result-success {
  color: var(--mds-accent-success);
  font-weight: 500;
}

.mds-result-error {
  color: var(--mds-accent-danger);
  font-weight: 500;
}

.mds-note-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-sm);
  color: var(--mds-accent-warning);
}

.mds-empty-state {
  padding: 3rem;
  text-align: center;
  color: var(--mds-text-secondary);
}

.mds-empty-state-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.3;
}
</style>
