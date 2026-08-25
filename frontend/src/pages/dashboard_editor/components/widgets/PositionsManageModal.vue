<script setup lang="ts">
/**
 * PositionsManageModal — port of openManageModal + renderManageRows +
 * requestManageAction + the drag/resize machinery of DashRender.buildPositions
 * (dashboard_render.js:2261-2451, 2453-2508, 2693-2879, 2881-3198).
 *
 * Ownership split (legacy manageState, render.js:2261):
 *  - controls map + single-flight actions live in WidgetPositions (per
 *    buildPositions closure in legacy — they survive modal close and reset on
 *    widget rebuild); this modal reads/writes through the props;
 *  - geometry, status line, preview modal and row rendering live here.
 *
 * Legacy parity notes:
 *  - the amount input shows syncedAmountFor(row, state) (legacy
 *    syncManageAmountInputs:2553-2566 — quickPct recompute / untouched
 *    re-default happen on every live update; typed values persist in
 *    state.amount because amountTouched short-circuits the recompute);
 *  - the quote input keeps the raw text while typing (legacy never rewrote
 *    quoteInput in its own handler) via a per-key draft, and shows the
 *    formatted quote otherwise;
 *  - legacy deferred row re-render while an input/select was focused
 *    (isManageEditing/pendingRefresh, 2510-2526). Vue keyed rows make that
 *    unnecessary: live updates never remount inputs of surviving rows and
 *    control state is keyed separately from row data — the edit survives,
 *    which was the point of the deferral (documented deviation);
 *  - the fresh close-price fetch runs per row render (legacy
 *    renderManageRows:2876) for hyperliquid rows, once (loaded-flag sticks,
 *    also on error);
 *  - drag = head mousedown (except the close button), resize = 8 handles;
 *    both set the legacy data-user-moved / data-user-resized flags (as refs)
 *    which stop updateManageDialogSize from re-centering.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { dashT, dashServerMsg } from '../../lib/i18n';
import {
  ACTION_OPTIONS,
  POSITION_COLUMNS,
  buildRowAction,
  closePriceForRow,
  formatManageNumber,
  initialManageModalGeometry,
  manageModalHeightFor,
  manageRowControls,
  manageSuccessMessage,
  manageTableHeightForRows,
  panicAllButtonsState,
  parseAmountValue,
  positionCellText,
  quoteCurrencyForRow,
  quoteValueForAmount,
  rememberMarketCloseErrorHint,
  rowKey,
  shouldLoadFreshClosePrice,
  syncedAmountFor,
  defaultAmountForRow,
  type ManageBody,
  type ManageControlState,
} from '../../lib/manageLogic';
import type { ManageActionsController } from '../../composables/useManageActions';
import { dpModalChrome } from './uiClasses';
import type { PositionRow } from '../../types/widgets';
import PositionsConfigPreviewModal from './PositionsConfigPreviewModal.vue';

const props = defineProps<{
  /** Live positions (reactive; updates render in place, keyed by row). */
  rows: PositionRow[];
  /** The widget's selection (v-model:selected-row). */
  selectedRow: PositionRow | null;
  /** Legacy manageState.controls — owned by the widget (survives close). */
  controls: Record<string, ManageControlState>;
  /** Legacy manageState.actionInFlight owner — the widget's single flight. */
  actions: ManageActionsController;
  /** Legacy %%API_BASE%%. */
  apiBase: string;
}>();

const emit = defineEmits<{
  'update:selectedRow': [row: PositionRow];
  close: [];
  /** Legacy onReload — fired 600 ms after a successful non-dry-run action. */
  reload: [];
}>();

const cols = POSITION_COLUMNS;
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;
const MIN_MODAL_WIDTH = 640;
const MIN_MODAL_HEIGHT = 280;

/* ── per-row control state (render.js:2540-2551) ── */

function state(r: PositionRow): ManageControlState {
  const key = rowKey(r);
  if (!props.controls[key]) {
    props.controls[key] = {
      action: 'market_close',
      amount: defaultAmountForRow(r),
      amountTouched: false,
      quickPct: null,
      closePrice: 0,
      closePriceLoaded: false,
      closePriceLoading: false,
      minCloseValue: 0,
      minCloseAmount: 0,
    };
  }
  /* re-read through the reactive record: the raw literal above must never
     escape — mutations through it would skip dependency tracking */
  return props.controls[key]!;
}

/* ── geometry / drag / resize (render.js:2263-2277, 2903-2909, 3074-3182) ── */

