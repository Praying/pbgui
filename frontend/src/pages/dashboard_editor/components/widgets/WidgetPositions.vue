<script setup lang="ts">
/**
 * WidgetPositions — port of buildPositionsInline (dashboard_editor.html:1922-1975)
 * + the table half of DashRender.buildPositions (dashboard_render.js:2131-2260,
 * 3200-3281), on the D-editor-2 cell contract.
 *
 * Legacy parity notes:
 *  - ensure-defaults: `state['dashboard_positions_users_R_C'] ?? ['ALL']` is
 *    written WITHOUT a sync (editor:1926) — only control changes sync;
 *  - the fast-path `_dpUpdate` hook (render.js:3258-3276) is applyPositions():
 *    rows are replaced in place, the selection is re-resolved by row key and
 *    sort state survives — no DOM rebuild, no flicker;
 *  - a FETCH success clears the selection (legacy full rebuild on refetch);
 *  - the status line has the same two legacy writers as WidgetBalance: the
 *    widget ticker (render.js:3277-3280) and the live-poll tick
 *    (editor:1115-1118) — the poll owns the line while connected;
 *  - selection dispatches the ORDERS-linkage contract (render.js:3245-3251)
 *    through lib/positionsBus (reactive bus + the legacy document CustomEvent);
 *  - the live poll registers the cell in livePositionsRegistry so the WS
 *    orchestration skips positions_updated rebuilds for this cell
 *    (editor:2807, the D-editor-3 isPositionsLive injection);
 *  - the manage modal's per-row control map and the single-flight action
 *    controller live HERE (legacy manageState.controls / actionInFlight were
 *    per-buildPositions closure: they survived modal close, reset on rebuild
 *    = Vue remount);
 *  - NOT ported: buildPositions' dead `opts.height` maxHeight branch — the
 *    legacy editor never passes height to buildPositions (editor:1949-1953).
 */
import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import { PhClipboard, PhTrash } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { canLivePoll, MAX_LIVE_POSITIONS, useLivePositions } from '../../composables/useLivePoll';
import { useManageActions } from '../../composables/useManageActions';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { positionsStatusText } from '../../lib/format';
import { positionsDataUrl } from '../../lib/endpoints';
import { cellPos } from '../../lib/grid';
import { emitPositionSelected } from '../../lib/positionsBus';
import { setLivePositionsActive } from '../../lib/livePositionsRegistry';
import {
  POSITION_COLUMNS,
  positionCellText,
  rowKey,
  sortPositions,
  type ManageControlState,
} from '../../lib/manageLogic';
import type { PositionRow, PositionsData } from '../../types/widgets';
import {
  dtHeaderClass,
  dtIconClass,
  dtMetaClass,
  dtMetaControlsClass,
  dtMetaLblClass,
  dtNodataClass,
  dtRootClass,
  dtStatusClass,
  dtTitleClass,
  dtTrashClass,
} from './uiClasses';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';
import PositionsManageModal from './PositionsManageModal.vue';

/** The 11 legacy table columns (render.js:2208-2220, shared with the modal). */
const COLS = POSITION_COLUMNS;

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const drag = inject(widgetDragKey, null);
const pos = ctx ? cellPos(ctx.row, ctx.col) : 'missing';
const row = ctx?.row ?? 1;
const col = ctx?.col ?? 1;

const uKey = 'dashboard_positions_users_' + pos;
const editMode = computed<boolean>(() => !store.config.viewOnly);

const rootEl = ref<HTMLElement | null>(null);

/* ── config: ensure-defaults without sync (editor:1926) ── */

if (store.state[uKey] === undefined) store.state[uKey] = ['ALL'];

const users = computed<string[]>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : [];
});

/* ── fetch (editor:1928-1943) ── */

const fetchState = useDashboardFetch<PositionsData>('pos_' + pos);
const url = computed<string>(() => positionsDataUrl(store.config.apiBase, users.value));
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;

/* ── rows / selection / status (render.js:2197, 2260, 3258-3281) ── */

const positions = ref<PositionRow[]>([]);
const selectedRow = ref<PositionRow | null>(null);
const statusSource = ref<string>('db');
const statusTs = ref<number>(0);
const tickerText = ref<string>('');

