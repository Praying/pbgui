<script setup lang="ts">
/**
 * Queue panel — renderQueue (:5136-5177), the local queue sort
 * (:5126-5135), click-to-toggle + drag multi-select (:5787-5844) and
 * selectAll/deselectAll (:5846-5851) + deleteSelectedQueue with its
 * confirm modal (:5857-5871). The legacy auto-scroll helper
 * (tickRowSelectAutoScroll :5642) lands with M-v7-10's shared row-
 * selection surface.
 */
import { PhChartBar, PhFileText, PhPlay, PhStop, PhTrash } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { modalBackdropClass, modalBoxClass, modalBtnClass } from '../lib/uiClasses';
import type { QueueItem } from '../types';

const props = defineProps<{ items: QueueItem[]; active?: boolean }>();
const emit = defineEmits<{
  start: [filename: string];
  restart: [filename: string];
  stop: [filename: string];
  remove: [filename: string];
  viewResults: [name: string];
  showLog: [filename: string];
  editConfig: [name: string];
  delete: [filenames: string[]];
  nothingSelected: [];
}>();

const { t } = useI18n();

/* local sort — NOT persisted (legacy _queueSort :5126) */
const sortCol = ref<string>('created');
const sortAsc = ref(false);

function setSort(col: string): void {
  if (sortCol.value === col) sortAsc.value = !sortAsc.value;
  else {
    sortCol.value = col;
    sortAsc.value = false; // :5129 — new column starts DESCENDING
  }
}

const sorted = computed<QueueItem[]>(() => {
  const copy = [...props.items];
  copy.sort((a, b) => {
    const va = String((a as unknown as Record<string, unknown>)[sortCol.value] ?? '');
    const vb = String((b as unknown as Record<string, unknown>)[sortCol.value] ?? '');
    if (va < vb) return sortAsc.value ? -1 : 1;
    if (va > vb) return sortAsc.value ? 1 : -1;
    return 0;
  });
  return copy;
});

const COLUMNS = [
  { key: 'status', labelKey: 'v7backtest.status' },
  { key: 'name', labelKey: 'v7backtest.name' },
  { key: 'exchange', labelKey: 'v7backtest.exchange' },
  { key: 'created', labelKey: 'v7backtest.created' },
] as const;

/* ── selection: click toggles, drag ranges (:5787-5844) ── */
const selected = ref<Set<string>>(new Set());

function isItemSelected(item: QueueItem): boolean {
  return selected.value.has(item.filename);
}

let dragStart: { index: number; y: number } | null = null;
let dragging = false;
let dragMode: 'add' | 'remove' | null = null;

function onMouseDown(event: MouseEvent, item: QueueItem): void {
  if (event.button !== 0) return;
  dragStart = { index: sorted.value.indexOf(item), y: event.clientY };
  dragging = false;
  dragMode = null;
}

function onListMouseMove(event: MouseEvent): void {
  if (!dragStart) return;
  if (!dragging && Math.abs(event.clientY - dragStart.y) > 5) {
    dragging = true;
    dragMode = isItemSelected(sorted.value[dragStart.index]!) ? 'remove' : 'add';
  }
}

function onMouseEnter(item: QueueItem): void {
  if (!dragging || !dragStart) return;
  const anchor = dragStart.index;
  const current = sorted.value.indexOf(item);
  const lo = Math.min(anchor, current);
  const hi = Math.max(anchor, current);
  const next = new Set(selected.value);
  sorted.value.slice(lo, hi + 1).forEach((row) => {
    if (dragMode === 'add') next.add(row.filename);
    else next.delete(row.filename);
  });
  selected.value = next;
}

function onMouseUp(item: QueueItem): void {
  if (dragStart && !dragging) {
    const next = new Set(selected.value);
    if (next.has(item.filename)) next.delete(item.filename);
    else next.add(item.filename);
    selected.value = next;
  }
  dragStart = null;
  dragging = false;
  dragMode = null;
}

function selectAll(): void {
  selected.value = new Set(sorted.value.map((item) => item.filename));
}

function deselectAll(): void {
  selected.value = new Set();
}

function selectedFilenames(): string[] {
  return sorted.value.map((i) => i.filename).filter((fn) => selected.value.has(fn));
}

/* ── delete confirm (:5857-5871) ── */
const confirmOpen = ref(false);
let pendingDelete: string[] = [];

function deleteSelected(): void {
  const sel = selectedFilenames();
  if (!sel.length) {
    emit('nothingSelected');
    return;
  }
  pendingDelete = sel;
  confirmOpen.value = true;
}

function confirmDelete(): void {
  confirmOpen.value = false;
  emit('delete', pendingDelete);
}

function exchangeText(item: QueueItem): string {
  return Array.isArray(item.exchange) ? item.exchange.join(', ') : String(item.exchange ?? '—');
}

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

/** The emptyQueueHtml key carries a literal <br> — render without v-html. */
const emptyLines = computed<string[]>(() =>
  t('v7backtest.emptyQueueHtml')
    .split(/<br\s*\/?>/i)
    .map((line) => line.trim())
);

/* Queue status → badge tint (the former .badge-queued/running/backtesting/
   complete/error/stopped/unknown rules). Every branch returns the complete
   colour set; the badge-<status> class names stay on the element as inert
   anchors (the tests assert them). */
