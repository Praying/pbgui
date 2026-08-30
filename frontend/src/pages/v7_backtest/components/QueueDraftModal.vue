<script setup lang="ts">
import { PhFolderOpen, PhMinus, PhPlus } from '@phosphor-icons/vue';
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { onToggleMultiSelectMousedown } from '../composables/useToggleMultiSelect';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';

/**
 * QueueDraftModal — the port of showInitialBacktestQueueDraftModal
 * (:2062-2145): the queue-draft deep link asks for start/end/balance/
 * exchanges before enqueueing one job per item × exchange, with the
 * optional PBGui market-data path pre-fetch (:2112).
 */

const props = withDefaults(
  defineProps<{
    open: boolean;
    items: readonly { name?: string; config?: Record<string, unknown>; override_configs?: Record<string, unknown> }[];
    /** settings.use_pbgui_market_data — the checkbox default (:2094). */
    usePbguiMarketData?: boolean;
    fetchFn?: typeof fetch;
    /** apiFetch('/queue', …) — the page owns auth/error handling. */
    postQueue(body: unknown): Promise<unknown>;
    /** apiFetch('/pbgui_data_path') (:2112). */
    getPbguiDataPath?(): Promise<string>;
  }>(),
  { usePbguiMarketData: false, fetchFn: undefined, getPbguiDataPath: undefined }
);

const emit = defineEmits<{ queued: [count: number]; close: []; error: [message: string] }>();

const { t } = useI18n();

const ALL_EXCHANGES = ['binance', 'bybit', 'bitget', 'okx', 'hyperliquid', 'kucoin', 'combined'];

const startDate = ref('2020-01-01');
const endDate = ref('');
const balance = ref('1000');
const exchanges = ref<string[]>([]);
const usePbguiData = ref(false);

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

watch(
  () => [props.open, props.items] as const,
  () => {
    if (!props.open) return;
    const first = object(object(props.items[0]).config);
    const bt = object(first.backtest);
    const defExchanges: string[] = [];
    for (const item of props.items) {
      const itemBacktest = object(object(item).config).backtest;
      const itemExchanges = object(itemBacktest).exchanges;
      if (!Array.isArray(itemExchanges)) continue;
      for (const exchange of itemExchanges.map(String)) {
        if (ALL_EXCHANGES.includes(exchange) && !defExchanges.includes(exchange)) defExchanges.push(exchange);
      }
    }
    startDate.value = String(bt.start_date || '2020-01-01');
    endDate.value = new Date().toISOString().slice(0, 10);
    balance.value = String(bt.starting_balance || 1000);
    exchanges.value = defExchanges.filter((exchange) => ALL_EXCHANGES.includes(exchange));
    if (exchanges.value.length === 0) exchanges.value = ['bybit'];
    usePbguiData.value = props.usePbguiMarketData;
  },
  { immediate: true }
);

const exchangeOptions = computed(() => ALL_EXCHANGES);

/**
 * getInitialBacktestDraftName(cfg, null) (:1985-1992, called at :2127):
 * no draft_name param here — fall back to the base_dir's last segment
 * before the final 'rebacktest' default.
 */
