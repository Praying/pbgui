<script setup lang="ts">
/**
 * WidgetOrders — the ORDERS widget: buildOrdersInline
 * (dashboard_editor.html:1977-2152) + DashRender.buildOrders chrome
 * (dashboard_render.js:3612-3857) on the D-editor-2 cell contract.
 *
 * Legacy parity notes:
 *  - link resolution happens once per build (the cell's epoch remount):
 *    `dashboard_orders_<r>_<c>` persists a `view_orders_<r>_<c>` link; when
 *    empty it auto-links to the FIRST POSITIONS cell and syncs (editor:1985-1999);
 *  - the linkage consumes the D-5 positionsBus (the render.js:3245-3251
 *    'dash-pos-selected' contract + the window['_dashPosSelected_*'] late-bind
 *    memory) filtered to the linked grid cell (editor:2135-2151);
 *  - selection loads fetch orders_data with the tf limit + live=1; a NEW
 *    selection is a full chart rebuild (legacy buildOrders innerHTML=''),
 *    while a TIMEFRAME switch and lazy history loading go through the
 *    controller fast paths setData/prependData — no chart rebuild, and
 *    prepends keep the visible range (R8);
 *  - staleness guards: the per-key generation counter replaces the legacy
 *    `window['_ordInlineLoadSeq_'+pos]` seq, and an instance tfFetchId
 *    replaces `_tfFetchId`;
 *  - the clock ticks every second and the uPnL header shows the exchange
 *    value, recomputed through the controller's updateCandle/updatePosition
 *    wraps (render.js:3786-3812 → lib/ordersUpnl.ts);
 *  - dropped: the dead `.cell-cfg` link-chip DOM (display:none in legacy CSS,
 *    editor:308-310 — see the store's refreshOrdersCellsExcept for the
 *    cfg-refresh handoff) and reportHeight() (R12).
 */
