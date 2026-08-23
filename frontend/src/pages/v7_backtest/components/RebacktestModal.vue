<script setup lang="ts">
/**
 * RebacktestModal — the shared parameter popup of rebacktestSelected
 * (:7895-7956), rebacktestSelectedArchive (:7989-8040) and
 * rebacktestSelectedLegacy (:8192-8250): start/end dates, the balance
 * stepper (:7903-7905), the exchange multi-select and the
 * pbgui-market-data toggle.
 */
import { PhFolderOpen, PhMinus, PhPlus } from '@phosphor-icons/vue';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { onToggleMultiSelectMousedown } from '../composables/useToggleMultiSelect';
import type { RebacktestFields } from '../types';

const props = defineProps<{
  open: boolean;
  defaults: RebacktestFields | null;
}>();

const emit = defineEmits<{ confirm: [fields: RebacktestFields]; close: []; error: [message: string] }>();

const { t } = useI18n();

const ALL_EXCHANGES = ['binance', 'bybit', 'bitget', 'okx', 'hyperliquid', 'kucoin', 'combined'];

const start = ref('2020-01-01');
const end = ref('');
const balance = ref('1000');
const exchanges = ref<string[]>([]);
const usePbguiData = ref(false);

watch(
  () => [props.open, props.defaults] as const,
  () => {
    if (!props.open || !props.defaults) return;
    start.value = props.defaults.start;
    end.value = props.defaults.end;
    balance.value = String(props.defaults.balance);
    // legacy selects only the configured exchanges (:7986-7988) — an empty
    // config leaves nothing preselected and the confirm gate fires
    const configured = props.defaults.exchanges.filter((exchange) => ALL_EXCHANGES.includes(exchange));
    exchanges.value = configured;
    usePbguiData.value = props.defaults.usePbguiData;
  },
  { immediate: true }
);

function adjustBalance(delta: number): void {
  const next = Math.max(1, (Number.parseFloat(balance.value) || 0) + delta); // :7904
  balance.value = String(next);
}

function onConfirm(): void {
  if (exchanges.value.length === 0) {
    emit('error', t('v7backtest.selectAtLeastOneExchange')); // :7926
    return;
  }
  emit('confirm', {
    start: start.value.trim(),
    end: end.value.trim(),
    balance: Number.parseFloat(balance.value) || 1000,
    exchanges: exchanges.value.slice(),
    usePbguiData: usePbguiData.value,
  });
  emit('close');
}
</script>

<template>
  <div v-if="open && defaults" id="modal-root" data-test="rebacktest-modal">
    <div class="modal-box">
      <h3>{{ t('v7backtest.selectBacktestParams') }}</h3>
      <div class="modal-body">
        <div style="display: flex; flex-direction: column; gap: var(--sp-md); height: 100%; min-width: 0">
          <div>
            <div class="sb-label">start_date</div>
            <input v-model="start" class="sb-input" type="text" data-test="rbt-start" />
          </div>
          <div>
            <div class="sb-label">end_date</div>
            <input v-model="end" class="sb-input" type="text" data-test="rbt-end" />
          </div>
          <div>
            <div class="sb-label">{{ t('v7backtest.startingBalance') }}</div>
            <div style="display: flex; align-items: center; gap: var(--sp-xs)">
              <input v-model="balance" class="sb-input" style="flex: 1; text-align: right" type="number" min="1" step="100" data-test="rbt-balance" />
              <button type="button" class="act-btn" style="width: 28px; padding: 0" data-test="rbt-balance-minus" aria-label="Decrease starting balance" title="Decrease starting balance" @click="adjustBalance(-100)"><PbIcon :icon="PhMinus" /></button>
              <button type="button" class="act-btn" style="width: 28px; padding: 0" data-test="rbt-balance-plus" aria-label="Increase starting balance" title="Increase starting balance" @click="adjustBalance(100)"><PbIcon :icon="PhPlus" /></button>
            </div>
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; min-height: 60px">
            <div class="sb-label">{{ t('v7backtest.exchanges') }}</div>
            <select v-model="exchanges" class="sb-input" multiple style="flex: 1; height: auto; min-height: var(--input-h)" data-test="rbt-exchanges" @mousedown="onToggleMultiSelectMousedown">
              <option v-for="exchange in ALL_EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: var(--sp-sm)">
            <input id="rbt-pbgui-data" v-model="usePbguiData" type="checkbox" style="width: auto; margin: 0" data-test="rbt-pbgui-data" />
            <label for="rbt-pbgui-data" style="font-size: var(--fs-sm); cursor: pointer"><PbIcon :icon="PhFolderOpen" /> {{ t('v7backtest.usePbguiMarketData') }}</label>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" data-test="rbt-ok" @click="onConfirm">{{ t('common.ok') }}</button>
      </div>
    </div>
  </div>
</template>
