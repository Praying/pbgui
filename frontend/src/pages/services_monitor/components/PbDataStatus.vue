<script setup lang="ts">
/*
 * PBData Status tab, ported 1:1 from the legacy pbdata status pane markup plus
 * loadFetchSummary/renderFetchSummary/applyFetchFilters and
 * loadPollerMetrics/renderPollerMetrics/togglePollerMetrics of
 * frontend/services_monitor.html. The fetch summary's Prices group is the
 * legacy openPricesOverlay click target — the component emits open-prices and
 * the App shell opens the page-global PricesOverlay.
 *
 * Polling follows the legacy switchTab gating: both 5s intervals run only
 * while the status tab is the active pane (active prop), and stop otherwise.
 * The legacy HTML fragments (fmtBackoff/cntCell/budgetWait) only interpolate
 * numeric counters, so they render as plain template spans here.
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { PhCaretDown, PhCaretRight, PhCheck, PhArrowElbowDownRight } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { apiBase } from '../config';
import type { FetchSummaryData, PollerMetricsData } from '../types';

/** Legacy setInterval period for both status endpoints. */
const POLL_MS = 5000;

interface Props {
  /** Legacy switchTab gating: true while the pbdata status tab is the active pane. */
  active: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** Legacy onclick="openPricesOverlay()" on the Prices summary group. */
  'open-prices': [];
}>();

const { t } = useI18n();

/* ── Fetch summary (legacy loadFetchSummary/renderFetchSummary) ── */

const summary = ref<FetchSummaryData | null>(null);
const summaryError = ref('');
const summaryLoaded = ref(false);

/** Legacy column filter checkboxes — state survives refreshes. */
const fBal = ref(true);
const fPos = ref(true);
const fOrd = ref(true);
const fHist = ref(true);
const fExec = ref(true);
const fWsOnly = ref(false);

async function loadFetchSummary(): Promise<void> {
  try {
    summary.value = await apiFetch<FetchSummaryData>(`${apiBase()}/fetch-summary`);
    summaryError.value = '';
    summaryLoaded.value = true;
  } catch {
    summaryError.value = t('sysmon.failedToLoadFetchSummary');
  }
}