const modalEl = ref<HTMLElement | null>(null);
/* the close button is a ui/Button — the ref lands on the component, so the
   drag exclusion compares the rendered root element ($el) */
const closeBtnEl = ref<{ $el: HTMLElement } | null>(null);
const userMoved = ref(false);
const userResized = ref(false);
const geometry = ref(
  initialManageModalGeometry(window.innerWidth, window.innerHeight, props.rows.length)
);

const modalStyle = computed(() => ({
  width: geometry.value.width + 'px',
  height: geometry.value.height + 'px',
  left: geometry.value.left + 'px',
  top: geometry.value.top + 'px',
}));

const tableHeight = computed(() => manageTableHeightForRows(props.rows.length));

/* legacy updateManageDialogSize (render.js:2267-2277) */
function updateDialogSize(): void {
  if (!userResized.value) {
    geometry.value.height = manageModalHeightFor(window.innerHeight, tableHeight.value);
    if (!userMoved.value) {
      geometry.value.top = Math.max(12, Math.floor((window.innerHeight - geometry.value.height) / 2));
    }
  }
}

watch(() => props.rows.length, () => updateDialogSize(), { flush: 'post' });

/* drag (render.js:3074-3106) */
interface DragStart {
  x: number;
  y: number;
  left: number;
  top: number;
}

let dragStart: DragStart | null = null;

function onHeadMouseDown(e: MouseEvent): void {
  if (e.target === closeBtnEl.value?.$el) return;
  userMoved.value = true;
  dragStart = { x: e.clientX, y: e.clientY, left: geometry.value.left, top: geometry.value.top };
  e.preventDefault();
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
}

function onDragMove(e: MouseEvent): void {
  if (!dragStart) return;
  geometry.value.left = Math.max(0, Math.min(window.innerWidth - 80, dragStart.left + e.clientX - dragStart.x));
  geometry.value.top = Math.max(0, Math.min(window.innerHeight - 48, dragStart.top + e.clientY - dragStart.y));
}

function onDragEnd(): void {
  dragStart = null;
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
}

/* resize (render.js:3108-3182) */
interface ResizeStart {
  dir: string;
  x: number;
  y: number;
  left: number;
  top: number;
  width: number;
  height: number;
}

let resizeStart: ResizeStart | null = null;

function onHandleMouseDown(e: MouseEvent, dir: string): void {
  userResized.value = true;
  /* geometry is the single source of truth (legacy read getBoundingClientRect
     of the style it had just mutated — same numbers here, jsdom-testable) */
  resizeStart = {
    dir,
    x: e.clientX,
    y: e.clientY,
    left: geometry.value.left,
    top: geometry.value.top,
    width: geometry.value.width,
    height: geometry.value.height,
  };
  e.preventDefault();
  e.stopPropagation();
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeEnd);
}

function onResizeMove(e: MouseEvent): void {
  const st = resizeStart;
  if (!st) return;
  const dx = e.clientX - st.x;
  const dy = e.clientY - st.y;
  let left = st.left;
  let top = st.top;
  let width = st.width;
  let height = st.height;
  if (st.dir.indexOf('e') !== -1) width = st.width + dx;
  if (st.dir.indexOf('s') !== -1) height = st.height + dy;
  if (st.dir.indexOf('w') !== -1) {
    width = st.width - dx;
    left = st.left + dx;
  }
  if (st.dir.indexOf('n') !== -1) {
    height = st.height - dy;
    top = st.top + dy;
  }
  if (width < MIN_MODAL_WIDTH) {
    if (st.dir.indexOf('w') !== -1) left -= MIN_MODAL_WIDTH - width;
    width = MIN_MODAL_WIDTH;
  }
  if (height < MIN_MODAL_HEIGHT) {
    if (st.dir.indexOf('n') !== -1) top -= MIN_MODAL_HEIGHT - height;
    height = MIN_MODAL_HEIGHT;
  }
  left = Math.max(0, Math.min(window.innerWidth - 80, left));
  top = Math.max(0, Math.min(window.innerHeight - 48, top));
  width = Math.min(width, window.innerWidth - left - 12);
  height = Math.min(height, window.innerHeight - top - 12);
  geometry.value = { width, height, left, top };
}

function onResizeEnd(): void {
  resizeStart = null;
  document.removeEventListener('mousemove', onResizeMove);
  document.removeEventListener('mouseup', onResizeEnd);
}

onBeforeUnmount(() => {
  onDragEnd();
  onResizeEnd();
});

