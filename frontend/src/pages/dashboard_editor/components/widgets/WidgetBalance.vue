<script setup lang="ts">
/**
 * WidgetBalance — port of buildBalanceInline (dashboard_editor.html:1161-1216)
 * + DashRender.buildBalance / renderBalanceRows (dashboard_render.js:428-586),
 * on the D-editor-2 cell contract (cellContextKey + store + epoch remounts).
 *
 * Legacy parity notes:
 *  - the .db-header IS the cell drag source (legacy _attachViewDrag targets
 *    '.dt-header, .db-header', editor:2161) — bound here, not via WidgetHeader
 *    (balance has no title span; the icon sits before the totals);
 *  - the fast-path in-place update (render.js:465-485) is the reactive data
 *    ref swap: rows/totals re-render without a widget remount;
 *  - the status line is written by two legacy 1 s writers: the widget's own
 *    ticker (buildBalance:582-585) and the live poll's tick (editor:1155-1158).
 *    While a poll is eligible the poll's text/color wins (it was created
 *    later and overwrote the ticker every second in legacy);
 *  - auto-height: the cell shrinks to content once data loaded and no
 *    dashboard_height_<r>_<c> is stored (editor:1198-1203);
 *  - the live poll only rebuilds for live/mixed sources (editor:1146-1150),
 *    which useLiveBalance enforces via its onData gate.
 *
 * Deviation (defensive): row.balance/upnl/we are coerced with Number()||0
 * before toFixed — legacy called .toFixed on the raw server value and would
 * throw on a malformed row; server data is numeric so this is equivalent.
 */