function refreshTicker(): void {
  tickerText.value = positionsStatusText(statusSource.value, statusTs.value);
}

/** Legacy container._dpUpdate (render.js:3258-3276) — selection survives by key. */
function applyPositions(next: PositionRow[], source: string): void {
  const oldKey = rowKey(selectedRow.value);
  positions.value = next;
  selectedRow.value = oldKey ? (next.find((r) => rowKey(r) === oldKey) ?? null) : null;
  statusSource.value = source || 'db';
  statusTs.value = Date.now();
  refreshTicker();
}

function onRowClick(r: PositionRow): void {
  selectedRow.value = r;
  /* render.js:3245-3251 — the ORDERS linkage contract */
  emitPositionSelected(pos, r);
}

/* ── live poll (editor:1084-1119, _connectLivePos) ── */

const live = useLivePositions({
  apiBase: store.config.apiBase,
  isConnected: () => rootEl.value?.isConnected ?? false,
  onData: (rows, source) => applyPositions(rows as PositionRow[], source),
});

onScopeDispose(() => setLivePositionsActive(pos, false));

/* ── data-arrival side effects (legacy .then(_ensureRenderScript) block) ── */

/* flush:'post' — the live poll's isConnected guard reads the rendered root. */
watch(fetchState.data, (d) => {
  if (!d) return;
  /* fresh build: rows replace, selection clears (legacy rebuild semantics) */
  positions.value = d.positions ?? [];
  selectedRow.value = null;
  statusSource.value = String(d.source || 'db');
  statusTs.value = Date.now();
  refreshTicker();
  /* editor:1955 — connect the live poll with the fetched rows as the cap */
  live.connect(pos, users.value, positions.value);
  setLivePositionsActive(
    pos,
    canLivePoll(users.value) && positions.value.length <= MAX_LIVE_POSITIONS
  );
  /* editor:1956-1962 — shrink cell to content when no stored height */
  if (!store.hasStoredHeight(row, col)) store.autoHeightCells[cellPos(row, col)] = true;
}, { flush: 'post' });

/* legacy buildPositions' own 1 s ticker (render.js:3277-3280) */
let statusTimer: ReturnType<typeof setInterval> | null = null;
statusTimer = setInterval(() => {
  refreshTicker();
}, 1000);
onScopeDispose(() => {
  if (statusTimer !== null) clearInterval(statusTimer);
});

const liveEligible = computed<boolean>(() => canLivePoll(users.value));
const displayStatus = computed<string>(() =>
  liveEligible.value && live.statusText.value !== '' ? live.statusText.value : tickerText.value
);
const displayStatusColor = computed<string>(() =>
  liveEligible.value ? live.statusColor.value : ''
);

/* ── sorting (render.js:2222, 3200-3222) ── */

const sortCol = ref<string | null>(null);
const sortAsc = ref(true);

function onSortClick(key: string): void {
  if (sortCol.value === key) sortAsc.value = !sortAsc.value;
  else {
    sortCol.value = key;
    sortAsc.value = true;
  }
}

const sortedRows = computed<PositionRow[]>(() =>
  sortPositions(positions.value, sortCol.value, sortAsc.value)
);

/* rowKey-based selected class — matches the modal and survives row-object
   replacement on live updates (legacy compared object identity). */
const selectedKey = computed<string>(() => (selectedRow.value ? rowKey(selectedRow.value) : ''));

function sortArrow(key: string): string {
  if (sortCol.value !== key) return '';
  return sortAsc.value ? ' ▲' : ' ▼';
}

/* ── manage modal (render.js:2881 — openManageModal) ── */

const manageOpen = ref(false);

function onManageClick(e: Event): void {
  e.stopPropagation();
  if (positions.value.length === 0) return; /* render.js:2882 guard */
  manageOpen.value = true;
}

/* legacy manageState.controls — per-widget map, survives modal close
   (render.js:2540-2551); the modal creates/reads entries through it. */
const manageControls = ref<Record<string, ManageControlState>>({});

/* legacy manageState.actionInFlight — one flight per widget (render.js:2261) */
const manageActions = useManageActions({ apiBase: store.config.apiBase });

/* legacy onReload (editor:1952) — refetch the widget */
function onReload(): void {
  void fetchState.run(url.value);
}

