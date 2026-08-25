<script setup lang="ts">
/**
 * WidgetPpl — the P+L widget: buildPplInline (dashboard_editor.html:1785-1919)
 * + DashRender.buildPpl/renderPpl (dashboard_render.js:1873-2127).
 *
 * Legacy parity notes:
 *  - ensure-defaults block: ['ALL']/THIS_MONTH/MONTH (editor:1790-1792);
 *  - the sum-period switch arms the one-shot fractional zoom BEFORE the
 *    refetch (the PPL fragment's `_savedZoom = _getFracZoom()` pattern,
 *    dashboard_ppl.html:108-116) so the remap survives the bar-count change
 *    (render.js:1901-1913) — the legacy editor re-applied raw category
 *    ranges here; the fragment behavior is the blessed improvement;
 *  - zoom preservation + empty-data wipe like PNL/ADG.
 */
import { computed, inject, ref, watch } from 'vue';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { dateRangeText } from '../../lib/format';
import { pplDataUrl } from '../../lib/endpoints';
import {
  applyPplZoom,
  pplLayout,
  pplTraces,
  type PlotlyLayout,
} from '../../lib/plotlyLayouts';
import { clearSavedZoom, type SavedZoom } from '../../lib/savedZoom';
import { periodFromSelect, PPL_SUM } from '../../composables/usePeriodControls';
import type { PplData } from '../../types/widgets';
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

const uKey = 'dashboard_ppl_users_' + pos;
const pKey = 'dashboard_ppl_period_' + pos;
const sKey = 'dashboard_ppl_sum_period_' + pos;

/* ── ensure defaults (editor:1790-1792) ── */

if (store.state[uKey] === undefined) store.state[uKey] = ['ALL'];
if (store.state[pKey] === undefined) store.state[pKey] = 'THIS_MONTH';
if (store.state[sKey] === undefined) store.state[sKey] = 'MONTH';

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});
const period = computed<string>(() => String(store.state[pKey] || 'THIS_MONTH'));
const sumPeriod = computed<string>(() => String(store.state[sKey] || 'MONTH'));

/* ── fetch (editor:1797-1801) ── */

const fetchState = useDashboardFetch<PplData>('ppl_' + pos);
const url = computed<string>(() =>
  pplDataUrl(store.config.apiBase, users.value, period.value, sumPeriod.value)
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
const traces = computed(() => pplTraces(bars.value));
const layout = computed(() => pplLayout(height.value, bars.value));

/** render.js:1901-1913 — remap onto the CURRENT bar count. */
function applyZoomForData(l: PlotlyLayout, zoom: SavedZoom | null): PlotlyLayout {
  return applyPplZoom(l, zoom, bars.value.length);
}

/* ── controls ── */

const chartRef = ref<{ captureFracZoom: () => void } | null>(null);

function onSumPeriodUpdate(value: unknown): void {
  /* dashboard_ppl.html:108-116 — arm the one-shot fractional zoom first */
  chartRef.value?.captureFracZoom();
  store.state[sKey] = String(value);
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
    <WidgetHeader :title="dashT('dash.profitsAndLosses', 'Profits and Losses')" :icon="'📉'">
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.sumPeriod', 'Sum Period') }}</span>
        <SelectRoot :model-value="sumPeriod" @update:model-value="onSumPeriodUpdate">
          <SelectTrigger :class="dtCtrlSelClass" :aria-label="dashT('dash.sumPeriod', 'Sum Period')">
            <span>{{ sumPeriod }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="s in PPL_SUM" :key="s" :value="s">{{ s }}</SelectItem>
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
      ref="chartRef"
      :traces="traces"
      :layout="layout"
      :height="height"
      :zoom-pos="pos"
      :apply-zoom="applyZoomForData"
      :display-mode-bar="true"
      :responsive="true"
    />
  </div>
</template>