function draftItemName(item: { name?: string; config?: Record<string, unknown> }): string {
  if (item.name) return String(item.name);
  const baseDir = String(object(object(item.config).backtest).base_dir ?? '').trim();
  if (!baseDir) return '';
  const parts = baseDir.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

function adjustBalance(delta: number): void {
  const next = Math.max(1, (parseFloat(balance.value) || 0) + delta);
  balance.value = String(next);
}

async function submit(): Promise<void> {
  if (exchanges.value.length === 0) {
    emit('error', t('v7backtest.selectAtLeastOneExchange'));
    return;
  }
  let pbguiPath = '';
  if (usePbguiData.value) {
    try {
      pbguiPath = props.getPbguiDataPath ? await props.getPbguiDataPath() : '';
    } catch {
      emit('error', t('v7backtest.failedGetDataPath', { msg: '' }));
      return;
    }
  }
  const bodies: unknown[] = [];
  for (const item of props.items) {
    const source = object(item).config as Record<string, unknown> | undefined;
    const cfg: Record<string, unknown> = JSON.parse(JSON.stringify(source ?? {}));
    const bt = object(cfg.backtest);
    bt.start_date = startDate.value;
    bt.end_date = endDate.value;
    bt.starting_balance = parseFloat(balance.value) || 1000;
    const scenarios = Array.isArray(bt.scenarios) ? bt.scenarios : [];
    const scenarioExchangeValues = object(scenarios[0]).exchanges;
    const scenarioExchanges =
      bt.suite_enabled === true && scenarios.length === 1 && Array.isArray(scenarioExchangeValues)
        ? scenarioExchangeValues
            .map((exchange: unknown) => String(exchange))
            .filter((exchange: string, index: number, values: string[]) => values.indexOf(exchange) === index)
        : exchanges.value;
    const itemExchanges = scenarioExchanges.filter((exchange) => exchanges.value.includes(exchange));
    for (const exchange of itemExchanges) {
      const perExchange = JSON.parse(JSON.stringify(cfg)) as Record<string, unknown>;
      const perBt = object(perExchange.backtest);
      perBt.exchanges = [exchange];
      // legacy only sets the dir when the PBGui-data path resolves
      // (:2122) — an unchecked box never clobbers the draft's own value
      if (pbguiPath) perBt.ohlcv_source_dir = pbguiPath;
      perExchange.backtest = perBt;
      bodies.push({
        name: String(draftItemName(item) || 'rebacktest'),
        config: perExchange,
        override_configs: object(item).override_configs ?? {},
      });
    }
  }
  if (bodies.length === 0) {
    emit('error', t('v7backtest.noMatchingScenarioExchange'));
    return;
  }
  try {
    await Promise.all(bodies.map((body) => props.postQueue(body)));
    emit('queued', bodies.length);
    emit('close');
  } catch (error) {
    emit('error', t('v7backtest.failedWithMsg', { msg: error instanceof Error ? error.message : String(error) }));
  }
}
</script>

<template>
  <div v-if="open" id="modal-root" :class="modalBackdropClass" data-test="queue-draft-modal">
    <div :class="modalBoxClass">
      <h3>{{ t('v7backtest.selectBacktestParams') }}</h3>
      <div style="display: flex; flex-direction: column; gap: var(--sp-md)">
        <div>
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">start_date</div>
          <Input v-model="startDate" type="text" data-test="rbt-start" />
        </div>
        <div>
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">end_date</div>
          <Input v-model="endDate" type="text" data-test="rbt-end" />
        </div>
        <div>
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.startingBalance') }}</div>
          <div style="display: flex; align-items: center; gap: var(--sp-xs)">
            <Input v-model="balance" class="text-right" type="number" min="1" step="100" data-test="rbt-balance" />
            <Button type="button" variant="default" class="act-btn h-auto" style="width: 28px; padding: 0" data-test="rbt-balance-minus" aria-label="Decrease starting balance" title="Decrease starting balance" @click="adjustBalance(-100)"><PbIcon :icon="PhMinus" /></Button>
            <Button type="button" variant="default" class="act-btn h-auto" style="width: 28px; padding: 0" data-test="rbt-balance-plus" aria-label="Increase starting balance" title="Increase starting balance" @click="adjustBalance(100)"><PbIcon :icon="PhPlus" /></Button>
          </div>
        </div>
        <div>
          <div class="text-xs uppercase tracking-[0.5px] text-secondary">{{ t('v7backtest.exchanges') }}</div>
          <!-- ui-migration: blocked — the reka listbox is single-value; the
               legacy multi-select (ctrl-free toggle via useToggleMultiSelect)
               stays native. -->
          <select v-model="exchanges" class="sb-input" multiple style="height: auto; min-height: var(--input-h)" data-test="rbt-exchanges" @mousedown="onToggleMultiSelectMousedown">
            <option v-for="exchange in exchangeOptions" :key="exchange" :value="exchange">{{ exchange }}</option>
          </select>
        </div>
        <div style="display: flex; align-items: center; gap: var(--sp-sm)">
          <Checkbox id="rbt-pbgui-data" v-model="usePbguiData" style="margin: 0" data-test="rbt-pbgui-data" />
          <label for="rbt-pbgui-data" style="font-size: var(--fs-sm); cursor: pointer"><PbIcon :icon="PhFolderOpen" /> {{ t('v7backtest.usePbguiMarketData') }}</label>
        </div>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <Button type="button" variant="default" class="modal-btn" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="primary" class="modal-btn" data-test="rbt-ok" @click="submit">{{ t('common.ok') }}</Button>
      </div>
    </div>
  </div>
</template>