import { computed, inject, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { PRECISION_PALETTE } from '@/shared/lib/precisionPalette';
import { useDashboardStore } from '../../stores/dashboardStore';
import { useDashboardFetch, currentGeneration } from '../../composables/useDashboardFetch';
import { useOrdersChart, type OrdersChartController, type RawCandle } from '../../composables/useOrdersChart';
import { useOrdersFullscreen } from '../../composables/useOrdersFullscreen';
import { cellContextKey } from '../../lib/cellContext';
import { dashT } from '../../lib/i18n';
import { ordersDataUrl } from '../../lib/endpoints';
import {
  DEFAULT_TIMEFRAME,
  LOAD_MORE_LIMIT,
  LOAD_MORE_LOOKBACK,
  TIMEFRAMES,
  timeframeLimit,
  timeframeMs,
} from '../../lib/timeframes';
import { onPositionSelected, rememberedPosition } from '../../lib/positionsBus';
import { useUpnlTracker } from '../../lib/ordersUpnl';
import { cellPos, WIDGET_META } from '../../lib/grid';
import { PERSISTED_CELL_KEYS, type OrdersData, type PositionRow } from '../../types/widgets';
import {
  dtMetaClass,
  dtMetaControlsClass,
  dtMetaLblClass,
  dtMetaSepClass,
  dtMetaUserClass,
  dtNodataClass,
  dtRootClass,
  dtStatusClass,
} from './uiClasses';
import WidgetHeader from './WidgetHeader.vue';

/* The .do-tf-btn timeframe toggle renders ui/Button now (active → info, idle
   → default); the legacy class names ride along as inert anchors — the tests
   select .do-tf-btn / .do-tf-active. */

/** The former .do-leg-solid/.do-leg-dotted/.do-leg-dashed swatches — the
 *  visible border colour comes from the inline style (borderColor). */
function legSwatchClass(style: string): string {
  if (style === 'do-leg-solid') return 'do-leg-solid inline-block w-[18px] border-b-2';
  if (style === 'do-leg-dotted') return 'do-leg-dotted inline-block w-[18px] [border-bottom:1px_dotted]';
  return 'do-leg-dashed inline-block w-[18px] [border-bottom:1px_dashed]';
}

/** The former .dt-pos/.dt-neg uPnL tint (lib/ordersUpnl keeps the legacy
 *  class names; this maps them onto the complete colour set). */
function upnlToneClass(cls: string | undefined): string {
  return cls === 'dt-pos' ? 'dt-pos text-success' : 'dt-neg text-danger';
}

/* .do-chart-wrap vs .do-chart-wrap.do-fullscreen (render.js:3824-3831):
   position and radius flip wholesale, so each state carries its own set. */
function chartWrapClass(fullscreen: boolean): string {
  return fullscreen
    ? 'do-chart-wrap group fixed left-0 top-0 z-[99999] w-screen! h-dvh! overflow-hidden rounded-none bg-page'
    : 'do-chart-wrap group relative h-[580px] w-full overflow-hidden rounded-md bg-page';
}

const store = useDashboardStore();
const ctx = inject(cellContextKey, null);
const pos = ctx ? cellPos(ctx.row, ctx.col) : 'missing';

/* ── link resolution (editor:1980-1999) ── */

const oKey = PERSISTED_CELL_KEYS.ordersCfg + '_' + pos;
let linked = String(store.state[oKey] || '');
if (!linked) {
  /* auto-link to the first POSITIONS cell in the grid */
  search: for (let r = 1; r <= store.rows; r++) {
    for (let c = 1; c <= store.cols; c++) {
      if (store.cellType(r, c) === 'POSITIONS') {
        linked = 'view_orders_' + r + '_' + c;
        store.state[oKey] = linked;
        store.scheduleSync();
        break search;
      }
    }
  }
}
const linkedGridPos = linked ? linked.replace('view_orders_', '') : '';

/* ── state (editor:2017-2023) ── */

const statusMessage = ref<string | null>(null);
const payload = shallowRef<OrdersData | null>(null);
let selectedPosition: PositionRow | null = null;
const currentTimeframe = ref<string>(DEFAULT_TIMEFRAME);
let tfFetchId = 0;
let disposed = false;

const fetchKey = 'ord_' + pos;
const fetchState = useDashboardFetch<OrdersData>(fetchKey);

function ordersUrl(sel: PositionRow, tf: string): string {
  return ordersDataUrl(
    store.config.apiBase,
    sel.user,
    sel.symbol,
    sel.side || 'long',
    tf,
    timeframeLimit(tf)
  );
}

/* ── chart lifecycle (render.js:3612-3857) ── */

const chartWrapEl = ref<HTMLElement | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const ctrl = shallowRef<OrdersChartController | null>(null);
const upnl = useUpnlTracker();

async function buildChart(data: OrdersData): Promise<void> {
  payload.value = data;
  await nextTick(); // the chart wrap renders with the payload
  if (disposed) return;
  ctrl.value?.destroy();
  ctrl.value = null;
  upnl.initFromPosition(data.position);
  const wrap = chartWrapEl.value;
  if (!wrap) return; // empty-candle payload → the nodata placeholder
  const created = useOrdersChart(wrap, data, {
    timeframe: currentTimeframe.value,
    onLoadMore,
  });
  if (!created) return;
  /* the live-uPnL wraps (render.js:3786-3812) */
  const origUpdateCandle = created.updateCandle;
  created.updateCandle = (candle: RawCandle) => {
    origUpdateCandle(candle);
    upnl.onCandleUpdate(candle[4]);
  };
  const origUpdatePosition = created.updatePosition;
  created.updatePosition = (posData: Parameters<typeof origUpdatePosition>[0]) => {
    origUpdatePosition(posData);
    upnl.onPositionUpdate(posData);
  };
  ctrl.value = created;
}

/* ── selection load (editor:2050-2133) ── */

async function loadOrders(): Promise<void> {
  tfFetchId++;
  if (!selectedPosition) {
    statusMessage.value = dashT('dash.selectPositionLinked', 'Select a position in the linked Positions widget');
    payload.value = null;
    return;
  }
  statusMessage.value = dashT('dash.loading', 'Loading…');
  const prevData = fetchState.data.value;
  const runPromise = fetchState.run(ordersUrl(selectedPosition, currentTimeframe.value));
  /* run() bumps the shared per-key generation synchronously — this run's gen */
  const runGen = fetchState.generation.value;
  await runPromise;
  if (disposed || currentGeneration(fetchKey) !== runGen) return; // superseded
  /* legacy showMessage(dataUnavailable) — the failed load replaces the chart.
   * A failure leaves the previous payload in place (useDashboardFetch's
   * keep-existing-content rule), so detect it by identity. */
  if (fetchState.data.value === prevData) {
    statusMessage.value = dashT('dash.dataUnavailable', '⚠ Data unavailable');
  }
}

watch(fetchState.data, (d) => {
  if (!d) return;
  statusMessage.value = null;
  void buildChart(d);
});

/* ── timeframe switch — the setData fast path (editor:2077-2099) ── */

async function onTfClick(tf: string): Promise<void> {
  currentTimeframe.value = tf; // active highlight moves immediately (render.js:3658-3664)
  const sel = selectedPosition;
  if (!sel) return;
  const fid = ++tfFetchId;
  const seq = currentGeneration(fetchKey); // the legacy window[_loadSeqKey] guard
  try {
    const resp = await fetch(ordersUrl(sel, tf));
    if (!resp.ok) throw new Error(String(resp.status));
    const d2 = (await resp.json()) as OrdersData;
    if (disposed || fid !== tfFetchId || currentGeneration(fetchKey) !== seq) return;
    if (ctrl.value && d2.candles) ctrl.value.setData(d2.candles);
    else await loadOrders();
  } catch {
    if (!disposed && fid === tfFetchId && currentGeneration(fetchKey) === seq) {
      await loadOrders();
    }
  }
}

/* ── lazy history loading — the prependData fast path (editor:2101-2123) ── */

function onLoadMore(oldestTs: number, done: () => void): void {
  const sel = selectedPosition;
  if (!sel) {
    done(); // defensive: unreachable (no chart without a selection)
    return;
  }
  const fetchTf = currentTimeframe.value;
  const fetchGen = ctrl.value?.gen() ?? 0;
  const seq = currentGeneration(fetchKey);
  const since = oldestTs - timeframeMs(fetchTf) * LOAD_MORE_LOOKBACK;
  fetch(ordersDataUrl(store.config.apiBase, sel.user, sel.symbol, sel.side || 'long', fetchTf, LOAD_MORE_LIMIT, since))
    .then((resp) => {
      if (!resp.ok) throw new Error(String(resp.status));
      return resp.json() as Promise<OrdersData>;
    })
    .then((older) => {
      if (disposed || currentGeneration(fetchKey) !== seq || currentTimeframe.value !== fetchTf) {
        done();
        return;
      }
      if (older.candles && older.candles.length > 0 && ctrl.value) {
        ctrl.value.prependData(older.candles, fetchGen);
      }
      done();
    })
    .catch(() => {
      done();
    });
}

/* ── linkage (editor:2135-2151) ── */

if (linkedGridPos) {
  const off = onPositionSelected((e) => {
    if (e.pos === linkedGridPos) {
      selectedPosition = e.data;
      void loadOrders();
    }
  });
  onScopeDispose(off);
  /* late bind: the selection may have happened before this widget mounted */
  const remembered = rememberedPosition(linkedGridPos);
  if (remembered) {
    selectedPosition = remembered;
    void loadOrders();
  } else {
    statusMessage.value = dashT('dash.selectPositionLinked', 'Select a position in the linked Positions widget');
  }
}

/* ── clock (render.js:3676-3704) ── */

const clockText = ref(new Date().toLocaleTimeString());
let clockTimer: ReturnType<typeof setInterval> | null = null;
clockTimer = setInterval(() => {
  clockText.value = new Date().toLocaleTimeString();
}, 1000);
onScopeDispose(() => {
  if (clockTimer !== null) clearInterval(clockTimer);
});

/* ── fullscreen (render.js:3815-3843) ── */

const fs = useOrdersFullscreen({
  rootEl,
  refit: () => {
    ctrl.value?.chart.timeScale().fitContent();
  },
});

/* ── teardown (the legacy destroy patch, render.js:3846-3854) ── */

onScopeDispose(() => {
  disposed = true;
  ctrl.value?.destroy();
  ctrl.value = null;
});

/* ── derived ── */

const candles = computed(() => payload.value?.candles ?? []);
const hasChart = computed(() => candles.value.length > 0);

/* the legend (render.js:3710-3728) */
const legend = computed(() => [
  { style: 'do-leg-solid', color: PRECISION_PALETTE.text.secondary, label: dashT('dash.entry', 'Entry') },
  { style: 'do-leg-dotted', color: PRECISION_PALETTE.text.secondary, label: dashT('dash.price', 'Price') },
  { style: 'do-leg-dashed', color: PRECISION_PALETTE.success.base, label: dashT('dash.buyOrder', 'Buy Order') },
  { style: 'do-leg-dashed', color: PRECISION_PALETTE.danger.base, label: dashT('dash.sellOrder', 'Sell Order') },
]);

const icon = WIDGET_META.ORDERS.icon;
</script>

<template>
  <div v-if="!linked" :class="dtStatusClass">
    {{ dashT('dash.linkPositionsForOrders', 'Link a POSITIONS widget above to see Orders preview.') }}
  </div>
  <div v-else ref="rootEl" :class="[dtRootClass, { 'do-fullscreen': fs.isFullscreen.value }]">
    <WidgetHeader :title="dashT('dash.orders', 'Orders')" :icon="icon">
      <span v-if="statusMessage" :class="dtMetaClass">{{ statusMessage }}</span>
      <div v-else-if="payload" :class="[dtMetaClass, dtMetaControlsClass]">
        <span :class="dtMetaLblClass">{{ dashT('dash.timeframe', 'Timeframe') }}</span>
        <div class="do-tf-bar flex flex-wrap items-center gap-[0.25rem]">
          <Button
            v-for="tf in TIMEFRAMES"
            :key="tf"
            type="button"
            size="sm"
            :variant="tf === currentTimeframe ? 'info' : 'default'"
            :class="tf === currentTimeframe ? 'do-tf-btn do-tf-active' : 'do-tf-btn'"
            @click="onTfClick(tf)"
          >
            {{ tf }}
          </Button>
        </div>
        <span :class="dtMetaSepClass">·</span>
        <span :class="dtMetaClass">{{ dashT('dash.user', 'User') }}:&nbsp;<span :class="dtMetaUserClass">{{ payload.user || '' }}</span>&nbsp;·&nbsp;{{ dashT('dash.symbol', 'Symbol') }}:&nbsp;<span :class="dtMetaUserClass">{{ payload.symbol || '' }}</span>&nbsp;·&nbsp;<span class="do-clock">{{ clockText }}</span><span v-if="upnl.text.value" class="do-pos-info">{{ ' · uPnL: ' }}<span :class="upnlToneClass(upnl.cls.value)">{{ upnl.text.value }}</span></span></span>
      </div>
    </WidgetHeader>
    <div v-if="statusMessage" :class="dtNodataClass">{{ statusMessage }}</div>
    <template v-else-if="payload">
      <div v-if="!hasChart" :class="dtNodataClass">
        {{ dashT('dash.noCandleSymbol', 'No candle data for this symbol.') }}
      </div>
      <div v-else ref="chartWrapEl" :class="chartWrapClass(fs.isFullscreen.value)">
        <div class="do-chart-toolbar absolute left-1 top-1 z-[20] hidden gap-0.5 rounded-[5px] border border-border-default bg-page/85 px-1 py-0.75 group-hover:flex">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="do-fs-btn px-1.25 py-0.5 text-[15px] leading-none hover:bg-elevated"
            :title="dashT('dash.fullscreen', 'Fullscreen')"
            @click="fs.toggleFullscreen()"
          >
            {{ fs.isFullscreen.value ? '✕' : '⛶' }}
          </Button>
        </div>
        <div class="do-legend pointer-events-none absolute left-10 top-1.5 z-10 flex gap-[0.75rem] text-[0.65rem] text-secondary">
          <span v-for="li in legend" :key="li.label" class="do-leg-item inline-flex items-center gap-1">
            <span :class="legSwatchClass(li.style)" :style="{ borderColor: li.color }"></span>{{ li.label }}
          </span>
        </div>
      </div>
    </template>
  </div>
</template>
