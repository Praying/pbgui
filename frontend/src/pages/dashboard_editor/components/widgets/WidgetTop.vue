<script setup lang="ts">
/**
 * WidgetTop — the TOP widget: buildTopInline (dashboard_editor.html:1218-1347)
 * + DashRender.buildTop/renderTop (dashboard_render.js:588-835), on the
 * D-editor-2 cell contract (cellContextKey + store + epoch remounts).
 *
 * Legacy parity notes:
 *  - TOP has NO ensure-defaults block (unlike PNL/ADG/PPL, editor:1219-1227
 *    reads state with || fallbacks) — nothing is written to state on mount;
 *  - `topN` flows to the URL raw (legacy concatenation, editor:1247);
 *  - height = stored height or 280 (editor:1330-1331);
 *  - zoom is never preserved (buildTop's fast path passes no savedZoom);
 *  - the Now-checkbox label is the untranslated legacy literal.
 */
import { computed, inject, watch } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dateRangeText } from '../../lib/format';
import { topDataUrl } from '../../lib/endpoints';
import { topLayout, topTraces } from '../../lib/plotlyLayouts';
import { periodFromSelect } from '../../composables/usePeriodControls';
import type { TopData, TopRow } from '../../types/widgets';
import {
  dtCtrlNumClass,
  dtDaterangeClass,
  dtMetaClass,
  dtMetaControlsClass,
  dtMetaLblClass,
  dtMetaSepClass,
  dtNodataClass,
  dtRootClass,
  dtStatusClass,
} from './uiClasses';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import PeriodControls from './PeriodControls.vue';
import PlotlyChart from './PlotlyChart.vue';
import WidgetHeader from './WidgetHeader.vue';

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const pos = ctx ? `${ctx.row}_${ctx.col}` : 'missing';
const row = ctx?.row ?? 1;
const col = ctx?.col ?? 1;

const uKey = 'dashboard_top_symbols_users_' + pos;
const pKey = 'dashboard_top_symbols_period_' + pos;
const tKey = 'dashboard_top_symbols_top_' + pos;

/* ── config (editor:1223-1226 — no ensure-defaults for TOP) ── */

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});
const period = computed<string>(() => String(store.state[pKey] || 'THIS_MONTH'));
const topN = computed<number | string>(() => (store.state[tKey] as number | string) || 10);

/* ── fetch (editor:1237-1247) ── */

const fetchState = useDashboardFetch<TopData>('top_' + pos);
const url = computed<string>(() =>
  topDataUrl(store.config.apiBase, users.value, period.value, topN.value)
);
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;
const rows = computed<TopRow[]>(() => data.value?.rows ?? []);

/* ── chart data ── */

const height = computed<number>(() => store.cellHeight(row, col) ?? 280);
const traces = computed(() => topTraces(rows.value));
const layout = computed(() => topLayout(height.value));

/* ── controls (editor:1253-1335) ── */

function onTopNChange(e: Event): void {
  const v = (e.target as HTMLInputElement).value;
  store.state[tKey] = parseFloat(v) || 10;
  store.scheduleSync();
}

function onPeriodChange(value: string): void {
  store.state[pKey] = periodFromSelect(value);
  store.scheduleSync();
}

function onUsersChange(value: string[]): void {
  store.state[uKey] = value;
  store.scheduleSync();
}

const allUsers = useDashboardUsers().users;
</script>

<template>
  <div v-if="!data && !error" :class="dtStatusClass">{{ dashT('dash.loading', 'Loading…') }}</div>
  <div v-else-if="error" :class="dtStatusClass">{{ dashT('dash.dataUnavailable', '⚠ Data unavailable') }}</div>
  <div v-else :class="dtRootClass">
    <WidgetHeader :title="dashT('dash.topSymbols', 'Top Symbols')" :icon="'🏆'">
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.top', 'Top') }}</span>
        <input
          type="number"
          min="1"
          max="500"
          step="1"
          :class="dtCtrlNumClass"
          :value="topN"
          @change="onTopNChange"
        />
        <span :class="dtMetaSepClass">·</span>
        <PeriodControls :period="period" @update:period="onPeriodChange" />
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
    <div v-if="rows.length === 0" :class="dtNodataClass">
      {{ dashT('dash.noDataPeriod', 'No data for the selected period.') }}
    </div>
    <PlotlyChart
      v-else
      :traces="traces"
      :layout="layout"
      :height="height"
      :display-mode-bar="true"
      :responsive="true"
    />
  </div>
</template>
