<script setup lang="ts">
/**
 * WidgetIncome — the INCOME widget: buildIncomeInline
 * (dashboard_editor.html:1350-1515) + the buildIncome dispatcher
 * (dashboard_render.js:856-1027), on the D-editor-2 cell contract.
 *
 * Legacy parity notes:
 *  - ensure-defaults writes ['ALL']/THIS_MONTH/0/0 into state WITHOUT a sync
 *    (editor:1357-1361) so they get persisted on the next scheduled sync;
 *  - the SERVER decides the mode: last_n > 0 → table, else chart
 *    (dashboard.py:2181-2182); `data.mode || 'chart'` (render.js:860);
 *  - the editor always passes height: null (editor:1500) — the stored cell
 *    height feeds the pre-height freeze below, not the chart;
 *  - pre-height freeze (editor:1474-1490): before the table lands, the cell
 *    is measured at its CSS-grid height and frozen inline so `.di-table-wrap`
 *    scrolls instead of expanding the cell. Skipped with a stored height, an
 *    existing inline height (rebuild parity) or the auto-height reset class;
 *    the auto-height watcher clears the freeze (legacy dblclick,
 *    editor:2439-2441). NOT persisted — a pure DOM write, like legacy;
 *  - the header control order is Period · CUSTOM-dates · Last N · Filter ·
 *    Users (render.js:911-976) — PeriodControls renders the period select
 *    plus the CUSTOM from/to/Now block.
 */
import { computed, inject, onMounted, ref, watch } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dateRangeText } from '../../lib/format';
import { incomeDataUrl } from '../../lib/endpoints';
import { periodFromSelect } from '../../composables/usePeriodControls';
import type { IncomeData } from '../../types/widgets';
import {
  diRootClass,
  dtCtrlNumClass,
  dtDaterangeClass,
  dtMetaClass,
  dtMetaControlsClass,
  dtMetaLblClass,
  dtMetaSepClass,
  dtStatusClass,
} from './uiClasses';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import IncomeChart from './IncomeChart.vue';
import IncomeTable from './IncomeTable.vue';
import PeriodControls from './PeriodControls.vue';
import WidgetHeader from './WidgetHeader.vue';

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const pos = ctx ? `${ctx.row}_${ctx.col}` : 'missing';
const row = ctx?.row ?? 1;
const col = ctx?.col ?? 1;

const uKey = 'dashboard_income_users_' + pos;
const pKey = 'dashboard_income_period_' + pos;
const lKey = 'dashboard_income_last_' + pos;
const fKey = 'dashboard_income_filter_' + pos;

/* ── ensure defaults (editor:1357-1361 — writes, no sync) ── */

if (store.state[uKey] === undefined) store.state[uKey] = ['ALL'];
if (store.state[pKey] === undefined) store.state[pKey] = 'THIS_MONTH';
if (store.state[lKey] === undefined) store.state[lKey] = 0;
if (store.state[fKey] === undefined) store.state[fKey] = 0;

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});
const period = computed<string>(() => String(store.state[pKey] || 'THIS_MONTH'));
const lastN = computed<number>(() => Number(store.state[lKey]) || 0);
const filterVal = computed<number>(() => Number(store.state[fKey]) || 0);

/* ── fetch (editor:1372-1389 — generation key 'inc_' + pos) ── */

const fetchState = useDashboardFetch<IncomeData>('inc_' + pos);
const url = computed<string>(() =>
  incomeDataUrl(store.config.apiBase, users.value, period.value, lastN.value, filterVal.value)
);
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;

/* render.js:860 / 1011 — `(data && data.mode) || 'chart'` */
const mode = computed<string>(() => (data.value && data.value.mode) || 'chart');
const rows = computed(() => data.value?.rows ?? []);
const traces = computed(() => data.value?.traces ?? []);

/* ── onReload (editor:1497) — refetch the widget ── */

function onReload(): void {
  void fetchState.run(url.value);
}

/* ── controls (editor:1391-1473) ── */

function onPeriodChange(value: string): void {
  store.state[pKey] = periodFromSelect(value);
  store.scheduleSync();
}

function onLastNChange(e: Event): void {
  store.state[lKey] = parseInt((e.target as HTMLInputElement).value, 10) || 0;
  store.scheduleSync();
}

function onFilterChange(e: Event): void {
  store.state[fKey] = parseFloat((e.target as HTMLInputElement).value) || 0;
  store.scheduleSync();
}

function onUsersChange(value: string[]): void {
  store.state[uKey] = value;
  store.scheduleSync();
}

const allUsers = useDashboardUsers().users;

/* ── cell pre-height freeze (editor:1474-1490) ── */

/** Host element of whichever branch is rendered (loading/error/.di-root). */
const hostEl = ref<HTMLElement | null>(null);

function cellEl(): HTMLElement | null {
  const host = hostEl.value;
  return host ? (host.closest('.editor-cell') as HTMLElement | null) : null;
}

onMounted(() => {
  if (store.hasStoredHeight(row, col)) return; /* editor:1481 !_storedH */
  const cell = cellEl();
  if (!cell || cell.style.height || store.isAutoHeight(row, col)) return; /* editor:1483 */
  const preH = Math.round(cell.getBoundingClientRect().height);
  if (preH > 100) {
    cell.style.height = preH + 'px';
    cell.style.overflow = 'hidden';
  }
});

/* dblclick / Max reset (editor:2439-2441): the legacy handler cleared the
   inline height the freeze had written */
watch(
  () => store.isAutoHeight(row, col),
  (isAuto) => {
    if (!isAuto) return;
    const cell = cellEl();
    if (cell) {
      cell.style.height = '';
      cell.style.overflow = '';
    }
  }
);
</script>

<template>
  <div v-if="!data && !error" ref="hostEl" :class="dtStatusClass">{{ dashT('dash.loading', 'Loading…') }}</div>
  <div v-else-if="error" ref="hostEl" :class="dtStatusClass">{{ dashT('dash.dataUnavailable', '⚠ Data unavailable') }}</div>
  <div v-else ref="hostEl" :class="diRootClass">
    <WidgetHeader :title="dashT('dash.income', 'Income')" :icon="'💰'">
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <PeriodControls :period="period" @update:period="onPeriodChange" />
        <span :class="dtMetaSepClass">·</span>
        <span :class="dtMetaLblClass">{{ dashT('dash.lastN', 'Last N') }}</span>
        <input
          type="number"
          min="0"
          max="9999"
          step="10"
          :class="dtCtrlNumClass"
          :value="lastN"
          @change="onLastNChange"
        />
        <span :class="dtMetaSepClass">·</span>
        <span :class="dtMetaLblClass">{{ dashT('dash.filterVal', 'Filter') }}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          :class="dtCtrlNumClass"
          style="width:68px"
          :value="filterVal"
          @change="onFilterChange"
        />
        <span :class="dtMetaSepClass">·</span>
        <span :class="dtMetaLblClass">{{ dashT('dash.users', 'Users') }}</span>
        <MultiSelectDropdown
          :model-value="users"
          :users="allUsers"
          @update:model-value="onUsersChange"
        />
      </div>
    </WidgetHeader>
    <div v-if="data && data.from_date && data.to_date" :class="dtDaterangeClass">
      {{ dateRangeText(data.from_date, data.to_date) }}
    </div>
    <IncomeTable
      v-if="mode === 'table'"
      :rows="rows"
      :users="users || ['ALL']"
      :api-base="store.config.apiBase"
      :pos="pos"
      :on-jump-to-date="null"
      :on-reload="onReload"
    />
    <IncomeChart v-else :traces="traces" :height="null" :pos="pos" />
  </div>
</template>