/** Legacy timestamp note: ` (Ns)` since the payload timestamp, empty when unparseable. */
function tsNote(ts: string | undefined): string {
  if (!ts) return '';
  try {
    const delta = Math.floor((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 1000);
    return Number.isFinite(delta) ? ` (${delta}s)` : '';
  } catch {
    return '';
  }
}

/** Legacy fetch-summary fmtAge: 'never' for missing, s/m/h ages for epoch seconds. */
function ageText(ts: number | undefined): { text: string; never: boolean } {
  if (!ts) return { text: 'never', never: true };
  let delta = Math.floor(Date.now() / 1000 - ts);
  if (delta < 0) delta = 0;
  if (delta < 60) return { text: `${delta}s`, never: false };
  if (delta < 3600) return { text: `${Math.floor(delta / 60)}m`, never: false };
  return { text: `${Math.floor(delta / 3600)}h`, never: false };
}

/** Legacy poller-metrics fmtAge: '-' for missing, s/m/h ages otherwise. */
function pmAgeText(ts: number | undefined): string {
  if (!ts) return '-';
  let delta = Math.floor(Date.now() / 1000 - ts);
  if (delta < 0) delta = 0;
  if (delta < 60) return `${delta}s`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m`;
  return `${Math.floor(delta / 3600)}h`;
}

interface SummaryUserRow {
  user: string;
  isWs: boolean;
  balances: { cls: string; text: string };
  positions: { cls: string; text: string };
  orders: { cls: string; text: string };
  history: { cls: string; text: string };
  executions: { cls: string; text: string };
}

/** Legacy table build: allUsers sorted, fmtMode/flatMode per column. */
const summaryRows = computed<SummaryUserRow[]>(() => {
  const data = summary.value;
  if (!data) return [];
  const bal = data.balances ?? {};
  const pos = data.positions ?? {};
  const ords = data.orders ?? {};
  const hist = data.history ?? [];
  const execs = data.executions ?? [];
  const last = data.last_fetch_ts ?? {};
  const wsSet = new Set([...(bal.ws ?? []), ...(pos.ws ?? []), ...(ords.ws ?? [])]);
  const mode = (user: string, ws: string[] | undefined, rest: string[] | undefined, type: 'balances' | 'positions' | 'orders') => {
    const age = ageText((last[user] ?? {})[type]);
    if ((ws ?? []).includes(user)) return { cls: 'fs-ws', text: age.text };
    if ((rest ?? []).includes(user)) return { cls: 'fs-rest', text: age.text };
    return { cls: 'fs-never', text: age.text };
  };
  const flat = (user: string, arr: string[], type: 'history' | 'executions') => {
    const age = ageText((last[user] ?? {})[type]);
    return { cls: arr.includes(user) ? '' : 'fs-never', text: age.text };
  };
  return Object.keys(last)
    .sort()
    .map((user) => ({
      user,
      isWs: wsSet.has(user),
      balances: mode(user, bal.ws, bal.rest, 'balances'),
      positions: mode(user, pos.ws, pos.rest, 'positions'),
      orders: mode(user, ords.ws, ords.rest, 'orders'),
      history: flat(user, hist, 'history'),
      executions: flat(user, execs, 'executions'),
    }));
});

/** Legacy applyFetchFilters column visibility. */
const colVisible = computed<Record<string, boolean>>(() => ({
  'fs-col-balances': fBal.value,
  'fs-col-positions': fPos.value,
  'fs-col-orders': fOrd.value,
  'fs-col-history': fHist.value,
  'fs-col-execs': fExec.value,
}));

function colDisplay(cls: string): string {
  return colVisible.value[cls] === false ? 'none' : '';
}

/** Legacy applyFetchFilters ws-only row visibility. */
function rowDisplay(isWs: boolean): string {
  return fWsOnly.value && !isWs ? 'none' : '';
}

/** Legacy grpPrices counters: active exchanges / total and symbol sum. */
const pricesCounters = computed(() => {
  const prices = summary.value?.prices ?? {};
  const exchanges = Object.keys(prices);
  let activeCount = 0;
  let totalSymbols = 0;
  for (const ex of exchanges) {
    if (prices[ex]?.active) activeCount += 1;
    totalSymbols += prices[ex]?.symbols ?? 0;
  }
  return { activeCount, total: exchanges.length, totalSymbols };
});

/* ── Poller metrics (legacy loadPollerMetrics/renderPollerMetrics) ── */

const metrics = ref<PollerMetricsData | null>(null);
const metricsError = ref('');
const metricsLoaded = ref(false);
/** Legacy _pollerMetricsCollapsed. */
const pmCollapsed = ref(false);

async function loadPollerMetrics(): Promise<void> {
  try {
    metrics.value = await apiFetch<PollerMetricsData>(`${apiBase()}/poller-metrics`);
    metricsError.value = '';
    metricsLoaded.value = true;
  } catch {
    metricsError.value = t('sysmon.failedToLoadPollerMetrics');
  }
}

const exchangeKeys = computed(() => Object.keys(metrics.value?.exchanges ?? {}).sort());
const semaphoreKeys = computed(() => Object.keys(metrics.value?.semaphores ?? {}).sort());
const marketDataKeys = computed(() => Object.keys(metrics.value?.market_data ?? {}).sort());
const budgetKeys = computed(() => Object.keys(metrics.value?.budgets ?? {}).sort());

/** Legacy fmtMs: '-' for missing, ms below 1s, one-decimal seconds above. */
function fmtMs(ms: number | undefined): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Legacy fmtDuration: '-' for missing, rounded s / m+s / h+m. */
function fmtDuration(s: number | undefined): string {
  if (!s && s !== 0) return '-';
  const sec = Math.round(s);
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
}

/** Legacy fmtBackoff parts: ✓ when empty, otherwise per-window spans. */
function backoffParts(m: { backoff_remaining_s?: number; history_backoff_remaining_s?: number }) {
  const bo = m.backoff_remaining_s || 0;
  const hbo = m.history_backoff_remaining_s || 0;
  return { bo, hbo, none: !bo && !hbo };
}

/** Legacy cntCell: muted 0 for falsy counters. */
function countCls(n: number | undefined, cls: string): string {
  return n ? cls : 'pm-muted';
}

/** Legacy semaphore in-use class: full → err, partial → warn, empty → ok. */
function semaphoreCls(s: { slots: number; in_use?: number }): string {
  const inUse = s.in_use || 0;
  return inUse >= s.slots ? 'pm-err' : inUse > 0 ? 'pm-warn' : 'pm-ok';
}

/** Legacy budget token percentage. */
function budgetPct(b: { tokens: number; capacity: number }): number {
  return b.capacity > 0 ? Math.round((b.tokens / b.capacity) * 100) : 0;
}

/** Legacy budget token bar class. */
function budgetBarCls(b: { tokens: number; capacity: number }): string {
  const pct = budgetPct(b);
  return pct > 50 ? 'pm-ok' : pct > 20 ? 'pm-warn' : 'pm-err';
}

/** Legacy budget wait string: 0 muted for no waits, one-decimal seconds otherwise. */
function waitText(ms: number | undefined): string {
  return ms && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : '0';
}

/** Legacy budget per-operation rows sorted by consumed desc. */
function budgetOperations(budget: NonNullable<PollerMetricsData['budgets']>[string]): string[] {
  return Object.keys(budget.per_operation ?? {}).sort(
    (a, b) => (budget.per_operation?.[b]?.consumed ?? 0) - (budget.per_operation?.[a]?.consumed ?? 0)
  );
}

/** Legacy market-data progress cell: 'done/total' or muted '-'. */
function progressText(e: { coins_total?: number; coins_done?: number }): string {
  return e.coins_total ? `${e.coins_done}/${e.coins_total}` : '-';
}

/* ── Polling (legacy switchTab timers) ── */

let summaryTimer: ReturnType<typeof setInterval> | undefined;
let metricsTimer: ReturnType<typeof setInterval> | undefined;

function startPolling(): void {
  stopPolling();
  summaryTimer = setInterval(() => void loadFetchSummary(), POLL_MS);
  metricsTimer = setInterval(() => void loadPollerMetrics(), POLL_MS);
}

function stopPolling(): void {
  if (summaryTimer !== undefined) clearInterval(summaryTimer);
  if (metricsTimer !== undefined) clearInterval(metricsTimer);
  summaryTimer = undefined;
  metricsTimer = undefined;
}

watch(
  () => props.active,
  (isActive) => {
    if (isActive) {
      void loadFetchSummary();
      void loadPollerMetrics();
      startPolling();
    } else {
      stopPolling();
    }
  },
  { immediate: true }
);

onUnmounted(stopPolling);
</script>

<template>
  <div class="fetch-summary" id="pbdata-status-wrap">
    <div v-if="summaryError" class="fs-error">{{ summaryError }}</div>
    <template v-else-if="summaryLoaded && summary">
      <div v-if="!Object.keys(summary).length" class="fs-note">{{ t('sysmon.noFetchSummaryYet') }}</div>
      <template v-else>
        <div class="fs-header">
          <span class="fs-title">{{ t('sysmon.fetchSummary') }}<span v-if="summary.timestamp" class="fs-ts">{{ tsNote(summary.timestamp) }}</span></span>
        </div>

        <div class="fs-summary-row">
          <div class="fs-group">
            <div class="fs-group-title">Balances</div>
            <div class="fs-group-body">
              <div class="fs-cnt"><span class="fs-dot-ws">&#9679;</span><span class="fs-cnt-lbl">WS</span><span class="fs-cnt-val">&nbsp;{{ (summary.balances?.ws ?? []).length }}</span></div>
              <div class="fs-cnt"><span class="fs-dot-rest">&#9679;</span><span class="fs-cnt-lbl">REST</span><span class="fs-cnt-val">&nbsp;{{ (summary.balances?.rest ?? []).length }}</span></div>
            </div>
          </div>
          <div class="fs-group">
            <div class="fs-group-title">Positions</div>
            <div class="fs-group-body">
              <div class="fs-cnt"><span class="fs-dot-ws">&#9679;</span><span class="fs-cnt-lbl">WS</span><span class="fs-cnt-val">&nbsp;{{ (summary.positions?.ws ?? []).length }}</span></div>
              <div class="fs-cnt"><span class="fs-dot-rest">&#9679;</span><span class="fs-cnt-lbl">REST</span><span class="fs-cnt-val">&nbsp;{{ (summary.positions?.rest ?? []).length }}</span></div>
            </div>
          </div>
          <div class="fs-group">
            <div class="fs-group-title">Orders</div>
            <div class="fs-group-body">
              <div class="fs-cnt"><span class="fs-dot-ws">&#9679;</span><span class="fs-cnt-lbl">WS</span><span class="fs-cnt-val">&nbsp;{{ (summary.orders?.ws ?? []).length }}</span></div>
              <div class="fs-cnt"><span class="fs-dot-rest">&#9679;</span><span class="fs-cnt-lbl">REST</span><span class="fs-cnt-val">&nbsp;{{ (summary.orders?.rest ?? []).length }}</span></div>
            </div>
          </div>
          <div class="fs-group fs-group-clickable" role="button" tabindex="0" :title="t('sysmon.clickToViewPrices')" :aria-label="t('sysmon.clickToViewPrices')" @click="emit('open-prices')" @keydown.enter.prevent="emit('open-prices')" @keydown.space.prevent="emit('open-prices')">
            <div class="fs-group-title">{{ t('sysmon.prices') }}</div>
            <div class="fs-group-body">
              <div class="fs-cnt"><span class="fs-dot-ws">&#9679;</span><span class="fs-cnt-lbl">WS</span><span class="fs-cnt-val">&nbsp;{{ pricesCounters.activeCount }}/{{ pricesCounters.total }}</span></div>
              <div class="fs-cnt"><span class="fs-cnt-lbl">Sym</span><span class="fs-cnt-val">&nbsp;{{ pricesCounters.totalSymbols }}</span></div>
            </div>
          </div>
          <div class="fs-group">
            <div class="fs-group-title">History</div>
            <div class="fs-group-body"><div class="fs-cnt"><span class="fs-cnt-val">{{ (summary.history ?? []).length }}</span></div></div>
          </div>
          <div class="fs-group">
            <div class="fs-group-title">Executions</div>
            <div class="fs-group-body"><div class="fs-cnt"><span class="fs-cnt-val">{{ (summary.executions ?? []).length }}</span></div></div>
          </div>
        </div>

        <div class="fs-filters">
          <label class="fs-filter-label"><Checkbox id="fs-f-balances" v-model="fBal" />Balances</label>
          <label class="fs-filter-label"><Checkbox id="fs-f-positions" v-model="fPos" />Positions</label>
          <label class="fs-filter-label"><Checkbox id="fs-f-orders" v-model="fOrd" />Orders</label>
          <label class="fs-filter-label"><Checkbox id="fs-f-history" v-model="fHist" />History</label>
          <label class="fs-filter-label"><Checkbox id="fs-f-execs" v-model="fExec" />Executions</label>
          <label class="fs-filter-label"><Checkbox id="fs-f-wsonly" v-model="fWsOnly" />WS only</label>
        </div>

        <div class="fs-table-wrap" id="fs-table-wrap">
          <table class="fs-table" id="fs-table">
            <thead>
              <tr>
                <th>User</th>
                <th class="fs-col-balances" :style="{ display: colDisplay('fs-col-balances') }">Balances</th>
                <th class="fs-col-positions" :style="{ display: colDisplay('fs-col-positions') }">Positions</th>
                <th class="fs-col-orders" :style="{ display: colDisplay('fs-col-orders') }">Orders</th>
                <th class="fs-col-history" :style="{ display: colDisplay('fs-col-history') }">History</th>
                <th class="fs-col-execs" :style="{ display: colDisplay('fs-col-execs') }">Executions</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in summaryRows.filter((r) => !fWsOnly || r.isWs)"
                :key="row.user"
                :data-ws="row.isWs ? '1' : '0'"
                :style="{ display: rowDisplay(row.isWs) }"
              >
                <td>{{ row.user }}</td>
                <td class="fs-col-balances" :style="{ display: colDisplay('fs-col-balances') }"><span :class="row.balances.cls">{{ row.balances.text }}</span></td>
                <td class="fs-col-positions" :style="{ display: colDisplay('fs-col-positions') }"><span :class="row.positions.cls">{{ row.positions.text }}</span></td>
                <td class="fs-col-orders" :style="{ display: colDisplay('fs-col-orders') }"><span :class="row.orders.cls">{{ row.orders.text }}</span></td>
                <td class="fs-col-history" :style="{ display: colDisplay('fs-col-history') }"><span :class="row.history.cls">{{ row.history.text }}</span></td>
                <td class="fs-col-execs" :style="{ display: colDisplay('fs-col-execs') }"><span :class="row.executions.cls">{{ row.executions.text }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </template>
    <div v-else class="fs-note">{{ t('sysmon.loadingStatus') }}</div>
  </div>

  <div class="poller-metrics" id="pbdata-poller-metrics-wrap">
    <div v-if="metricsError" class="pm-note">{{ metricsError }}</div>
    <template v-else-if="metricsLoaded && metrics">
      <div v-if="!exchangeKeys.length" class="pm-note">{{ t('sysmon.noPollerMetricsYet') }}</div>
      <template v-else>
        <div class="pm-header">
          <span class="pm-title">{{ t('sysmon.pollerMetrics') }}<span v-if="metrics.timestamp" class="fs-ts">{{ tsNote(metrics.timestamp) }} ago</span></span>
          <Button variant="secondary" size="sm" @click="pmCollapsed = !pmCollapsed" id="pm-toggle-btn" type="button"><PbIcon :icon="pmCollapsed ? PhCaretRight : PhCaretDown" /> {{ pmCollapsed ? t('common.show') : t('common.hide') }}</Button>
        </div>
        <div id="pm-body" :style="pmCollapsed ? { display: 'none' } : {}">
          <div class="pm-section">
            <div class="pm-section-title">{{ t('sysmon.exchangePollers') }}</div>
            <div style="overflow-x: auto">
              <table class="pm-table">
                <thead>
                  <tr>
                    <th>Exchange</th><th>Combined</th><th>Cycle</th><th>Users</th>
                    <th>History</th><th>Cycle</th><th>Users</th>
                    <th>Backoff</th><th>429s</th><th>Errors</th><th>Slot T/O</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="ex in exchangeKeys" :key="ex">
                    <td><strong>{{ ex }}</strong></td>
                    <td><span :class="!metrics!.exchanges![ex]!.combined_last_ts ? 'pm-muted' : ''">{{ pmAgeText(metrics!.exchanges![ex]!.combined_last_ts) }}</span></td>
                    <td><span :class="!metrics!.exchanges![ex]!.combined_cycle_ms ? 'pm-muted' : ''">{{ fmtMs(metrics!.exchanges![ex]!.combined_cycle_ms) }}</span></td>
                    <td>{{ metrics!.exchanges![ex]!.combined_users || 0 }}</td>
                    <td><span :class="!metrics!.exchanges![ex]!.history_last_ts ? 'pm-muted' : ''">{{ pmAgeText(metrics!.exchanges![ex]!.history_last_ts) }}</span></td>
                    <td><span :class="!metrics!.exchanges![ex]!.history_cycle_ms ? 'pm-muted' : ''">{{ fmtMs(metrics!.exchanges![ex]!.history_cycle_ms) }}</span></td>
                    <td>{{ metrics!.exchanges![ex]!.history_users || 0 }}</td>
                    <td>
                      <span v-if="backoffParts(metrics!.exchanges![ex]!).none" class="pm-ok"><PbIcon :icon="PhCheck" :size="14" /></span>
                      <template v-else>
                        <span v-if="backoffParts(metrics!.exchanges![ex]!).bo" class="pm-err">{{ backoffParts(metrics!.exchanges![ex]!).bo }}s</span>
                        <span v-if="backoffParts(metrics!.exchanges![ex]!).hbo" class="pm-warn">hist:{{ backoffParts(metrics!.exchanges![ex]!).hbo }}s</span>
                      </template>
                    </td>
                    <td><span :class="countCls(metrics!.exchanges![ex]!.rate_limit_429, 'pm-err')">{{ metrics!.exchanges![ex]!.rate_limit_429 || 0 }}</span></td>
                    <td><span :class="countCls(metrics!.exchanges![ex]!.errors, 'pm-warn')">{{ metrics!.exchanges![ex]!.errors || 0 }}</span></td>
                    <td><span :class="countCls(metrics!.exchanges![ex]!.rest_slot_timeouts, 'pm-warn')">{{ metrics!.exchanges![ex]!.rest_slot_timeouts || 0 }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="semaphoreKeys.length" class="pm-section">
            <div class="pm-section-title">{{ t('sysmon.restSemaphores') }}</div>
            <div style="overflow-x: auto">
              <table class="pm-table">
                <thead><tr><th>Exchange</th><th>Slots</th><th>Available</th><th>In Use</th></tr></thead>
                <tbody>
                  <tr v-for="ex in semaphoreKeys" :key="ex">
                    <td><strong>{{ ex }}</strong></td>
                    <td>{{ metrics!.semaphores![ex]!.slots }}</td>
                    <td>{{ metrics!.semaphores![ex]!.available }}</td>
                    <td><span :class="semaphoreCls(metrics!.semaphores![ex]!)">{{ metrics!.semaphores![ex]!.in_use || 0 }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="marketDataKeys.length" class="pm-section">
            <div class="pm-section-title">{{ t('sysmon.marketDataLoops') }}</div>
            <div style="overflow-x: auto">
              <table class="pm-table">
                <thead><tr><th>Loop</th><th>Exchange</th><th>Status</th><th>Progress</th><th>Last Run</th><th>Duration</th><th>Current</th></tr></thead>
                <tbody>
                  <tr v-for="key in marketDataKeys" :key="key">
                    <td>{{ key }}</td>
                    <td>{{ metrics!.market_data![key]!.exchange || '-' }}</td>
                    <td>
                      <span class="pm-badge" :class="metrics!.market_data![key]!.running ? 'pm-badge-run' : 'pm-badge-idle'">{{ metrics!.market_data![key]!.running ? 'running' : 'idle' }}</span>
                    </td>
                    <td><span :class="!metrics!.market_data![key]!.coins_total ? 'pm-muted' : ''">{{ progressText(metrics!.market_data![key]!) }}</span></td>
                    <td><span :class="!metrics!.market_data![key]!.last_run_ts ? 'pm-muted' : ''">{{ pmAgeText(metrics!.market_data![key]!.last_run_ts) }}</span></td>
                    <td><span :class="!metrics!.market_data![key]!.last_run_duration_s && metrics!.market_data![key]!.last_run_duration_s !== 0 ? 'pm-muted' : ''">{{ fmtDuration(metrics!.market_data![key]!.last_run_duration_s) }}</span></td>
                    <td>{{ metrics!.market_data![key]!.current_coin || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div v-if="budgetKeys.length" class="pm-section">
            <div class="pm-section-title">{{ t('sysmon.rateLimitBudgets') }}</div>
            <div style="overflow-x: auto">
              <table class="pm-table">
                <thead>
                  <tr>
                    <th>Exchange</th><th>Tokens</th><th>Capacity</th><th>Limit/min</th>
                    <th>Refill/s</th><th>Consumed</th><th>Requests</th><th>Waits</th><th>Wait Time</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="ex in budgetKeys" :key="ex">
                    <tr>
                      <td><strong>{{ ex }}</strong></td>
                      <td><span :class="budgetBarCls(metrics!.budgets![ex]!)">{{ metrics!.budgets![ex]!.tokens }}</span> <span class="pm-muted">({{ budgetPct(metrics!.budgets![ex]!) }}%)</span></td>
                      <td>{{ metrics!.budgets![ex]!.capacity }}</td>
                      <td>{{ metrics!.budgets![ex]!.weight_per_minute }}</td>
                      <td>{{ metrics!.budgets![ex]!.refill_per_second }}</td>
                      <td>{{ metrics!.budgets![ex]!.total_consumed }}</td>
                      <td>{{ metrics!.budgets![ex]!.requests_count }}</td>
                      <td><span :class="countCls(metrics!.budgets![ex]!.waits_count, 'pm-warn')">{{ metrics!.budgets![ex]!.waits_count || 0 }}</span></td>
                      <td><span :class="!metrics!.budgets![ex]!.total_waited_ms ? 'pm-muted' : ''">{{ waitText(metrics!.budgets![ex]!.total_waited_ms) }}</span></td>
                    </tr>
                    <tr v-for="op in budgetOperations(metrics!.budgets![ex]!)" :key="op" style="font-size: 0.85em; opacity: 0.8">
                      <td style="padding-left: 1.6em" class="pm-muted"><PbIcon :icon="PhArrowElbowDownRight" :size="12" class="align-[-1px] inline-block" /> {{ op }}</td>
                      <td></td><td></td><td></td><td></td>
                      <td>{{ metrics!.budgets![ex]!.per_operation![op]!.consumed || 0 }}</td>
                      <td>{{ metrics!.budgets![ex]!.per_operation![op]!.requests || 0 }}</td>
                      <td><span :class="countCls(metrics!.budgets![ex]!.per_operation![op]!.waits || 0, 'pm-warn')">{{ metrics!.budgets![ex]!.per_operation![op]!.waits || 0 }}</span></td>
                      <td><span :class="!metrics!.budgets![ex]!.per_operation![op]!.wait_ms ? 'pm-muted' : ''">{{ waitText(metrics!.budgets![ex]!.per_operation![op]!.wait_ms) }}</span></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </template>
    </template>
    <div v-else class="pm-note">{{ t('sysmon.loadingPollerMetrics') }}</div>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (fs-*/pm-* classes). -->
<style scoped>
.fetch-summary { padding: 1rem 1.5rem; overflow-y: auto; flex: 1; }
.fs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.9rem; }
.fs-title { color: var(--text-primary); font-size: var(--fs-md); font-weight: 600; }
.fs-ts { color: var(--text-muted); font-size: var(--fs-xs); }
.fs-note { color: var(--text-disabled); padding: 0.5rem; font-style: italic; }
.fs-error { color: var(--danger-soft); padding: 1rem; }
.fs-summary-row { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem; }
.fs-group { background: var(--bg-page); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.45rem 0.9rem; }
.fs-group-clickable { cursor: pointer; }
.fs-group-clickable:hover { border-color: var(--success); background: var(--bg-page); }
.fs-group-title { font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 0.25rem; }
.fs-group-body { display: flex; gap: 0.9rem; }
.fs-cnt { display: flex; align-items: center; gap: 0.25rem; }
.fs-dot-ws { color: var(--success); font-size: 0.55rem; }
.fs-dot-rest { color: var(--warning); font-size: 0.55rem; }
.fs-cnt-lbl { font-size: var(--fs-xs); color: var(--text-muted); }
.fs-cnt-val { font-size: var(--fs-sm); font-weight: 700; color: var(--text-primary); }
.fs-filters { display: flex; gap: 1.5rem; flex-wrap: wrap; margin: 0.5rem 0 0.75rem; }
.fs-filter-label { display: flex; align-items: center; gap: 0.4rem; font-size: var(--fs-xs); color: var(--text-secondary); cursor: pointer; }
.fs-table-wrap { overflow-x: auto; }
.fs-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.fs-table th { background: var(--bg-page); color: var(--text-muted); padding: 0.4rem 0.6rem; text-align: left; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.fs-table td { padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--bg-page); white-space: nowrap; color: var(--text-secondary); }
.fs-table tr:hover td { background: var(--bg-page); }
.fs-ws { color: var(--success); }
.fs-rest { color: var(--warning); }
.fs-never { color: var(--text-disabled); }

.poller-metrics { padding: 0.5rem 1.5rem 1rem; }
.pm-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem; margin-top: 0.5rem; }
.pm-title { color: var(--text-primary); font-size: var(--fs-md); font-weight: 600; }
.pm-section { margin-bottom: 0.75rem; }
.pm-section-title { font-size: var(--fs-xs); color: var(--text-muted); margin-bottom: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em; }
.pm-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); }
.pm-table th { background: var(--bg-page); color: var(--text-muted); padding: 0.35rem 0.6rem; text-align: left; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
.pm-table td { padding: 0.3rem 0.6rem; border-bottom: 1px solid var(--bg-page); white-space: nowrap; color: var(--text-secondary); }
.pm-table tr:hover td { background: var(--bg-page); }
.pm-ok { color: var(--success); }
.pm-warn { color: var(--warning); }
.pm-err { color: var(--danger); }
.pm-muted { color: var(--text-disabled); }
.pm-note { color: var(--text-disabled); padding: 0.5rem; font-style: italic; }
.pm-badge { display: inline-block; padding: 0.1rem 0.4rem; border-radius: 4px; font-size: var(--fs-xs); font-weight: 600; }
.pm-badge-run { background: color-mix(in srgb, var(--success-deep) 28%, var(--bg-card)); color: var(--success); }
.pm-badge-idle { background: var(--border-subtle); color: var(--text-muted); }
</style>
