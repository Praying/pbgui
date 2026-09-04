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
    <div class="msg-error rounded-md border border-danger bg-danger/10 px-3 py-2 text-sm text-danger">{{ feedback.message }}</div>
  </template>
  <template v-else-if="results && hasContent">
    <div v-if="results.exchange" class="result-card mb-2 rounded-lg border border-border-default bg-panel px-4 py-2">
      <strong>{{ t('misc.balance.exchange') }}</strong> {{ results.exchange }}
    </div>

    <div v-if="results.recommendation" class="result-card rounded-lg border border-border-default bg-panel p-3">
      <h3 class="mb-2 text-md text-accent">{{ t('misc.balance.recommendedBalance', { symbol: results.recommendation.symbol, side: results.recommendation.side }) }}</h3>
      <div class="text-title font-extrabold text-success">{{ results.recommendation.recommended_balance }} USDT</div>
      <div class="mt-2">
        <div v-for="row in recRows" :key="row.label" class="flex justify-between py-0.5 text-sm">
          <span class="text-secondary">{{ row.label }}</span>
          <span class="font-semibold">{{ row.value }}</span>
        </div>
      </div>
      <div class="mt-1 text-sm text-secondary font-mono">min_order_price / ((twe_limit / n_positions) * entry_initial_qty_pct)</div>
      <div class="mt-1 text-sm text-secondary font-mono">{{
        results.recommendation.min_order_price.toFixed(2) + ' / ((' +
        results.recommendation.total_wallet_exposure_limit.toFixed(2) + ' / ' + results.recommendation.n_positions +
        ') * ' + results.recommendation.entry_initial_qty_pct.toFixed(4) + ') = ' + results.recommendation.calculated_balance.toFixed(2)
      }}</div>
    </div>

    <div v-if="results.balance_long && results.balance_long.length" class="result-card rounded-lg border border-border-default bg-panel p-3">
      <h3 class="mb-2 text-md text-accent">{{ t('misc.balance.balanceLong') }}</h3>
      <div class="max-h-[300px] overflow-y-auto rounded-md border border-border-default">
        <table class="w-full border-collapse text-sm">
          <thead><tr class="group"><th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.coin') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.requiredBalance') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in results.balance_long" :key="row.coin">
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ row.coin }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ row.balance.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="results.balance_short && results.balance_short.length" class="result-card rounded-lg border border-border-default bg-panel p-3">
      <h3 class="mb-2 text-md text-accent">{{ t('misc.balance.balanceShort') }}</h3>
      <div class="max-h-[300px] overflow-y-auto rounded-md border border-border-default">
        <table class="w-full border-collapse text-sm">
          <thead><tr class="group"><th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.coin') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.requiredBalance') }}</th></tr></thead>
          <tbody>
            <tr v-for="row in results.balance_short" :key="row.coin">
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ row.coin }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ row.balance.toFixed(2) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="results.coin_infos && results.coin_infos.length" class="result-card rounded-lg border border-border-default bg-panel p-3">
      <h3 class="mb-2 text-md text-accent">{{ t('misc.balance.coinInfo') }}</h3>
      <div class="max-h-[300px] overflow-y-auto rounded-md border border-border-default">
        <table class="w-full border-collapse text-sm">
          <thead>
            <tr class="group">
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.coin') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.price') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.contract') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.minAmount') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.minCost') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.minOrderPrice') }}</th>
              <th class="sticky top-0 border-b-2 border-border-default bg-panel px-2 py-1 text-left font-bold text-secondary">{{ t('misc.balance.maxLev') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="coin in results.coin_infos" :key="coin.coin">
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.coin }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ fmtPrice(coin.currentPrice) }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.contractSize }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.min_amount }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.min_cost }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.min_order_price }}</td>
              <td class="border-b border-border-default px-2 py-1 group-hover:bg-accent/5">{{ coin.max_lev || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </template>
  <template v-else>
    <div class="msg-info rounded-md border border-accent bg-accent/8 px-3 py-2 text-sm text-accent">
      <span v-if="feedback && feedback.kind === 'info' && feedback.message">{{ feedback.message }}</span>
      <template v-else-if="results && !hasContent">{{ t('misc.balance.noResults') }}</template>
      <template v-else>{{ t('misc.balance.intro') }} <b>{{ t('misc.balance.calculate') }}</b>.</template>
    </div>
  </template>
</template>
