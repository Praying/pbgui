<script setup lang="ts">
/*
 * PBData settings pane, ported 1:1 from the legacy renderPBDataSettings /
 * savePBDataSettings / loadSettings code in frontend/services_monitor.html:
 * the Users tag multiselects, the Log Level select, the ten timer number
 * fields, the per-exchange REST pause collapsible and the Save button with
 * its inline flash message (_post/_flash).
 *
 * Loading follows the legacy _settingsLoaded gate: the App shell calls load()
 * once on first settings-tab activation; until the GET resolves the legacy
 * "Loading settings…" placeholder stays visible (load failures are silent).
 */
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { apiBase } from '../config';
import type { PbDataSaveResponse, PbDataSettingsData } from '../types';
import MultiselectTags from './MultiselectTags.vue';

/** Numeric keys of GET /settings/pbdata consumed by the timer fields. */
type TimerKey =
  | 'ws_max'
  | 'pollers_delay_seconds'
  | 'poll_interval_combined_seconds'
  | 'poll_interval_balance_seconds'
  | 'poll_interval_positions_seconds'
  | 'poll_interval_orders_seconds'
  | 'poll_interval_history_seconds'
  | 'poll_interval_executions_seconds'
  | 'shared_rest_user_pause_seconds'
  | 'latest_1m_coin_pause_seconds';

/** Legacy _numFld field descriptor (id, label, value key, min/max/step, float). */
interface TimerField {
  id: string;
  labelKey: string;
  key: TimerKey;
  min: number;
  max: number;
  step: string;
  isFloat?: boolean;
}

/** Legacy EX_LIST in renderPBDataSettings/savePBDataSettings. */
const EX_LIST = ['binance', 'bitget', 'bybit', 'gateio', 'hyperliquid', 'kucoin', 'okx'] as const;

/** Legacy LL log level options. */
const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL', 'NONE'];

/** Legacy _flash timeout before the inline message fades. */
const FLASH_MS = 3000;

/** Timer rows exactly as renderPBDataSettings emits them (3 form-rows). */
const TIMER_ROWS: TimerField[][] = [
  [
    { id: 'pbdata-ws-max', labelKey: 'sysmon.maxPrivateWs', key: 'ws_max', min: 0, max: 999, step: '1' },
    { id: 'pbdata-pollers-delay', labelKey: 'sysmon.startupDelay', key: 'pollers_delay_seconds', min: 0, max: 3600, step: '5' },
    { id: 'pbdata-combined', labelKey: 'sysmon.combinedInterval', key: 'poll_interval_combined_seconds', min: 10, max: 3600, step: '10' },
    { id: 'pbdata-balance', labelKey: 'sysmon.balanceInterval', key: 'poll_interval_balance_seconds', min: 10, max: 3600, step: '10' },
  ],
  [
    { id: 'pbdata-positions', labelKey: 'sysmon.positionsInterval', key: 'poll_interval_positions_seconds', min: 10, max: 3600, step: '10' },
    { id: 'pbdata-orders', labelKey: 'sysmon.ordersInterval', key: 'poll_interval_orders_seconds', min: 10, max: 3600, step: '10' },
    { id: 'pbdata-history', labelKey: 'sysmon.historyInterval', key: 'poll_interval_history_seconds', min: 10, max: 3600, step: '10' },
    { id: 'pbdata-executions', labelKey: 'sysmon.executionsInterval', key: 'poll_interval_executions_seconds', min: 60, max: 86400, step: '60' },
    { id: 'pbdata-rest-pause', labelKey: 'sysmon.restPausePerUser', key: 'shared_rest_user_pause_seconds', min: 0, max: 10, step: '0.05', isFloat: true },
  ],
  [{ id: 'pbdata-1m-coin-pause', labelKey: 'sysmon.marketDataCoinPause', key: 'latest_1m_coin_pause_seconds', min: 0, max: 30, step: '0.5', isFloat: true }],
];

/** Legacy `parseInt(_val(id) || '<default>', 10)` fallbacks in savePBDataSettings. */
const INT_FALLBACKS: Record<string, string> = {
  ws_max: '10',
  pollers_delay_seconds: '60',
  poll_interval_combined_seconds: '90',
  poll_interval_balance_seconds: '300',
  poll_interval_positions_seconds: '300',
  poll_interval_orders_seconds: '60',
  poll_interval_history_seconds: '300',
  poll_interval_executions_seconds: '1800',
};

/** Legacy `parseFloat(_val(id) || '<default>')` fallbacks in savePBDataSettings. */
const FLOAT_FALLBACKS: Record<string, string> = {
  shared_rest_user_pause_seconds: '0.75',
  latest_1m_coin_pause_seconds: '2.0',
};

const { t } = useI18n();