import { computed, inject, onScopeDispose, ref, watch } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch } from '../../composables/useDashboardFetch';
import { useDashboardUsers } from '../../composables/useDashboardUsers';
import { canLivePoll, useLiveBalance } from '../../composables/useLivePoll';
import { cellContextKey, widgetDragKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { positionsStatusText, signedFmt, tweBarPct, tweColor, upnlColor } from '../../lib/format';
import { balanceUrl } from '../../lib/endpoints';
import { cellPos } from '../../lib/grid';
import type { BalanceData, BalanceRow } from '../../types/widgets';
import { dtIconClass, dtTrashClass } from './uiClasses';
import MultiSelectDropdown from '../MultiSelectDropdown.vue';

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const drag = inject(widgetDragKey, null);
const pos = ctx ? cellPos(ctx.row, ctx.col) : 'missing';
const row = ctx?.row ?? 1;
const col = ctx?.col ?? 1;

const uKey = 'dashboard_balance_users_' + pos;
const editMode = computed<boolean>(() => !store.config.viewOnly);

const rootEl = ref<HTMLElement | null>(null);

/* ── config (editor:1164-1166 — no ensure-defaults for BALANCE) ── */

const users = computed<string[] | null>(() => {
  const v = store.state[uKey];
  return Array.isArray(v) ? (v as string[]) : null;
});

/* ── fetch (editor:1167-1206) ── */

const fetchState = useDashboardFetch<BalanceData>('bal_' + pos);
const url = computed<string>(() => balanceUrl(store.config.apiBase, users.value));
watch(url, (u) => {
  void fetchState.run(u);
}, { immediate: true });

const data = fetchState.data;
const error = fetchState.error;

/* ── status line (render.js:461-464, 551-555, 582-585) ── */

const statusSource = ref<string>('db');
const statusTs = ref<number>(0);
const tickerText = ref<string>('');

function refreshTicker(): void {
  tickerText.value = positionsStatusText(statusSource.value, statusTs.value);
}

/* ── live poll (editor:1121-1159, _connectLiveBal) ── */

const live = useLiveBalance({
  apiBase: store.config.apiBase,
  isConnected: () => rootEl.value?.isConnected ?? false,
  onData: (payload) => {
    /* legacy: DashRender.buildBalance fast-path for live/mixed payloads */
    fetchState.data.value = payload as BalanceData;
  },
});
const liveEligible = computed<boolean>(() => canLivePoll(users.value));

const displayStatus = computed<string>(() =>
  liveEligible.value && live.statusText.value !== '' ? live.statusText.value : tickerText.value
);
const displayStatusColor = computed<string>(() =>
  liveEligible.value ? live.statusColor.value : ''
);

let statusTimer: ReturnType<typeof setInterval> | null = null;
onScopeDispose(() => {
  if (statusTimer !== null) clearInterval(statusTimer);
});

/* ── data-arrival side effects (legacy .then(_ensureRenderScript) block) ── */

/* flush:'post' — the live poll's isConnected guard reads rootEl, which only
   exists once the data branch has rendered (legacy read container.isConnected
   of the already-built DOM). */
watch(data, (d) => {
  if (!d) return;
  /* render.js:469-470 / 488-489 — source persists when a payload omits it */
  statusSource.value = String(d.source || statusSource.value || 'db');
  statusTs.value = Date.now();
  refreshTicker();
  /* editor:1196 — connect/reuse the live poll */
  live.connect(pos, users.value);
  /* editor:1198-1203 — shrink cell to content when no stored height */
  if (!store.hasStoredHeight(row, col)) store.autoHeightCells[cellPos(row, col)] = true;
}, { flush: 'post' });

/* legacy buildBalance's own 1 s ticker (render.js:582-585) */
statusTimer = setInterval(() => {
  refreshTicker();
}, 1000);

/* ── totals + rows (render.js:491-508, 428-449) ── */

const totals = computed(() => data.value?.totals ?? { balance: 0, upnl: 0, we: 0 });
const rows = computed<BalanceRow[]>(() => data.value?.rows ?? []);

function num(v: unknown): number {
  return Number(v) || 0;
}

/* ── users control (editor:1185-1188) ── */

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
  <div v-if="!data && !error" class="db-status border-b border-b-card bg-page px-[0.75rem] py-[0.15rem] text-[0.68rem] text-muted">{{ dashT('dash.loading', 'Loading…') }}</div>
  <div v-else-if="error" class="db-status border-b border-b-card bg-page px-[0.75rem] py-[0.15rem] text-[0.68rem] text-muted">{{ dashT('dash.dataUnavailable', '⚠ Data unavailable') }}</div>
  <div v-else ref="rootEl" class="db-root bg-page font-sans text-[0.875rem] text-primary">
    <div
      class="db-header flex flex-nowrap items-center justify-start gap-[0.5rem] rounded-t-md border-b border-b-border-default bg-card px-[0.75rem] py-[0.5rem]"
      draggable="true"
      @dragstart="drag?.onHeaderDragStart($event)"
      @dragend="drag?.onHeaderDragEnd()"
    >
      <span :class="dtIconClass">⚖️</span>
      <div class="db-totals flex flex-wrap gap-[1.5rem]">
        <div class="db-total-item">
          <label class="block text-[0.68rem] uppercase tracking-[0.05em] text-muted">{{ dashT('dash.totalBalance', 'Total Balance') }}</label>
          <span class="db-green text-[0.88rem] font-semibold text-success">${{ num(totals.balance).toFixed(2) }} USDT</span>
        </div>
        <div class="db-total-item">
          <label class="block text-[0.68rem] uppercase tracking-[0.05em] text-muted">{{ dashT('dash.totalUPnl', 'Total uPnl') }}</label>
          <span class="text-[0.88rem] font-semibold" :style="{ color: upnlColor(num(totals.upnl)) }">{{ signedFmt(num(totals.upnl)) }}</span>
        </div>
        <div class="db-total-item">
          <label class="block text-[0.68rem] uppercase tracking-[0.05em] text-muted">{{ dashT('dash.totalTwe', 'Total TWE') }}</label>
          <span class="text-[0.88rem] font-semibold" :style="{ color: tweColor(num(totals.we)) }">{{ num(totals.we).toFixed(2) }} %</span>
        </div>
      </div>
      <div class="db-user-sel relative ml-auto flex items-center gap-[0.4rem]">
        <label class="text-[0.73rem] text-secondary">{{ dashT('dash.usersColon', 'Users:') }}</label>
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
        &#128465;
      </Button>
    </div>
    <div class="db-status border-b border-b-card bg-page px-[0.75rem] py-[0.15rem] text-[0.68rem] text-muted" :style="{ color: displayStatusColor }">{{ displayStatus }}</div>
    <div v-if="rows.length === 0" class="db-nodata p-[1.5rem] text-center text-[0.85rem] text-border-strong">
      {{ dashT('dash.noBalanceData', 'No balance data.') }}
    </div>
    <div v-else class="db-table-wrap overflow-x-auto">
      <table class="db-table w-full border-collapse">
        <thead>
          <tr>
            <th class="cursor-pointer select-none border-b border-b-border-default bg-card px-[0.7rem] py-[0.4rem] text-left text-[0.75rem] font-medium uppercase tracking-[0.04em] text-secondary hover:text-primary">{{ dashT('dash.user', 'User') }}</th>
            <th class="cursor-pointer select-none border-b border-b-border-default bg-card px-[0.7rem] py-[0.4rem] text-left text-[0.75rem] font-medium uppercase tracking-[0.04em] text-secondary hover:text-primary">{{ dashT('dash.date', 'Date') }}</th>
            <th class="cursor-pointer select-none border-b border-b-border-default bg-card px-[0.7rem] py-[0.4rem] text-left text-[0.75rem] font-medium uppercase tracking-[0.04em] text-secondary hover:text-primary">{{ dashT('dash.balanceUsdt', 'Balance USDT') }}</th>
            <th class="cursor-pointer select-none border-b border-b-border-default bg-card px-[0.7rem] py-[0.4rem] text-left text-[0.75rem] font-medium uppercase tracking-[0.04em] text-secondary hover:text-primary">{{ dashT('dash.upnl', 'uPnl') }}</th>
            <th class="cursor-pointer select-none border-b border-b-border-default bg-card px-[0.7rem] py-[0.4rem] text-left text-[0.75rem] font-medium uppercase tracking-[0.04em] text-secondary hover:text-primary">{{ dashT('dash.twePct', 'TWE %') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.user + '|' + r.date">
            <td class="border-b border-b-card px-[0.7rem] py-[0.35rem]">{{ r.user }}</td>
            <td class="db-muted border-b border-b-card px-[0.7rem] py-[0.35rem] text-[0.76rem] text-secondary">{{ r.date }}</td>
            <td class="border-b border-b-card px-[0.7rem] py-[0.35rem]">{{ num(r.balance).toFixed(2) }}</td>
            <td class="border-b border-b-card px-[0.7rem] py-[0.35rem]" :style="{ color: upnlColor(num(r.upnl)) }">{{ signedFmt(num(r.upnl)) }}</td>
            <td class="border-b border-b-card px-[0.7rem] py-[0.35rem]">
              <div class="db-twe-cell flex items-center gap-[0.4rem]">
                <div class="db-twe-track h-[7px] min-w-[50px] flex-1 overflow-hidden rounded-[3px] bg-border-default">
                  <div
                    class="db-twe-fill h-full w-full origin-left rounded-[3px] [transition:transform_.3s,background_.3s]"
                    :style="{ transform: `scaleX(${Number(tweBarPct(num(r.we))) / 100})`, background: tweColor(num(r.we)) }"
                  ></div>
                </div>
                <span class="db-twe-lbl min-w-[44px] text-right text-[0.76rem]" :style="{ color: tweColor(num(r.we)) }">{{
                  num(r.we).toFixed(2)
                }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
/* Row hover paints the td descendants (ported from styles/widgets.css —
   a descendant relationship utilities cannot express; un-layered scoped
   CSS beats the td utilities, exactly like the legacy cascade). */
.db-table tbody tr:hover td {
  background: var(--bg-elevated);
}
</style>