function badgeToneClass(status: string): string {
  if (status === 'queued') return 'bg-secondary/15 text-secondary';
  if (status === 'running') return 'bg-accent/15 text-accent';
  if (status === 'backtesting') return 'bg-warning/15 text-warning';
  if (status === 'complete') return 'bg-success/15 text-success';
  if (status === 'error' || status === 'stopped') return 'bg-danger/15 text-danger';
  return 'bg-warning/15 text-warning'; // unknown
}

defineExpose({ selectedFilenames, deleteSelected, selectAll, deselectAll });
</script>

<template>
  <div id="panel-queue" class="view-panel min-h-0 flex-1 flex-col overflow-hidden" :class="[props.active ? 'flex' : 'hidden', { active: props.active }]">
    <div id="queue-toolbar" class="mb-2 flex items-center gap-2 max-[760px]:flex-wrap">
      <span class="flex-1 max-[760px]:hidden"></span>
      <button type="button" class="act-btn" data-test="queue-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAll">
        {{ t('v7backtest.selectAll') }}
      </button>
      <button type="button" class="act-btn" data-test="queue-deselect-all" :title="t('v7backtest.deselectAll')" @click="deselectAll">
        {{ t('v7backtest.deselect') }}
      </button>
    </div>
    <div id="queue-list" class="min-h-0 flex-1 overflow-y-auto" @mousemove="onListMouseMove">
      <div v-if="!items.length" class="empty-state px-5 py-15 text-center text-md text-secondary">
        <div class="mb-3 text-[48px] opacity-40">⏳</div>
        <template v-for="(line, index) in emptyLines" :key="index">
          <br v-if="index > 0" />
          <span>{{ line }}</span>
        </template>
      </div>
      <table v-else class="tbl">
        <thead>
          <tr>
            <th v-for="column in COLUMNS" :key="column.key" @click="setSort(column.key)">
              {{ t(column.labelKey) }}<span class="sort-arrow">{{ sortCol === column.key ? (sortAsc ? ' ▲' : ' ▼') : '' }}</span>
            </th>
            <th>{{ t('v7backtest.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in sorted"
            :key="item.filename"
            :data-filename="item.filename"
            :class="{ selected: isItemSelected(item) }"
            @mousedown="onMouseDown($event, item)"
            @mouseenter="onMouseEnter(item)"
            @mouseup="onMouseUp(item)"
          >
            <td><span class="badge pbgui-badge inline-block rounded-[10px] tracking-[0.3px]" :class="['badge-' + String(item.status || 'unknown').toLowerCase(), badgeToneClass(String(item.status || 'unknown').toLowerCase())]">{{ item.status }}</span></td>
            <td :title="item.filename" style="cursor: pointer" @dblclick="emit('editConfig', item.name ?? '')">
              {{ item.name }}
            </td>
            <td>{{ exchangeText(item) }}</td>
            <td>{{ fmtDate(item.created) }}</td>
            <td class="actions-cell" @mousedown.stop>
              <button
                v-if="item.status === 'error'"
                type="button"
                class="act-btn"
                :title="t('v7backtest.restart')"
                :aria-label="t('v7backtest.restart')"
                style="border-color: var(--warning); color: var(--warning)"
                @click.stop="emit('restart', item.filename)"
              ><PbIcon :icon="PhPlay" :size="18" /></button>
              <button
                v-if="item.status === 'queued'"
                type="button"
                class="act-btn"
                :title="t('v7backtest.start')"
                :aria-label="t('v7backtest.start')"
                @click.stop="emit('start', item.filename)"
              ><PbIcon :icon="PhPlay" :size="18" /></button>
              <button
                v-if="item.status === 'running' || item.status === 'backtesting'"
                type="button"
                class="act-btn act-btn-danger"
                :title="t('v7backtest.stop')"
                :aria-label="t('v7backtest.stop')"
                @click.stop="emit('stop', item.filename)"
              ><PbIcon :icon="PhStop" :size="18" /></button>
              <button
                v-if="item.status === 'complete'"
                type="button"
                class="act-btn"
                :title="t('v7backtest.viewResults')"
                :aria-label="t('v7backtest.viewResults')"
                style="border-color: var(--green); color: var(--green)"
                @click.stop="emit('viewResults', item.name ?? '')"
              ><PbIcon :icon="PhChartBar" :size="18" /></button>
              <button type="button" class="act-btn" :title="t('v7backtest.logAction')" :aria-label="t('v7backtest.logAction')" @click.stop="emit('showLog', item.filename)">
                <PbIcon :icon="PhFileText" :size="18" />
              </button>
              <button
                type="button"
                class="act-btn act-btn-danger"
                :title="t('v7backtest.remove')"
                :aria-label="t('v7backtest.remove')"
                @click.stop="emit('remove', item.filename)"
              ><PbIcon :icon="PhTrash" :size="18" /></button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- deleteSelectedQueue confirm (:5860-5870) -->
    <div v-if="confirmOpen" id="modal-root" class="open" :class="modalBackdropClass">
      <div :class="[modalBoxClass, 'shadow-modal']">
        <div class="mb-3 flex items-center justify-between border-b border-border-default pb-2">
          <span class="text-lg font-semibold">{{ t('v7backtest.deleteQueueItems') }}</span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto"><p>{{ t('v7backtest.removeQueueConfirm', { n: selectedFilenames().length }) }}</p></div>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="pbgui-action" :class="modalBtnClass()" @click="confirmOpen = false">{{ t('common.cancel') }}</button>
          <button type="button" class="pbgui-action danger" :class="modalBtnClass()" @click="confirmDelete">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