/** Legacy #pbdata-settings-wrap "Loading settings…" placeholder state. */
const loaded = ref(false);
const allUsers = ref<string[]>([]);
const fetchUsers = ref<string[]>([]);
const tradesUsers = ref<string[]>([]);
const logLevel = ref('INFO');
/** Timer input values keyed by payload field name (legacy _numFld value attr). */
const timers = ref<Record<string, string>>({});
/** Per-exchange pause input values, pre-normalized to two decimals. */
const exPauses = ref<Record<string, string>>({});

const saveMsg = ref('');
const saveMsgIsError = ref(false);
const saveMsgVisible = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** Legacy applySettings → renderPBDataSettings: fill the form from the payload. */
function applySettings(data: PbDataSettingsData): void {
  allUsers.value = data.all_users ?? [];
  fetchUsers.value = data.fetch_users ?? [];
  tradesUsers.value = data.trades_users ?? [];
  logLevel.value = data.log_level || 'INFO';

  const nextTimers: Record<string, string> = {};
  for (const field of TIMER_ROWS.flat()) {
    const raw = data[field.key];
    nextTimers[field.key] = field.isFloat ? parseFloat(String(raw)).toFixed(2) : String(parseInt(String(raw), 10));
  }
  timers.value = nextTimers;

  const overrides = data.shared_rest_pause_by_exchange ?? {};
  const nextExPauses: Record<string, string> = {};
  for (const ex of EX_LIST) {
    const def = overrides[ex] !== undefined ? overrides[ex] : data.shared_rest_user_pause_seconds;
    nextExPauses[ex] = parseFloat(String(def)).toFixed(2);
  }
  exPauses.value = nextExPauses;
  loaded.value = true;
}

/** Legacy loadSettings('pbdata'): GET /settings/pbdata, silent on failure. */
async function load(): Promise<void> {
  try {
    applySettings(await apiFetch<PbDataSettingsData>(`${apiBase()}/settings/pbdata`));
  } catch {
    /* legacy .catch(function () {}) keeps the loading placeholder */
  }
}

/** Legacy exchange-pause onblur: parseFloat(value||0).toFixed(2). */
function normalizeExPause(ex: string): void {
  const value = exPauses.value[ex] ?? '';
  exPauses.value = { ...exPauses.value, [ex]: parseFloat(value || '0').toFixed(2) };
}

/** Legacy _flash: show the message, drop the visible class after 3s. */
function flash(text: string, isError: boolean): void {
  saveMsg.value = text;
  saveMsgIsError.value = isError;
  saveMsgVisible.value = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    saveMsgVisible.value = false;
  }, FLASH_MS);
}

/** Legacy savePBDataSettings: collect tags + fields and POST /settings/pbdata. */
function save(): void {
  // Legacy collects the rendered non-inactive tags in DOM (options) order.
  const activeUsers = (selected: string[]): string[] => allUsers.value.filter((u) => selected.includes(u));
  const exPausePayload: Record<string, number> = {};
  for (const ex of EX_LIST) {
    const v = parseFloat(exPauses.value[ex] ?? '');
    if (!Number.isNaN(v)) exPausePayload[ex] = v;
  }

  const body: Record<string, unknown> = {
    fetch_users: activeUsers(fetchUsers.value),
    trades_users: activeUsers(tradesUsers.value),
    log_level: logLevel.value || 'INFO',
    shared_rest_pause_by_exchange: exPausePayload,
  };
  for (const [key, fallback] of Object.entries(INT_FALLBACKS)) body[key] = parseInt(timers.value[key] || fallback, 10);
  for (const [key, fallback] of Object.entries(FLOAT_FALLBACKS)) body[key] = parseFloat(timers.value[key] || fallback);

  apiFetch<PbDataSaveResponse>(`${apiBase()}/settings/pbdata`, { method: 'POST', body: JSON.stringify(body) })
    .then((data) => {
      // Legacy _post: apply.message wins, then common.saved; !ok → detail/common.error.
      const message = data?.apply && data.apply.message ? serverMsg(String(data.apply.message)) : t('common.saved');
      flash(data.ok ? message : data.detail ? serverMsg(data.detail) : t('common.error'), !data.ok);
    })
    .catch((error: unknown) => {
      // apiFetch folds non-ok JSON bodies into ApiError(detail) — the legacy
      // !ok detail branch; transport failures keep the errorPrefix shape.
      if (error instanceof ApiError) flash(error.detail ? serverMsg(error.detail) : t('common.error'), true);
      else flash(t('sysmon.errorPrefix', { msg: serverMsg((error as Error).message) }), true);
    });
}

onUnmounted(() => clearTimeout(flashTimer));

defineExpose({ load });
</script>

