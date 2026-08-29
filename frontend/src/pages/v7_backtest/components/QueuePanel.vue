<script setup lang="ts">
/**
 * Queue panel — renderQueue (:5136-5177), the local queue sort
 * (:5126-5135), click-to-toggle + drag multi-select (:5787-5844) and
 * selectAll/deselectAll (:5846-5851) + deleteSelectedQueue with its
 * confirm modal (:5857-5871). The legacy auto-scroll helper
 * (tickRowSelectAutoScroll :5642) lands with M-v7-10's shared row-
 * selection surface.
 */
import {
  PhChartBar,
  PhCheckCircle,
  PhClock,
  PhFileText,
  PhHourglass,
  PhListChecks,
  PhPlay,
  PhStop,
  PhTrash,
  PhWarningCircle,
} from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import BacktestRowActionButton from './BacktestRowActionButton.vue';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
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
const selectedCount = computed(() => selected.value.size);
const queuedCount = computed(() => props.items.filter((item) => item.status === 'queued').length);
const activeCount = computed(() => props.items.filter((item) => item.status === 'running' || item.status === 'backtesting').length);
const completeCount = computed(() => props.items.filter((item) => item.status === 'complete').length);
const attentionCount = computed(() => props.items.filter((item) => item.status === 'error' || item.status === 'stopped').length);

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