/* ── status + preview (render.js:2389-2392, 2394-2451) ── */

const status = ref<{ msg: string; kind: '' | 'ok' | 'err' }>({ msg: '', kind: '' });
const preview = ref<{ title: string; config: unknown } | null>(null);

/* ── row rendering (render.js:2693-2879) ── */

/* Tailwind tone mappings (the former .dp-upnl-pos/.dp-upnl-neg,
   .dp-status-msg.ok/.err and .dp-resize-* rules of styles/widgets.css) —
   every branch returns the complete colour/geometry set; the legacy class
   names ride along as inert anchors the tests select. */
function upnlClass(r: PositionRow): string {
  return Number(r.upnl || 0) >= 0 ? 'dp-upnl-pos text-success-soft' : 'dp-upnl-neg text-danger-soft';
}

function statusToneClass(kind: '' | 'ok' | 'err'): string {
  if (kind === 'ok') return 'ok text-success-soft';
  if (kind === 'err') return 'err text-danger-soft';
  return '';
}

function resizeHandleClass(dir: string): string {
  const base = 'dp-resize-handle dp-resize-' + dir + ' absolute z-[5]';
  switch (dir) {
    case 'n': return base + ' -top-1 left-2.5 right-2.5 h-2 cursor-ns-resize';
    case 's': return base + ' -bottom-1 left-2.5 right-2.5 h-2 cursor-ns-resize';
    case 'e': return base + ' -right-1 top-2.5 bottom-2.5 w-2 cursor-ew-resize';
    case 'w': return base + ' -left-1 top-2.5 bottom-2.5 w-2 cursor-ew-resize';
    case 'ne': return base + ' -top-1.25 -right-1.25 h-3 w-3 cursor-nesw-resize';
    case 'nw': return base + ' -top-1.25 -left-1.25 h-3 w-3 cursor-nwse-resize';
    case 'se': return base + ' -bottom-1.25 -right-1.25 h-3 w-3 cursor-nwse-resize';
    default: return base + ' -bottom-1.25 -left-1.25 h-3 w-3 cursor-nesw-resize'; /* sw */
  }
}

function ctl(r: PositionRow): ReturnType<typeof manageRowControls> {
  return manageRowControls(r, state(r), props.actions.actionInFlight.value);
}

function amountDisplay(r: PositionRow): string {
  return syncedAmountFor(r, state(r));
}

/* quote drafts: raw text while typing (legacy never rewrote quoteInput in
   its own handler); formatted quote otherwise (render.js:2563, 2794) */
const quoteDrafts = ref<Record<string, string>>({});

function quoteDisplay(r: PositionRow): string {
  const draft = quoteDrafts.value[rowKey(r)];
  if (draft !== undefined) return draft;
  return formatManageNumber(quoteValueForAmount(r, syncedAmountFor(r, state(r)), state(r)), 4);
}

function selectRow(r: PositionRow): void {
  emit('update:selectedRow', r);
}

/* selected-row highlight by rowKey: the prop crosses a component boundary,
   where Vue may hand back a reactive proxy — key equality is the stable
   equivalent of legacy `row === selectedRowData` (render.js:2722). */
const selectedKey = computed<string>(() => (props.selectedRow ? rowKey(props.selectedRow) : ''));

function onActionChange(r: PositionRow, value: string): void {
  state(r).action = value as ManageControlState['action'];
  status.value = { msg: '', kind: '' }; /* render.js:2763 */
}

/** The selected action option's label — the legacy <select> showed the
 *  selected <option>'s text; the reka trigger renders it from the model. */
function actionLabel(r: PositionRow): string {
  const current = state(r).action;
  return ACTION_OPTIONS(r).find((o) => o.value === current)?.label ?? current;
}

/** runClass keeps the legacy tone anchors (dp-row-run danger/warn/ok) as
 *  inert classes; the Button variant carries the actual tone now. */
function runVariant(runClass: string): 'danger' | 'warning' | 'success' | 'default' {
  if (runClass.includes('danger')) return 'danger';
  if (runClass.includes('warn')) return 'warning';
  if (runClass.includes('ok')) return 'success';
  return 'default';
}

function onAmountInput(r: PositionRow, e: Event): void {
  const st = state(r);
  st.amountTouched = true;
  st.quickPct = null;
  st.amount = (e.target as HTMLInputElement).value;
  delete quoteDrafts.value[rowKey(r)]; /* quote reformats from the amount */
}

