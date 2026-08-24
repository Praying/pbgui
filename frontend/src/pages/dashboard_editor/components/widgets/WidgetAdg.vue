<script setup lang="ts">
/**
 * WidgetAdg — the ADG widget: buildAdgInline (dashboard_editor.html:1611-1703)
 * + DashRender.buildAdg/renderAdg (dashboard_render.js:3860-4130).
 *
 * Legacy parity notes:
 *  - the title is the untranslated literal 'ADG' (render.js:4015);
 *  - the balance summary line (starting balance · total PNL · current
 *    balance) renders before the daterange only when `starting_balance !==
 *    undefined` (render.js:4024-4031);
 *  - zoom preservation + empty-data wipe like PNL.
 */
import { computed, inject, watch } from 'vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dateRangeText } from '../../lib/format';
import { adgDataUrl } from '../../lib/endpoints';
import { adgTraces, applyRangeZoom, pnlLayout } from '../../lib/plotlyLayouts';
import { clearSavedZoom } from '../../lib/savedZoom';
import { MODES, periodFromSelect } from '../../composables/usePeriodControls';
import type { AdgData } from '../../types/widgets';
import {
  dtCtrlSelClass,
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

const uKey = 'dashboard_adg_users_' + pos;
const pKey = 'dashboard_adg_period_' + pos;
const mKey = 'dashboard_adg_mode_' + pos;

/* ── ensure defaults (editor:1617-1619) ── */

if (store.state[uKey] === undefined) store.state[uKey] = ['ALL'];
if (store.state[pKey] === undefined) store.state[pKey] = 'THIS_MONTH';
if (store.state[mKey] === undefined) store.state[mKey] = 'bar';

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});
const period = computed<string>(() => String(store.state[pKey] || 'THIS_MONTH'));
const mode = computed<string>(() => String(store.state[mKey] || 'bar'));

/* ── fetch (editor:1631-1639) ── */

const fetchState = useDashboardFetch<AdgData>('adg_' + pos);
const url = computed<string>(() =>
  adgDataUrl(store.config.apiBase, users.value, period.value, mode.value)
);
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;
const bars = computed(() => data.value?.bars ?? []);

watch(data, (d) => {
  if (d && (d.bars ?? []).length === 0) clearSavedZoom(pos);
});

/* ── chart data ── */

const height = computed<number>(() => store.cellHeight(row, col) ?? 280);
const dataMode = computed<string>(() => data.value?.mode || 'bar');
const traces = computed(() => adgTraces(bars.value, dataMode.value));
const layout = computed(() => pnlLayout(height.value)); // PNL/ADG share the layout

const hasSummary = computed<boolean>(() => data.value?.starting_balance !== undefined);

/* ── controls ── */

function onModeChange(e: Event): void {
  store.state[mKey] = (e.target as HTMLSelectElement).value;
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
    <WidgetHeader :title="'ADG'" :icon="'📈'">
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.mode', 'Mode') }}</span>
        <select :class="dtCtrlSelClass" :value="mode" @change="onModeChange">
          <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
        </select>
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
    <div v-if="hasSummary" :class="dtDaterangeClass">
      {{ dashT('dash.startingBalance', 'Starting Balance') }}:
      <b>{{ data!.starting_balance!.toFixed(2) }}</b>
      · {{ dashT('dash.totalPnl', 'Total PNL') }}: <b>{{ data!.total_pnl!.toFixed(2) }}</b>
      · {{ dashT('dash.currentBalance', 'Current Balance') }}:
      <b>{{ data!.current_balance!.toFixed(2) }}</b>
    </div>
    <div v-if="data && data.from_date && data.to_date" :class="dtDaterangeClass">
      {{ dateRangeText(data.from_date, data.to_date) }}
    </div>
    <div v-if="bars.length === 0" :class="dtNodataClass">
      {{ dashT('dash.noDataPeriod', 'No data for the selected period.') }}
    </div>
    <PlotlyChart
      v-else
      :traces="traces"
      :layout="layout"
      :height="height"
      :zoom-pos="pos"
      :apply-zoom="applyRangeZoom"
      :display-mode-bar="true"
      :responsive="true"
    />
  </div>
</template>
