<script setup lang="ts">
/**
 * WidgetPnl — the PNL widget: buildPnlInline (dashboard_editor.html:1517-1609)
 * + DashRender.buildPnl/renderPnl (dashboard_render.js:1582-1760).
 *
 * Legacy parity notes:
 *  - ensure-defaults block writes ['ALL']/THIS_MONTH/bar into state on mount
 *    so the defaults get synced (editor:1522-1524);
 *  - the trace mode comes from the SERVER payload (`data.mode || 'bar'`),
 *    not the control state (render.js:1596);
 *  - zoom is preserved through the per-cell zoom memory (fast-path capture,
 *    render.js:1696-1709) — cleared when the data comes back empty (the
 *    legacy full rebuild wipes the chart and its zoom).
 */
import { computed, inject, watch } from 'vue';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dateRangeText } from '../../lib/format';
import { pnlDataUrl } from '../../lib/endpoints';
import { applyRangeZoom, pnlLayout, pnlTraces } from '../../lib/plotlyLayouts';
import { clearSavedZoom } from '../../lib/savedZoom';
import { MODES, periodFromSelect } from '../../composables/usePeriodControls';
import type { PnlData } from '../../types/widgets';
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

const uKey = 'dashboard_pnl_users_' + pos;
const pKey = 'dashboard_pnl_period_' + pos;
const mKey = 'dashboard_pnl_mode_' + pos;

/* ── ensure defaults (editor:1522-1524 — writes, no sync) ── */

if (store.state[uKey] === undefined) store.state[uKey] = ['ALL'];
if (store.state[pKey] === undefined) store.state[pKey] = 'THIS_MONTH';
if (store.state[mKey] === undefined) store.state[mKey] = 'bar';

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});
const period = computed<string>(() => String(store.state[pKey] || 'THIS_MONTH'));
const mode = computed<string>(() => String(store.state[mKey] || 'bar'));

/* ── fetch (editor:1525-1534) ── */

const fetchState = useDashboardFetch<PnlData>('pnl_' + pos);
const url = computed<string>(() =>
  pnlDataUrl(store.config.apiBase, users.value, period.value, mode.value)
);
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;
const bars = computed(() => data.value?.bars ?? []);

/* legacy full-rebuild wipe on empty data (render.js:1734-1740) */
watch(data, (d) => {
  if (d && (d.bars ?? []).length === 0) clearSavedZoom(pos);
});

/* ── chart data ── */

const height = computed<number>(() => store.cellHeight(row, col) ?? 280);
const dataMode = computed<string>(() => data.value?.mode || 'bar'); // render.js:1596
const traces = computed(() => pnlTraces(bars.value, dataMode.value));
const layout = computed(() => pnlLayout(height.value));

/* ── controls ── */

function onModeUpdate(value: unknown): void {
  store.state[mKey] = String(value);
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
    <WidgetHeader :title="dashT('dash.dailyPnl', 'Daily PNL')" :icon="'📊'">
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.mode', 'Mode') }}</span>
        <SelectRoot :model-value="mode" @update:model-value="onModeUpdate">
          <SelectTrigger :class="dtCtrlSelClass" :aria-label="dashT('dash.mode', 'Mode')">
            <span>{{ mode }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="m in MODES" :key="m" :value="m">{{ m }}</SelectItem>
          </SelectContent>
        </SelectRoot>
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