/* ── users control (editor:1945-1948) ── */

function onUsersChange(value: string[]): void {
  store.state[uKey] = value;
  store.scheduleSync();
}

const allUsers = useDashboardUsers().users;

function onDelete(): void {
  if (!ctx) return;
  /* legacy _makeDeleteCb: clearCell + rebuild + scheduleSync */
  store.clearCell(ctx.row, ctx.col);
}
</script>

<template>
  <div v-if="!data && !error" :class="dtStatusClass">
    {{ dashT('dash.loading', 'Loading…') }}
  </div>
  <div v-else-if="error" :class="dtStatusClass">{{ dashT('dash.dataUnavailable', '⚠ Data unavailable') }}</div>
  <div v-else ref="rootEl" :class="dtRootClass">
    <div
      :class="dtHeaderClass"
      draggable="true"
      @dragstart="drag?.onHeaderDragStart($event)"
      @dragend="drag?.onHeaderDragEnd()"
    >
      <span :class="dtIconClass"><PbIcon :icon="PhClipboard" :size="14" /></span>
      <span :class="dtTitleClass">{{ dashT('dash.positions', 'Positions') }}</span>
      <Button
        type="button"
        variant="info"
        size="sm"
        class="dp-manage-btn"
        :title="dashT('dash.manageSelectedPosition', 'Manage selected position')"
        @click="onManageClick"
      >
        {{ dashT('dash.manage', 'Manage') }}
      </Button>
      <div :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.users', 'Users') }}</span>
        <MultiSelectDropdown :model-value="users" :users="allUsers" @update:model-value="onUsersChange" />
      </div>
      <Button
        v-if="editMode"
        type="button"
        variant="ghost"
        size="icon"
        :class="dtTrashClass"
        :title="dashT('dash.removeWidget', 'Remove widget')"
        @click.stop="onDelete"
      >
        <PbIcon :icon="PhTrash" :size="14" />
      </Button>
    </div>
    <div :class="dtStatusClass" :style="{ color: displayStatusColor }">{{ displayStatus }}</div>
    <div v-if="positions.length === 0" :class="dtNodataClass">
      {{ dashT('dash.noOpenPositions', 'No open positions.') }}
    </div>
    <div v-else class="dp-table-wrap max-h-[70vh] overflow-x-auto overflow-y-auto">
      <table class="dp-table w-full border-collapse text-[0.78rem]">
        <thead>
          <tr>
            <th
            v-for="c in COLS"
            :key="c.key"
            class="sticky top-0 cursor-pointer select-none border-b border-b-border-default bg-card px-[0.5rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary hover:text-primary"
            @click="onSortClick(c.key)"
          >
              {{ dashT(c.i18nKey, c.fallback) }}<span class="dp-sort ml-[0.2rem] text-[0.65rem] text-muted">{{ sortArrow(c.key) }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in sortedRows"
            :key="rowKey(r)"
            class="cursor-pointer"
            :class="{ 'dp-sel': rowKey(r) === selectedKey }"
            @click="onRowClick(r)"
          >
            <td
              v-for="c in COLS"
              :key="c.key"
              class="border-b border-b-card px-[0.5rem] py-[0.3rem] whitespace-nowrap"
              :class="c.key === 'upnl' ? (Number(r.upnl || 0) >= 0 ? 'dp-upnl-pos text-success-soft' : 'dp-upnl-neg text-danger-soft') : undefined"
            >
              {{ positionCellText(r, c) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <PositionsManageModal
      v-if="manageOpen"
      :rows="positions"
      v-model:selected-row="selectedRow"
      :controls="manageControls"
      :actions="manageActions"
      :api-base="store.config.apiBase"
      :cols="COLS"
      @close="manageOpen = false"
      @reload="onReload"
    />
  </div>
</template>

<style scoped>
/* Row states paint the td descendants (ported from styles/widgets.css at
   the Tailwind migration — a descendant relationship utilities cannot
   express). Cascade order preserved from the legacy sheet. */
.dp-table tr:hover td {
  background: var(--bg-elevated);
}
.dp-table tr.dp-sel td {
  background: rgb(var(--accent-rgb) / 0.22);
}
</style>
