<script setup lang="ts">
/**
 * Inline balance-calculation modal — v7_edit.html:1156-1170 markup and
 * calculateBalance (:3825-3901): POST the collected config to
 * /api/balance-calc/calculate, render the recommendation + the top-5 most
 * restrictive coins per side. (legacy bcApply :3815-3823 was dead code —
 * the modal never rendered an Apply button.)
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { useEditPageContext } from '../composables/useEditPage';
import { requestBalanceCalculation } from '../composables/useDraftHandoffs';
import { serverMsg } from '@/shared/i18n';

interface BalanceRow {
  readonly coin: string;
  readonly balance: number | string;
}

interface BalanceCalcResult {
  readonly recommendation?: {
    side: string;
    symbol: string;
    min_order_price: number | string;
    total_wallet_exposure_limit: number | string;
    n_positions: number | string;
    entry_initial_qty_pct: number | string;
    calculated_balance: number | string;
    recommended_balance: number;
  } | null;
  readonly exchange?: string;
  readonly error?: string;
  readonly balance_long?: BalanceRow[];
  readonly balance_short?: BalanceRow[];
}

const { t } = useI18n();
const page = useEditPageContext();

const open = defineModel<boolean>({ required: true });
const loading = ref(false);
const errorText = ref('');
const data = ref<BalanceCalcResult | null>(null);
let recommended = 0;

async function calculate(): Promise<void> {
  if (!page.validateForSave()) return;
  errorText.value = '';
  data.value = null;
  recommended = 0;
  const exchange = page.selectedUserExchange();
  if (!exchange) {
    errorText.value = t('v7run.cannotDetermineExchange');
    return;
  }
  loading.value = true;
  try {
    data.value = (await requestBalanceCalculation({
      apiBase: page.apiBaseOf(),
      config: page.collect(),
      exchange,
    })) as BalanceCalcResult;
    if (data.value.error) {
      errorText.value = serverMsg(data.value.error);
      data.value = null;
      return;
    }
    if (data.value.recommendation) recommended = data.value.recommendation.recommended_balance;
  } catch (e) {
    errorText.value = t('v7run.requestFailed') + ': ' + (e instanceof Error ? e.message : String(e));
  } finally {
    loading.value = false;
  }
}

async function show(): Promise<void> {
  open.value = true;
  await calculate();
}

defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-backdrop" id="bc-modal" @mousedown.self="open = false">
      <div class="flex w-[90%] max-w-[800px] max-h-[80dvh] flex-col gap-3 rounded-lg border border-border-default bg-panel p-5" style="max-width: 560px">
        <h3 class="text-lg">{{ t('v7run.calculateBalance') }}</h3>
        <div v-if="loading" class="text-secondary text-sm mb-3">
          {{ t('v7run.calculating') }}
        </div>
        <template v-if="data">
          <div
            style="background: var(--bg3); border: 1px solid var(--border); border-radius: 6px; padding: var(--sp-md); margin-bottom: var(--sp-md); font-size: var(--fs-sm)"
          >
            <template v-if="data.recommendation">
              <div>&#x2705; {{ t('v7run.bcRecommendation', { side: data.recommendation.side }) }} — <strong>{{ data.exchange || '?' }}</strong></div>
              <div><strong>{{ t('v7run.bcLimitingSymbol') }}</strong> {{ data.recommendation.symbol }}</div>
              <div><strong>{{ t('v7run.bcMinOrderPrice') }}</strong> {{ data.recommendation.min_order_price }}</div>
              <div>
                <strong>{{ t('v7run.bcTwe') }}</strong> {{ data.recommendation.total_wallet_exposure_limit }}
                &nbsp; <strong>{{ t('v7run.bcNpositions') }}</strong> {{ data.recommendation.n_positions }}
                &nbsp; <strong>{{ t('v7run.bcEntryInitialQty') }}</strong> {{ data.recommendation.entry_initial_qty_pct }}
              </div>
              <div><strong>{{ t('v7run.bcCalculatedBalance') }}</strong> {{ data.recommendation.calculated_balance }} USDT</div>
              <div><strong class="text-success">{{ t('v7run.bcRecommendedBalance') }} {{ data.recommendation.recommended_balance }} USDT</strong></div>
            </template>
            <template v-else>&#x26A0;&#xFE0F; {{ t('v7run.bcNoRecommendation', { exchange: data.exchange || '?' }) }}</template>
          </div>
          <div class="text-xs text-secondary">
            <template v-if="data.balance_long?.length">
              <div><strong>{{ t('v7run.bcTopCoinsLong') }}</strong></div>
              <div v-for="row in data.balance_long.slice(0, 5)" :key="'l' + row.coin">&nbsp;&nbsp;{{ row.coin }}: {{ row.balance }} USDT</div>
            </template>
            <template v-if="data.balance_short?.length">
              <div><strong>{{ t('v7run.bcTopCoinsShort') }}</strong></div>
              <div v-for="row in data.balance_short.slice(0, 5)" :key="'s' + row.coin">&nbsp;&nbsp;{{ row.coin }}: {{ row.balance }} USDT</div>
            </template>
          </div>
        </template>
        <div v-if="errorText" class="text-danger text-sm">{{ errorText }}</div>
        <div class="flex justify-end gap-2">
          <Button type="button" @click="open = false">{{ t('common.close') }}</Button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
