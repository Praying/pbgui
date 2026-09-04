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
import { Button } from '@/shared/components/ui/button';
import { computed } from 'vue';
import { useEscapeClose } from '@/shared/composables/useEscapeClose';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { onToggleMultiSelectMousedown } from '../composables/useToggleMultiSelect';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import type { RebacktestFields } from '../types';

const props = defineProps<{
  open: boolean;
  defaults: RebacktestFields | null;
}>();

const emit = defineEmits<{ confirm: [fields: RebacktestFields]; close: []; error: [message: string] }>();

/* Escape-close parity with the shared Modal (this dialog keeps legacy
   modal-* classes for the parity tests, so it stays hand-rolled). */
const dialogOpen = computed(() => props.open);
useEscapeClose(dialogOpen, () => emit('close'));


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
  <div v-if="open && defaults" id="modal-root" :class="modalBackdropClass" data-test="rebacktest-modal">
    <div :class="modalBoxClass">
      <h3>{{ t('v7backtest.selectBacktestParams') }}</h3>
      <div class="min-h-0 flex-1 overflow-auto">
        <div style="display: flex; flex-direction: column; gap: var(--sp-md); height: 100%; min-width: 0">
          <div>
            <div class="text-xs uppercase tracking-[0.5px] text-secondary">start_date</div>
            <Input v-model="start" type="text" data-test="rbt-start" />
          </div>
          <div>
            <div class="text-xs uppercase tracking-[0.5px] text-secondary">end_date</div>
            <Input v-model="end" type="text" data-test="rbt-end" />
          </div>
          <div>
            <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.startingBalance') }}</div>
            <div class="flex items-center gap-1">
              <Input v-model="balance" class="text-right" type="number" min="1" step="100" data-test="rbt-balance" />
              <Button type="button" variant="default" class="act-btn h-auto" style="width: 28px; padding: 0" data-test="rbt-balance-minus" aria-label="Decrease starting balance" title="Decrease starting balance" @click="adjustBalance(-100)"><PbIcon :icon="PhMinus" /></Button>
              <Button type="button" variant="default" class="act-btn h-auto" style="width: 28px; padding: 0" data-test="rbt-balance-plus" aria-label="Increase starting balance" title="Increase starting balance" @click="adjustBalance(100)"><PbIcon :icon="PhPlus" /></Button>
            </div>
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; min-height: 60px">
            <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.exchanges') }}</div>
            <!-- ui-migration: blocked — the reka listbox is single-value; the
                 legacy multi-select (ctrl-free toggle via useToggleMultiSelect)
                 stays native. -->
            <select v-model="exchanges" class="sb-input" multiple style="flex: 1; height: auto; min-height: var(--input-h)" data-test="rbt-exchanges" @mousedown="onToggleMultiSelectMousedown">
              <option v-for="exchange in ALL_EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</option>
            </select>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox id="rbt-pbgui-data" v-model="usePbguiData" class="m-0" data-test="rbt-pbgui-data" />
            <label for="rbt-pbgui-data" class="text-sm cursor-pointer"><PbIcon :icon="PhFolderOpen" /> {{ t('v7backtest.usePbguiMarketData') }}</label>
          </div>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="primary" class="modal-btn" data-test="rbt-ok" @click="onConfirm">{{ t('common.ok') }}</Button>
      </div>
    </div>
  </div>
</template>