function onRowKeydown(event: KeyboardEvent, item: QueueItem): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  const next = new Set(selected.value);
  if (next.has(item.filename)) next.delete(item.filename);
  else next.add(item.filename);
  selected.value = next;
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
    <header class="queue-workbench-head mb-3 flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-panel px-4 py-3.5 shadow-panel max-[760px]:flex-col">
      <div class="flex min-w-0 items-start gap-3">
        <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhListChecks" :size="18" /></span>
        <div class="min-w-0">
          <h2 class="m-0 text-xl font-semibold tracking-tight text-primary">{{ t('v7backtest.queueWorkbenchTitle') }}</h2>
          <p class="mt-1 max-w-[70ch] text-sm leading-relaxed text-secondary">{{ t('v7backtest.queueWorkbenchHint') }}</p>
        </div>
      </div>
      <span class="inline-flex shrink-0 items-center rounded-full border border-border-default bg-card px-2.5 py-1 text-xs font-semibold tabular-nums text-secondary">{{ t('v7backtest.queueItemsCount', { count: items.length }) }}</span>
    </header>

    <div class="queue-summary mb-3 grid grid-cols-[repeat(4,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-2 max-[480px]:grid-cols-1">
      <article class="queue-stat rounded-lg border border-border-subtle bg-panel px-3.5 py-3 shadow-panel"><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-muted"><PbIcon class="text-secondary" :icon="PhClock" :size="15" />{{ t('v7backtest.queueQueued') }}</div><div class="mt-2 text-2xl font-semibold tabular-nums text-primary" data-queue-stat="queued">{{ queuedCount }}</div></article>
      <article class="queue-stat rounded-lg border border-border-subtle bg-panel px-3.5 py-3 shadow-panel"><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-muted"><PbIcon class="text-accent-soft" :icon="PhHourglass" :size="15" />{{ t('v7backtest.queueActive') }}</div><div class="mt-2 text-2xl font-semibold tabular-nums text-primary" data-queue-stat="active">{{ activeCount }}</div></article>
      <article class="queue-stat rounded-lg border border-border-subtle bg-panel px-3.5 py-3 shadow-panel"><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-muted"><PbIcon class="text-success-soft" :icon="PhCheckCircle" :size="15" />{{ t('v7backtest.queueComplete') }}</div><div class="mt-2 text-2xl font-semibold tabular-nums text-primary" data-queue-stat="complete">{{ completeCount }}</div></article>
      <article class="queue-stat rounded-lg border border-border-subtle bg-panel px-3.5 py-3 shadow-panel"><div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-label text-muted"><PbIcon class="text-danger-soft" :icon="PhWarningCircle" :size="15" />{{ t('v7backtest.queueAttention') }}</div><div class="mt-2 text-2xl font-semibold tabular-nums text-primary" data-queue-stat="attention">{{ attentionCount }}</div></article>
    </div>

    <div class="queue-table-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel">
      <div id="queue-toolbar" class="flex items-center justify-between gap-3 border-b border-border-subtle bg-card px-3 py-2.5 max-[760px]:flex-wrap">
        <span class="inline-flex items-center gap-2 text-sm text-secondary"><span class="rounded-full border border-accent/25 bg-accent/8 px-2 py-0.5 text-xs font-semibold tabular-nums text-accent-soft" data-test="queue-selected-count">{{ selectedCount }}</span>{{ t('v7backtest.queueSelected') }}</span>
        <div class="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" data-test="queue-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAll">{{ t('v7backtest.selectAll') }}</Button>
          <Button type="button" variant="ghost" size="sm" data-test="queue-deselect-all" :title="t('v7backtest.deselectAll')" @click="deselectAll">{{ t('v7backtest.deselect') }}</Button>
        </div>
      </div>
      <div id="queue-list" class="queue-list min-h-0 flex-1 overflow-auto" @mousemove="onListMouseMove">
      <div v-if="!items.length" class="empty-state queue-empty-state flex min-h-[260px] flex-col items-center justify-center gap-3 px-5 py-12 text-center text-md text-secondary">
        <span class="grid h-12 w-12 place-items-center rounded-lg border border-border-default bg-card text-muted" aria-hidden="true"><PbIcon :icon="PhHourglass" :size="22" /></span>
        <template v-for="(line, index) in emptyLines" :key="index">
          <br v-if="index > 0" />
          <span>{{ line }}</span>
        </template>
      </div>
      <table v-else class="queue-table w-full min-w-[820px] border-collapse text-sm">
        <thead>
          <tr>
            <th v-for="column in COLUMNS" :key="column.key" class="sticky top-0 z-[2] cursor-pointer border-b border-border-default bg-card px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-label text-secondary hover:text-primary" @click="setSort(column.key)">
              {{ t(column.labelKey) }}<span class="sort-arrow">{{ sortCol === column.key ? (sortAsc ? ' ▲' : ' ▼') : '' }}</span>
            </th>
            <th class="sticky top-0 z-[2] border-b border-border-default bg-card px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-label text-secondary">{{ t('v7backtest.actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in sorted"
            :key="item.filename"
            :data-filename="item.filename"
            class="queue-row cursor-pointer outline-none"
            :class="{ selected: isItemSelected(item) }"
            tabindex="0"
            @mousedown="onMouseDown($event, item)"
            @mouseenter="onMouseEnter(item)"
            @mouseup="onMouseUp(item)"
            @keydown="onRowKeydown($event, item)"
          >
            <td class="border-b border-border-subtle px-3 py-3 align-middle"><span class="badge pbgui-badge inline-flex rounded-full border border-current/20 px-2 py-0.5 text-xs font-semibold tracking-[0.3px]" :class="['badge-' + String(item.status || 'unknown').toLowerCase(), badgeToneClass(String(item.status || 'unknown').toLowerCase())]">{{ item.status }}</span></td>
            <td class="border-b border-border-subtle px-3 py-3 align-middle font-medium text-primary" :title="item.filename" @dblclick="emit('editConfig', item.name ?? '')">
              {{ item.name }}
            </td>
            <td class="border-b border-border-subtle px-3 py-3 align-middle text-secondary">{{ exchangeText(item) }}</td>
            <td class="border-b border-border-subtle px-3 py-3 align-middle font-mono text-xs text-secondary">{{ fmtDate(item.created) }}</td>
            <td class="actions-cell border-b border-border-subtle px-3 py-2 align-middle" @mousedown.stop>
              <div class="backtest-row-actions justify-end">
              <BacktestRowActionButton
                v-if="item.status === 'error'"
                :icon="PhPlay"
                :label="t('v7backtest.restart')"
                tone="warning"
                @click.stop="emit('restart', item.filename)"
              />
              <BacktestRowActionButton
                v-if="item.status === 'queued'"
                :icon="PhPlay"
                :label="t('v7backtest.start')"
                tone="success"
                @click.stop="emit('start', item.filename)"
              />
              <BacktestRowActionButton
                v-if="item.status === 'running' || item.status === 'backtesting'"
                :icon="PhStop"
                :label="t('v7backtest.stop')"
                tone="danger"
                @click.stop="emit('stop', item.filename)"
              />
              <BacktestRowActionButton
                v-if="item.status === 'complete'"
                :icon="PhChartBar"
                :label="t('v7backtest.viewResults')"
                tone="success"
                @click.stop="emit('viewResults', item.name ?? '')"
              />
              <BacktestRowActionButton :icon="PhFileText" :label="t('v7backtest.logAction')" @click.stop="emit('showLog', item.filename)" />
              <BacktestRowActionButton
                :icon="PhTrash"
                :label="t('v7backtest.remove')"
                tone="danger"
                @click.stop="emit('remove', item.filename)"
              />
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <!-- deleteSelectedQueue confirm (:5860-5870) -->
    <div v-if="confirmOpen" id="modal-root" class="open" :class="modalBackdropClass">
      <div :class="[modalBoxClass, 'shadow-modal']">
        <div class="mb-3 flex items-center justify-between border-b border-border-default pb-2">
          <span class="text-lg font-semibold">{{ t('v7backtest.deleteQueueItems') }}</span>
        </div>
        <div class="min-h-0 flex-1 overflow-auto"><p>{{ t('v7backtest.removeQueueConfirm', { n: selectedFilenames().length }) }}</p></div>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn pbgui-action" @click="confirmOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="danger" class="modal-btn pbgui-action danger" @click="confirmDelete">{{ t('common.delete') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.queue-list {
  background: var(--surface-panel);
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.queue-list::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.queue-list::-webkit-scrollbar-thumb {
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.queue-row td {
  transition: background-color var(--motion-fast) var(--ease-standard);
}

.queue-row:hover td,
.queue-row:focus-visible td {
  background: rgb(var(--accent-rgb) / 0.055);
}

.queue-row.selected td {
  background: var(--accent-bg);
}

.queue-row.selected td:first-child,
.queue-row:focus-visible td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.queue-row:last-child td {
  border-bottom: 0;
}
</style>
