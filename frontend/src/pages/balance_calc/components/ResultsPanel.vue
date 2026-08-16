<script setup lang="ts">
/*
 * The results panel — renderResults (:406-483) as a template: the exchange
 * header card, the recommendation card with its formula lines, the balance
 * long/short tables, the coin-info table, and the error/info messages. Every
 * value renders through interpolation (the legacy esc() wrapper's job).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CalcFeedback, CalcResults } from '../composables/useBalanceCalc';
import { fmtPrice } from '../lib/format';

const props = defineProps<{
  results: CalcResults | null;
  feedback: CalcFeedback;
}>();

const { t } = useI18n();

const hasContent = computed(() => {
  const data = props.results;
  if (!data) return false;
  return Boolean(
    data.exchange || data.recommendation || data.balance_long?.length || data.balance_short?.length || data.coin_infos?.length
  );
});

function paramRow(label: string, value: string | number): { label: string; value: string } {
  return { label, value: String(value) };
}

/** The recommendation card's parameter rows (:423-429). */
const recRows = computed(() => {
  const rec = props.results?.recommendation;
  if (!rec) return [];
  return [
    paramRow(t('misc.balance.minOrderPrice'), rec.min_order_price.toFixed(2)),
    paramRow(t('misc.balance.tweLimit'), rec.total_wallet_exposure_limit.toFixed(2)),
    paramRow(t('misc.balance.nPositions'), rec.n_positions),
    paramRow(t('misc.balance.entryInitialQtyPct'), rec.entry_initial_qty_pct.toFixed(4)),
    paramRow(t('misc.balance.calculated'), rec.calculated_balance.toFixed(2) + ' USDT'),
    paramRow(t('misc.balance.recommendedPct'), rec.recommended_balance + ' USDT'),
  ];
});
</script>

<template>
  <template v-if="feedback && feedback.kind === 'error'">
    <div class="msg-error">{{ feedback.message }}</div>
  </template>
  <template v-else-if="results && hasContent">
    <div v-if="results.exchange" class="result-card" style="padding:8px 16px;margin-bottom:8px">
      <strong>{{ t('misc.balance.exchange') }}</strong> {{ results.exchange }}
    </div>

    <div v-if="results.recommendation" class="result-card">
      <h3>{{ t('misc.balance.recommendedBalance', { symbol: results.recommendation.symbol, side: results.recommendation.side }) }}</h3>
      <div class="value">{{ results.recommendation.recommended_balance }} USDT</div>
      <div style="margin-top:8px">
        <div v-for="row in recRows" :key="row.label" class="param-row">
          <span class="param-label">{{ row.label }}</span>
          <span class="param-value">{{ row.value }}</span>
        </div>
      </div>
      <div class="formula">min_order_price / ((twe_limit / n_positions) * entry_initial_qty_pct)</div>
      <div class="formula">{{
        results.recommendation.min_order_price.toFixed(2) + ' / ((' +
        results.recommendation.total_wallet_exposure_limit.toFixed(2) + ' / ' + results.recommendation.n_positions +
        ') * ' + results.recommendation.entry_initial_qty_pct.toFixed(4) + ') = ' + results.recommendation.calculated_balance.toFixed(2)
      }}</div>
    </div>

    <div v-if="results.balance_long && results.balance_long.length" class="result-card">
      <h3>{{ t('misc.balance.balanceLong') }}</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>{{ t('misc.balance.coin') }}</th><th>{{ t('misc.balance.requiredBalance') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in results.balance_long" :key="row.coin">
              <td>{{ row.coin }}</td>
              <td>{{ row.balance.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="results.balance_short && results.balance_short.length" class="result-card">
      <h3>{{ t('misc.balance.balanceShort') }}</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>{{ t('misc.balance.coin') }}</th><th>{{ t('misc.balance.requiredBalance') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in results.balance_short" :key="row.coin">
              <td>{{ row.coin }}</td>
              <td>{{ row.balance.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="results.coin_infos && results.coin_infos.length" class="result-card">
      <h3>{{ t('misc.balance.coinInfo') }}</h3>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ t('misc.balance.coin') }}</th>
              <th>{{ t('misc.balance.price') }}</th>
              <th>{{ t('misc.balance.contract') }}</th>
              <th>{{ t('misc.balance.minAmount') }}</th>
              <th>{{ t('misc.balance.minCost') }}</th>
              <th>{{ t('misc.balance.minOrderPrice') }}</th>
              <th>{{ t('misc.balance.maxLev') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coin in results.coin_infos" :key="coin.coin">
              <td>{{ coin.coin }}</td>
              <td>{{ fmtPrice(coin.currentPrice) }}</td>
              <td>{{ coin.contractSize }}</td>
              <td>{{ coin.min_amount }}</td>
              <td>{{ coin.min_cost }}</td>
              <td>{{ coin.min_order_price }}</td>
              <td>{{ coin.max_lev || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
  <template v-else>
    <div class="msg-info">
      <span v-if="feedback && feedback.kind === 'info' && feedback.message">{{ feedback.message }}</span>
      <template v-else-if="results && !hasContent">{{ t('misc.balance.noResults') }}</template>
      <template v-else>{{ t('misc.balance.intro') }} <b>{{ t('misc.balance.calculate') }}</b>.</template>
    </div>
  </template>
</template>