<template>
  <div class="settings-wrap" id="pbdata-settings-wrap">
    <div v-if="!loaded" class="settings-loading">{{ t('sysmon.loadingSettings') }}</div>
    <template v-else>
      <div class="form-section-title">{{ t('sysmon.users') }}</div>
      <div class="form-field fetch-users-field">
        <span class="form-label">{{ t('sysmon.fetchUsers') }} <span class="label-hint">{{ t('sysmon.clickToToggle') }}</span></span>
        <MultiselectTags id="pbdata-fetch-users" :options="allUsers" v-model="fetchUsers" />
      </div>
      <div class="form-field trades-users-field">
        <span class="form-label">{{ t('sysmon.executionsDownload') }} <span class="label-hint">{{ t('sysmon.optIn') }}</span></span>
        <MultiselectTags id="pbdata-trades-users" :options="allUsers" v-model="tradesUsers" />
      </div>

      <hr class="form-divider" />
      <div class="form-section-title">{{ t('sysmon.logLevel') }}</div>
      <div class="form-row log-level-row">
        <div class="form-field">
          <select class="form-select" id="pbdata-log-level" v-model="logLevel">
            <option v-for="level in LOG_LEVELS" :key="level" :value="level">{{ level }}</option>
          </select>
        </div>
      </div>

      <hr class="form-divider" />
      <div class="form-section-title">{{ t('sysmon.timers') }}</div>
      <div class="form-row" v-for="row in TIMER_ROWS" :key="row[0]!.id">
        <div class="form-field" v-for="field in row" :key="field.id">
          <span class="form-label">{{ t(field.labelKey) }}</span>
          <input
            class="form-input narrow"
            type="number"
            :id="field.id"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            v-model="timers[field.key]"
          />
        </div>
      </div>

      <details class="ex-pauses" id="pbdata-ex-pauses" open>
        <summary>&#9660; {{ t('sysmon.sharedRestPausePerExchange') }}</summary>
        <div class="ex-pauses-hint">{{ t('sysmon.sharedRestPauseHint') }}</div>
        <div class="form-row ex-pauses-row">
          <div class="form-field" v-for="ex in EX_LIST" :key="ex">
            <span class="form-label">{{ ex }} {{ t('sysmon.secondsShort') }}</span>
            <input
              class="form-input narrow"
              type="number"
              :id="`pbdata-ex-${ex}`"
              min="0"
              max="30"
              step="0.25"
              v-model="exPauses[ex]"
              @blur="normalizeExPause(ex)"
            />
          </div>
        </div>
      </details>

      <button class="form-btn save" type="button" @click="save">&#128190; {{ t('common.save') }}</button>
      <span
        class="inline-msg"
        id="pbdata-save-msg"
        :class="{ visible: saveMsgVisible, error: saveMsgIsError }"
      >{{ saveMsg }}</span>
    </template>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (settings-wrap + form
     markup of renderPBDataSettings, inline styles promoted to classes). -->
<style scoped>
.settings-wrap { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.settings-loading { color: #4e4851; font-style: italic; }
.form-section-title { font-size: var(--fs-sm); font-weight: 700; color: #a29ca6; margin: 0 0 0.5rem; }
.form-divider { border: none; border-top: 1px solid #29262c; margin: 1rem 0; }
.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.form-field { display: flex; flex-direction: column; gap: 3px; }
.fetch-users-field { margin-bottom: 0.75rem; }
.trades-users-field { margin-bottom: 1rem; }
.log-level-row { margin-bottom: 1rem; }
.form-label { font-size: var(--fs-xs); color: #716b75; text-transform: uppercase; letter-spacing: 0.04em; }
.label-hint { color: #4e4851; font-weight: 400; }
.form-input {
  background: #1f1d21; color: #eae7ea; border: 1px solid #37333a; border-radius: 5px;
  padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none;
}
.form-input:focus { border-color: #4e4851; }
.form-input.narrow { width: 90px; }
.form-select { background: #1f1d21; color: #eae7ea; border: 1px solid #37333a; border-radius: 5px; padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none; cursor: pointer; }
.form-select:focus { border-color: #4e4851; }
.ex-pauses { margin-top: 1rem; border: 1px solid #29262c; border-radius: 6px; overflow: hidden; }
.ex-pauses summary { padding: 0.5rem 0.75rem; cursor: pointer; background: #171619; color: #a29ca6; font-size: var(--fs-sm); font-weight: 600; user-select: none; }
.ex-pauses-hint { padding: 0.6rem 0.9rem 0.4rem; font-size: var(--fs-xs); color: #4e4851; border-bottom: 1px solid #29262c; }
.ex-pauses-row { padding: 0.75rem; flex-wrap: wrap; }
.form-btn { padding: 0 1rem; height: var(--btn-h); border-radius: 5px; border: 1px solid #37333a; background: #1f1d21; color: #a29ca6; cursor: pointer; font-size: var(--fs-sm); font-family: inherit; transition: all 0.12s; }
.form-btn:hover { border-color: #4e4851; color: #eae7ea; }
.form-btn.save { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
.form-btn.save:hover { background: #1d4ed8; color: #fff; }
.inline-msg { font-size: var(--fs-xs); color: #4ade80; margin-left: 0.5rem; opacity: 0; transition: opacity 0.3s; }
.inline-msg.visible { opacity: 1; }
.inline-msg.error { color: #fca5a5; }
</style>