function onQuoteInput(r: PositionRow, e: Event): void {
  const st = state(r);
  st.amountTouched = true;
  st.quickPct = null;
  quoteDrafts.value[rowKey(r)] = (e.target as HTMLInputElement).value;
  const quoteValue = parseAmountValue((e.target as HTMLInputElement).value);
  const price = closePriceForRow(r, st);
  if (!isNaN(quoteValue) && quoteValue >= 0 && price > 0) {
    st.amount = formatManageNumber(quoteValue / price, 8);
  }
}

function onQuick(r: PositionRow, pct: number): void {
  const st = state(r);
  st.amountTouched = true;
  st.quickPct = pct;
  st.amount = formatManageNumber((Math.abs(Number(r.size || 0)) * pct) / 100, 8);
  delete quoteDrafts.value[rowKey(r)];
}

function onRun(r: PositionRow): void {
  const res = buildRowAction(r, state(r));
  if (!res.ok) {
    status.value = { msg: res.message, kind: 'err' };
    return;
  }
  selectRow(r); /* render.js:2843 — the executed row becomes the selection */
  void requestAction(res.body);
}

/* ── action requests (render.js:2453-2508) ── */

async function requestAction(body: ManageBody): Promise<void> {
  if (props.actions.actionInFlight.value) {
    status.value = {
      msg: dashT('dash.anotherActionRunning', 'Another manage action is still running.'),
      kind: 'err',
    };
    return;
  }
  status.value = { msg: dashT('dash.working', 'Working...'), kind: '' };
  const res = await props.actions.runAction(body);
  if (res.ok) {
    const success = manageSuccessMessage(body, res.data);
    status.value = { msg: success.statusText, kind: 'ok' };
    if (success.preview) preview.value = success.preview;
    /* render.js:2494 — non-dry-run successes reload the widget after 600 ms */
    if (!res.data.dry_run) setTimeout(() => emit('reload'), 600);
  } else {
    const hint = rememberMarketCloseErrorHint(body, res.errorMessage);
    if (hint && props.controls[hint.key]) {
      props.controls[hint.key]!.minCloseAmount = hint.minCloseAmount;
    }
    status.value = { msg: res.errorMessage, kind: 'err' };
  }
}

/* ── footer buttons (render.js:2652-2691, 3025-3072) ── */

const selectedUser = computed<string>(() => {
  const r = props.selectedRow ?? props.rows[0];
  return r ? String(r.user || '') : '';
});

const footer = computed(() => panicAllButtonsState(selectedUser.value, props.actions.actionInFlight.value));

function runAll(action: string, dryRun: boolean): void {
  const user = selectedUser.value;
  if (!user) {
    status.value = { msg: dashT('dash.selectUserPositionFirst', 'Select a user position first.'), kind: 'err' };
    return;
  }
  const body: ManageBody = { user, action };
  if (dryRun) body.dry_run = true;
  void requestAction(body);
}

/* ── fresh close-price fetch (render.js:2363-2387, fired per row render) ── */

function fetchFreshClosePrice(r: PositionRow): void {
  const st = state(r);
  if (!shouldLoadFreshClosePrice(r, st)) return;
  st.closePriceLoading = true;
  const url =
    props.apiBase +
    '/dashboard/positions/close_price?user=' + encodeURIComponent(r.user || '') +
    '&symbol=' + encodeURIComponent(r.symbol || '') +
    '&side=' + encodeURIComponent(r.side || '');
  fetch(url)
    .then((resp) =>
      resp.json().then((data) => {
        if (!resp.ok) throw new Error((data as { detail?: string })?.detail ? (data as { detail: string }).detail : resp.statusText);
        return data as { price?: unknown; min_cost?: unknown };
      })
    )
    .then((data) => {
      st.closePriceLoading = false;
      st.closePriceLoaded = true;
      st.closePrice = Number(data.price || 0) || 0;
      st.minCloseValue = Number(data.min_cost || 0) || 0;
      /* quote display recomputes reactively (legacy rewrote quoteInput) */
    })
    .catch((err: unknown) => {
      st.closePriceLoading = false;
      st.closePriceLoaded = true;
      status.value = {
        msg:
          dashServerMsg(err instanceof Error ? err.message : String(err)) ||
          dashT('dash.couldNotLoadClosePrice', 'Could not load fresh close price.'),
        kind: 'err',
      };
    });
}

watch(() => props.rows, () => {
  for (const r of props.rows) fetchFreshClosePrice(r);
}, { immediate: true, flush: 'post' });
</script>

