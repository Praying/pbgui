<script setup lang="ts">
/**
 * RetestModal — retestReplaceSelectedArchive's parameter form
 * (:8095-8159): the replacement explainer (:8097), date mode + last-days
 * fallback window (:8098-8105), balance (:8106-8107), the exchange
 * multi-select (:8108-8109), the pbgui-market-data (:8110-8112) +
 * skip-liquidated (:8113-8115) toggles and the daily/weekly schedule
 * grid (:8117-8123) with the weekday row for weekly (:8054-8058).
 * Queue Now (:8126) posts retest-replace; Create Schedule (:8140) adds
 * cadence/time/weekday and posts the schedule.
 */
import { PhFolderOpen } from '@phosphor-icons/vue';
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { onToggleMultiSelectMousedown } from '../composables/useToggleMultiSelect';

const props = defineProps<{
  open: boolean;
  defaults: { days: number; balance: number; exchanges: string[]; usePbguiData: boolean } | null;
}>();

const emit = defineEmits<{
  'queue-now': [fields: { dateMode: string; lastDays: number; balance: number; exchanges: string[]; usePbguiMarketData: boolean; skipLiquidated: boolean }];
  'create-schedule': [fields: { dateMode: string; lastDays: number; balance: number; exchanges: string[]; usePbguiMarketData: boolean; skipLiquidated: boolean }, schedule: { cadence: string; time: string; weekday: number }];
  close: [];
  error: [message: string];
}>();

const { t } = useI18n();

const ALL_EXCHANGES = ['binance', 'bybit', 'bitget', 'okx', 'hyperliquid', 'kucoin', 'combined'];

const dateMode = ref('until_yesterday');
const lastDays = ref('365');
const balance = ref('1000');
const exchanges = ref<string[]>([]);
const usePbguiData = ref(false);
const skipLiquidated = ref(true);
const cadence = ref('daily');
const time = ref('02:00');
const weekday = ref('0');

watch(
  () => [props.open, props.defaults] as const,
  () => {
    if (!props.open || !props.defaults) return;
    dateMode.value = 'until_yesterday';
    lastDays.value = String(props.defaults.days);
    balance.value = String(props.defaults.balance);
    // legacy selects only the configured exchanges (:7986-7988) — an empty
    // config leaves nothing preselected and the confirm gate fires
    const configured = props.defaults.exchanges.filter((exchange) => ALL_EXCHANGES.includes(exchange));
    exchanges.value = configured;
    usePbguiData.value = props.defaults.usePbguiData;
    skipLiquidated.value = true;
    cadence.value = 'daily';
    time.value = '02:00';
    weekday.value = '0';
  },
  { immediate: true }
);

const weekdayOptions = [
  { value: '0', label: 'Monday' },
  { value: '1', label: 'Tuesday' },
  { value: '2', label: 'Wednesday' },
  { value: '3', label: 'Thursday' },
  { value: '4', label: 'Friday' },
  { value: '5', label: 'Saturday' },
  { value: '6', label: 'Sunday' },
];

function collect() {
  if (exchanges.value.length === 0) {
    emit('error', t('v7backtest.selectAtLeastOneExchange')); // :8071
    return null;
  }
  return {
    dateMode: dateMode.value,
    lastDays: Number.parseInt(lastDays.value, 10) || 365,
    balance: Number.parseFloat(balance.value) || 1000,
    exchanges: exchanges.value.slice(),
    usePbguiMarketData: usePbguiData.value,
    skipLiquidated: skipLiquidated.value,
  };
}

function onQueueNow(): void {
  const fields = collect();
  if (!fields) return;
  emit('queue-now', fields);
  emit('close');
}

function onCreateSchedule(): void {
  const fields = collect();
  if (!fields) return;
  emit('create-schedule', fields, { cadence: cadence.value, time: time.value, weekday: Number.parseInt(weekday.value, 10) || 0 });
  emit('close');
}
</script>

<template>
  <div v-if="open && defaults" id="modal-root" data-test="retest-modal">
    <div class="modal-box">
      <h3>{{ t('v7backtest.retestReplaceArchiveResult') }}</h3>
      <div class="modal-body">
        <div style="display: flex; flex-direction: column; gap: var(--sp-md); height: 100%; min-width: 0">
          <p class="muted-line" style="margin: 0">The new backtest always ends at yesterday. Replacement happens only after the new result finished successfully; Git Push stays manual.</p>
          <div>
            <div class="sb-label">Date Mode</div>
            <select v-model="dateMode" class="sb-input" style="width: 100%" data-test="arr-date-mode">
              <option value="until_yesterday" selected>Same duration, end yesterday</option>
              <option value="last_x_days">Last X days, end yesterday</option>
            </select>
          </div>
          <div>
            <div class="sb-label">Last X days / fallback window</div>
            <input v-model="lastDays" class="sb-input" style="width: 100%; text-align: right" type="number" min="1" max="3650" step="1" data-test="arr-last-days" />
            <div class="muted-line">Used directly in Last X days mode, and as fallback when the old result has no valid dates.</div>
          </div>
          <div>
            <div class="sb-label">{{ t('v7backtest.startingBalance') }}</div>
            <input v-model="balance" class="sb-input" style="width: 100%; text-align: right" type="number" min="1" step="100" data-test="arr-balance" />
          </div>
          <div style="flex: 1; display: flex; flex-direction: column; min-height: 60px">
            <div class="sb-label">{{ t('v7backtest.exchanges') }}</div>
            <select v-model="exchanges" class="sb-input" multiple style="flex: 1; height: auto; min-height: var(--input-h)" data-test="arr-exchanges" @mousedown="onToggleMultiSelectMousedown">
              <option v-for="exchange in ALL_EXCHANGES" :key="exchange" :value="exchange">{{ exchange }}</option>
            </select>
          </div>
          <div style="display: flex; align-items: center; gap: var(--sp-sm)">
            <input id="arr-pbgui-data" v-model="usePbguiData" type="checkbox" style="width: auto; margin: 0" data-test="arr-pbgui-data" />
            <label for="arr-pbgui-data" style="font-size: var(--fs-sm); cursor: pointer"><PbIcon :icon="PhFolderOpen" /> {{ t('v7backtest.usePbguiMarketData') }}</label>
          </div>
          <div style="display: flex; align-items: center; gap: var(--sp-sm)">
            <input id="arr-skip-liquidated" v-model="skipLiquidated" type="checkbox" checked style="width: auto; margin: 0" data-test="arr-skip-liquidated" />
            <label for="arr-skip-liquidated" style="font-size: var(--fs-sm); cursor: pointer">Do not replace when the new result is liquidated</label>
          </div>
          <hr class="sb-sep" />
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-sm)">
            <div>
              <div class="sb-label">Schedule</div>
              <select v-model="cadence" class="sb-input" data-test="arr-cadence">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <div class="sb-label">Time</div>
              <input v-model="time" class="sb-input" type="time" data-test="arr-time" />
            </div>
            <div v-show="cadence === 'weekly'" id="arr-weekday-wrap" style="grid-column: span 2" data-test="arr-weekday-wrap">
              <div class="sb-label">Weekday</div>
              <select v-model="weekday" class="sb-input" data-test="arr-weekday">
                <option v-for="option in weekdayOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" data-test="arr-ok" @click="onQueueNow">{{ t('v7backtest.queueNow') }}</button>
        <button type="button" class="modal-btn modal-btn-primary" data-test="arr-schedule" @click="onCreateSchedule">{{ t('v7backtest.createSchedule') }}</button>
      </div>
    </div>
  </div>
</template>