<template>
  <Teleport to="body">
    <div id="dp-manage-modal" :class="dpModalChrome.ovl">
      <div
        ref="modalEl"
        class="dp-modal fixed flex h-auto w-[calc(100vw-32px)] min-h-[220px] min-w-[640px] max-h-[calc(100dvh-24px)] max-w-[calc(100vw-16px)] flex-col overflow-visible rounded-[12px] border border-border-default bg-page font-sans text-primary shadow-[0_20px_70px_rgba(5,8,14,0.85)]"
        :style="modalStyle" :data-user-moved="userMoved ? '1' : undefined" :data-user-resized="userResized ? '1' : undefined">
        <div :class="dpModalChrome.head" @mousedown="onHeadMouseDown">
          <div :class="dpModalChrome.title">{{ dashT('dash.managePositions', 'Manage positions') }}</div>
          <Button ref="closeBtnEl" type="button" variant="ghost" :class="dpModalChrome.close" @click="emit('close')">&#x2715;</Button>
        </div>
        <div :class="dpModalChrome.body">
          <div class="dp-manage-wrap min-h-0 flex-none overflow-auto rounded-lg border border-border-default bg-page" :style="{ maxHeight: tableHeight + 'px' }">
            <table class="dp-manage-table w-full min-w-[1320px] border-collapse text-[0.76rem]">
              <thead>
                <tr>
                  <th v-for="c in cols" :key="c.key" class="sticky top-0 z-[1] border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">{{ dashT(c.i18nKey, c.fallback) }}</th>
                  <th class="sticky top-0 z-[1] border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">{{ dashT('dash.action', 'Action') }}</th>
                  <th class="sticky top-0 z-[1] border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">{{ dashT('dash.amount', 'Amount') }}</th>
                  <th class="sticky top-0 z-[1] border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">USDT/USDC</th>
                  <th class="dp-quick-col sticky top-0 z-[1] w-[142px] min-w-[142px] overflow-hidden border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">{{ dashT('dash.quick', 'Quick') }}</th>
                  <th class="dp-exec-col sticky top-0 z-[1] w-[124px] min-w-[124px] border-b border-b-border-default bg-card px-[0.45rem] py-[0.35rem] text-left font-semibold whitespace-nowrap text-secondary">{{ dashT('dash.execute', 'Execute') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="rows.length === 0">
                  <td
                    :colspan="cols.length + 5"
                    style="color: var(--text-secondary); text-align: center; padding: 1.25rem"
                  >
                    {{ dashT('dash.noOpenPositions', 'No open positions.') }}
                  </td>
                </tr>
                <tr
                  v-for="r in rows"
                  :key="rowKey(r)"
                  :class="{ 'dp-sel': rowKey(r) === selectedKey }"
                  @click="selectRow(r)"
                >
                  <td
                    v-for="c in cols"
                    :key="c.key"
                    class="border-b border-b-card px-[0.45rem] py-[0.35rem] align-middle whitespace-nowrap"
                    :class="c.key === 'upnl' ? upnlClass(r) : undefined"
                  >
                    {{ positionCellText(r, c) }}
                  </td>
                  <td>
                    <SelectRoot
                      :model-value="state(r).action"
                      @update:model-value="onActionChange(r, String($event))"
                    >
                      <SelectTrigger class="dp-manage-action h-7 min-w-[176px] text-xs" @click.stop>
                        <span>{{ actionLabel(r) }}</span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="o in ACTION_OPTIONS(r)"
                          :key="o.value"
                          :value="o.value"
                          :disabled="o.disabled"
                          :data-value="o.value"
                        >
                          {{ o.label }}
                        </SelectItem>
                      </SelectContent>
                    </SelectRoot>
                  </td>
                  <td>
                    <Input
                      class="dp-manage-amount w-[86px]"
                      size="sm"
                      type="text"
                      inputmode="decimal"
                      :model-value="amountDisplay(r)"
                      :disabled="ctl(r).amountDisabled"
                      @click.stop
                      @input="onAmountInput(r, $event)"
                    />
                  </td>
                  <td>
                    <Input
                      class="dp-manage-amount dp-manage-quote w-[86px]"
                      size="sm"
                      type="text"
                      inputmode="decimal"
                      :model-value="quoteDisplay(r)"
                      :disabled="ctl(r).quoteDisabled"
                      :title="dashT('dash.closeValueIn', 'Close value in {currency}; edits are converted to amount.', { currency: quoteCurrencyForRow(r) })"
                      :placeholder="quoteCurrencyForRow(r)"
                      @click.stop
                      @input="onQuoteInput(r, $event)"
                    />
                  </td>
                  <td class="dp-quick-col w-[142px] min-w-[142px] overflow-hidden border-b border-b-card px-[0.45rem] py-[0.35rem] align-middle whitespace-nowrap">
                    <div class="dp-quick flex min-w-[132px] flex-nowrap gap-[0.25rem]" :style="{ visibility: ctl(r).quickVisible ? 'visible' : 'hidden' }">
                      <Button v-for="pct in [25, 50, 100]" :key="pct" type="button" size="sm" class="min-w-[40px] px-1.5" @click.stop="onQuick(r, pct)">
                        {{ pct }}%
                      </Button>
                    </div>
                  </td>
                  <td class="dp-exec-col w-[124px] min-w-[124px] border-b border-b-card px-[0.45rem] py-[0.35rem] align-middle whitespace-nowrap">
                    <Button
                      type="button"
                      size="sm"
                      :variant="runVariant(ctl(r).runClass)"
                      :class="ctl(r).runClass + ' min-w-[104px]'"
                      :disabled="ctl(r).runDisabled"
                      :title="ctl(r).runTitle"
                      @click.stop="onRun(r)"
                    >
                      {{ ctl(r).runText }}
                    </Button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="dp-note text-[0.74rem] leading-[1.45] text-secondary">
            {{ dashT('dash.manageNote', 'Market close sends a direct reduce-only market order only for exchange contracts verified by PBGui; unavailable contracts remain visibly disabled. Panic, Graceful Stop and Take Profit Only actions save the Passivbot config and sync it. Use preview to inspect all-position configs without saving or syncing.') }}
          </div>
          <div :class="[dpModalChrome.statusMsg, statusToneClass(status.kind)]">{{ status.msg }}</div>
          <div :class="dpModalChrome.actions">
            <Button type="button" size="sm" :disabled="footer.previewPanic.disabled" :title="footer.previewPanic.title" @click="runAll('panic_all', true)">
              {{ footer.previewPanic.text }}
            </Button>
            <Button type="button" size="sm" variant="danger" class="danger" :disabled="footer.panic.disabled" :title="footer.panic.title" @click="runAll('panic_all', false)">
              {{ footer.panic.text }}
            </Button>
            <Button type="button" size="sm" :disabled="footer.previewGraceful.disabled" :title="footer.previewGraceful.title" @click="runAll('graceful_stop_all', true)">
              {{ footer.previewGraceful.text }}
            </Button>
            <Button type="button" size="sm" variant="warning" class="warn" :disabled="footer.graceful.disabled" :title="footer.graceful.title" @click="runAll('graceful_stop_all', false)">
              {{ footer.graceful.text }}
            </Button>
            <Button type="button" size="sm" :disabled="footer.previewTpOnly.disabled" :title="footer.previewTpOnly.title" @click="runAll('tp_only_all', true)">
              {{ footer.previewTpOnly.text }}
            </Button>
            <Button type="button" size="sm" variant="success" class="ok" :disabled="footer.tpOnly.disabled" :title="footer.tpOnly.title" @click="runAll('tp_only_all', false)">
              {{ footer.tpOnly.text }}
            </Button>
            <span class="spacer flex-1"></span>
            <Button type="button" size="sm" @click="emit('close')">{{ dashT('common.close', 'Close') }}</Button>
          </div>
        </div>
        <div
          v-for="dir in RESIZE_DIRS"
          :key="dir"
          :class="resizeHandleClass(dir)"
          :data-dir="dir"
          @mousedown="onHandleMouseDown($event, dir)"
        ></div>
      </div>
    </div>
  </Teleport>
  <PositionsConfigPreviewModal
    v-if="preview"
    :title="preview.title"
    :config="preview.config"
    @close="preview = null"
  />
</template>

<style>
/* The manage-modal button system moved to ui/Button (variants carry the
   danger/warn/ok tones; the legacy .dp-row-run/.danger/.warn/.ok class names
   ride along as inert anchors the tests select).

   Row states paint the td descendants (a relationship utilities cannot
   express; cascade order preserved from the legacy sheet). */
.dp-manage-table tr:hover td {
  background: var(--bg-elevated);
}
.dp-manage-table tr.dp-sel td {
  background: rgb(var(--accent-rgb) / 0.22);
}
</style>
