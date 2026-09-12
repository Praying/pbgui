<script setup lang="ts">
import { PhChartBar, PhClipboardText, PhCopy, PhPencilSimple, PhPlay, PhPlus } from '@phosphor-icons/vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import BacktestRowActionButton from './BacktestRowActionButton.vue';
import { modalBackdropClass, modalBoxClass } from '../lib/uiClasses';
import type { ConfigSummary, SortSpec } from '../types';

/**
 * ConfigsPanel — the configs list of renderConfigs (:1654-1712): name /
 * exchange / strategy filters, sortable headers (thSort/setSort :1714-1737),
 * a checkbox column with select-all, per-row edit / queue / results /
 * duplicate actions, and the delete confirm flow (:5109-5123).
 */

const props = withDefaults(
  defineProps<{
    configs: readonly ConfigSummary[];
    sort?: SortSpec;
    isV8?: boolean;
  }>(),
  { sort: () => ({ col: 'modified', asc: false }), isV8: false }
);

const emit = defineEmits<{
  sort: [column: string];
  edit: [name: string];
  queue: [name: string];
  'view-results': [name: string];
  duplicate: [name: string];
  'delete-selected': [names: string[]];
  'new-config': [];
  filter: [value: string];
  'nothing-selected': [];
}>();

const { t, tm } = useI18n();

function stripLegacyMarkup(value: string): string {
  return value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const emptyCopy = computed(() => {
  const [title = '', message = ''] = String(tm('v7backtest.emptyConfigsHtml')).split(/<br\s*\/?\s*>/i);
  return {
    title: stripLegacyMarkup(title),
    message: stripLegacyMarkup(message),
  };
});

const newConfigLabel = computed(() => t('v7backtest.newConfig'));

const filter = ref('');
const exchangeFilter = ref('');
const strategyFilter = ref('');
const selected = ref<string[]>([]);

const exchangeOptions = computed(() => {
  const set = new Set<string>();
  for (const entry of props.configs) {
    const ex = entry.exchanges;
    if (Array.isArray(ex)) ex.forEach((value) => set.add(String(value)));
    else if (ex) set.add(String(ex));
  }
  return [...set].sort((a, b) => a.localeCompare(b));
});

const strategyOptions = computed(() => {
  const set = new Set<string>();
  for (const entry of props.configs) if (entry.strategy) set.add(entry.strategy);
  return [...set].sort((a, b) => a.localeCompare(b));
});

const visible = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  let list = props.configs.slice().sort((a, b) => compare(a, b));
  if (needle) list = list.filter((entry) => (entry.name || '').toLowerCase().includes(needle));
  if (exchangeFilter.value) {
    list = list.filter((entry) => {
      const ex = entry.exchanges;
      const values = Array.isArray(ex) ? ex.map(String) : ex ? [String(ex)] : [];
      return values.includes(exchangeFilter.value);
    });
  }
  if (strategyFilter.value) list = list.filter((entry) => (entry.strategy || '') === strategyFilter.value);
  return list;
});

const allSelected = computed(() => visible.value.length > 0 && visible.value.every((entry) => selected.value.includes(entry.name)));

/* Numeric columns must sort by value, not lexically (:1714-1737). */
const NUMERIC_COLS = new Set(['results', 'coins', 'twe_long', 'twe_short']);
function compare(a: ConfigSummary, b: ConfigSummary): number {
  const col = props.sort.col;
  const va = (a as unknown as Record<string, unknown>)[col];
  const vb = (b as unknown as Record<string, unknown>)[col];
  const cmp = NUMERIC_COLS.has(col)
    ? Number(va ?? 0) - Number(vb ?? 0)
    : String(va ?? '').toLowerCase().localeCompare(String(vb ?? '').toLowerCase());
  return props.sort.asc ? cmp : -cmp;
}

function toggleRow(name: string): void {
  selected.value = selected.value.includes(name) ? selected.value.filter((entry) => entry !== name) : [...selected.value, name];
}

let dragStart: { index: number; y: number } | null = null;
let dragging = false;
let dragMode: 'add' | 'remove' | null = null;

function onMouseDown(event: MouseEvent, name: string): void {
  if (event.button !== 0) return;
  const idx = visible.value.findIndex((entry) => entry.name === name);
  dragStart = { index: idx, y: event.clientY };
  dragging = false;
  dragMode = null;
}

function onListMouseMove(event: MouseEvent): void {
  if (!dragStart) return;
  if (!dragging && Math.abs(event.clientY - dragStart.y) > 5) {
    dragging = true;
    const initialName = visible.value[dragStart.index]?.name;
    dragMode = initialName && selected.value.includes(initialName) ? 'remove' : 'add';
  }
}

function onMouseEnter(name: string): void {
  if (!dragging || !dragStart) return;
  const anchor = dragStart.index;
  const current = visible.value.findIndex((entry) => entry.name === name);
  if (anchor === -1 || current === -1) return;
  const lo = Math.min(anchor, current);
  const hi = Math.max(anchor, current);
  const next = new Set(selected.value);
  visible.value.slice(lo, hi + 1).forEach((entry) => {
    if (dragMode === 'add') next.add(entry.name);
    else next.delete(entry.name);
  });
  selected.value = Array.from(next);
}

function onMouseUp(): void {
  dragStart = null;
  setTimeout(() => {
    dragging = false;
  }, 0);
  dragMode = null;
}

function onRowClick(name: string): void {
  if (dragging) return;
  toggleRow(name);
}

function onRowKeydown(event: KeyboardEvent, name: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleRow(name);
}

function toggleAll(): void {
  selected.value = allSelected.value ? [] : visible.value.map((entry) => entry.name);
}

function selectAll(): void {
  selected.value = visible.value.map((entry) => entry.name);
}

function deselectAll(): void {
  selected.value = [];
}

function deleteSelected(): void {
  emit('delete-selected', selected.value.slice());
}

/* deleteSelectedConfigs (:5109-5123) — confirm + also-delete-results. */
const deleteConfirmOpen = ref(false);
const deleteAlsoResults = ref(false);

function openDeleteConfirm(): void {
  if (selected.value.length === 0) {
    emit('nothing-selected');
    return;
  }
  deleteConfirmOpen.value = true;
}

async function deleteSelectedFlow(run: (names: readonly string[], removeResults: boolean) => void | Promise<void>): Promise<void> {
  const names = selected.value.slice();
  deleteConfirmOpen.value = false;
  await run(names, deleteAlsoResults.value);
  selected.value = [];
}

function exchangeText(entry: ConfigSummary): string {
  return Array.isArray(entry.exchanges) ? entry.exchanges.join(', ') : String(entry.exchanges ?? '');
}

function num(value: number | null | undefined, decimals: number): string {
  return value === null || value === undefined ? '-' : Number(value).toFixed(decimals);
}

/** Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function formatDateTime(value: string | undefined): string {
  if (!value) return '-';
  const withTime = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (withTime) return `${withTime[1]}-${withTime[2]}-${withTime[3]} ${withTime[4]}:${withTime[5]}`;
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[1]}-${dateOnly[2]}-${dateOnly[3]}`;
  return String(value);
}

/** Coin symbols (from the backend coin_list), falling back to the count. */
function coinsText(entry: ConfigSummary): string {
  const list = entry.coin_list;
  if (Array.isArray(list) && list.length) {
    const shown = list.slice(0, 3).join(', ');
    return list.length > 3 ? `${shown} +${list.length - 3}` : shown;
  }
  return entry.coins != null ? String(entry.coins) : '-';
}

function coinsTitle(entry: ConfigSummary): string {
  const list = entry.coin_list;
  return Array.isArray(list) && list.length ? list.join(', ') : coinsText(entry);
}

/** The ctx-sidebar Delete target (App passes store.deleteConfigs). */
let runDelete: (names: readonly string[], removeResults: boolean) => void | Promise<void> = () => undefined;
function bindRun(run: (names: readonly string[], removeResults: boolean) => void | Promise<void>): void {
  runDelete = run;
  openDeleteConfirm();
}

defineExpose({
  deleteSelectedFlow: bindRun,
  selectedCount: computed(() => selected.value.length),
});
</script>

<template>
  <div class="pbgui-config-list flex min-h-0 flex-1 flex-col overflow-hidden">
    <section
      v-if="configs.length === 0"
      class="empty-state configs-empty-state mx-auto mt-[clamp(20px,7vh,72px)] grid w-[min(720px,calc(100%_-_32px))] grid-cols-[112px_minmax(0,1fr)] overflow-hidden rounded-2xl border border-accent/18 bg-[radial-gradient(circle_at_0%_0%,rgb(var(--accent-rgb)/0.11),transparent_18rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] shadow-panel max-[640px]:grid-cols-1"
      data-test="configs-empty"
      aria-live="polite"
    >
      <div class="relative grid min-h-[210px] place-items-center border-r border-accent/14 bg-accent-deep/8 max-[640px]:min-h-[104px] max-[640px]:border-b max-[640px]:border-r-0">
        <div class="grid h-16 w-16 place-items-center rounded-2xl border border-accent/24 bg-page/70 text-accent-soft shadow-[0_14px_32px_rgb(0_0_0/0.3),inset_0_1px_0_rgb(255_255_255/0.1)]">
          <PbIcon :icon="PhClipboardText" :size="30" />
        </div>
        <span class="absolute bottom-4 font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-secondary/65 max-[640px]:bottom-2">{{ isV8 ? 'PBv8' : 'PBv7' }} / 00</span>
      </div>
      <div class="flex min-w-0 flex-col items-start justify-center px-[clamp(24px,5vw,52px)] py-[clamp(28px,5vw,46px)] text-left">
        <span class="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-accent-soft">{{ isV8 ? 'PBv8' : 'PBv7' }} · {{ t('v7backtest.configs') }}</span>
        <h2 class="text-[clamp(20px,2.4vw,27px)] font-semibold leading-tight tracking-[-0.035em] text-primary" data-test="configs-empty-title">{{ emptyCopy.title }}</h2>
        <p class="mt-3 max-w-[48ch] text-sm leading-relaxed text-secondary" data-test="configs-empty-message">{{ emptyCopy.message }}</p>
        <Button type="button" variant="primary" class="group mt-6 rounded-full px-5" data-test="configs-empty-new" @click="emit('new-config')">
          <PbIcon :icon="PhPlus" :size="17" />
          {{ newConfigLabel }}
        </Button>
      </div>
    </section>

    <div v-else class="pbgui-config-frame flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel">
      <div id="configs-toolbar" class="pbgui-config-toolbar pbgui-list-toolbar flex flex-wrap items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <Input
          v-model="filter"
          type="text"
          class="pbgui-config-search h-8 w-auto min-w-[160px] max-w-[240px]"
          :placeholder="t('v7backtest.searchName')"
          data-test="configs-filter"
          @input="emit('filter', filter)"
        />
        <!-- ui-migration: the legacy <option value=""> placeholder rows have no
             reka equivalent — the listboxes offer no reset row; the cleared
             model ('') renders as the trigger label instead. -->
        <SelectRoot v-model="exchangeFilter">
          <SelectTrigger class="h-8 w-auto min-w-[120px] max-w-[180px]" data-test="configs-exchange-filter" :title="t('v7backtest.filterExchange')" :aria-label="t('v7backtest.filterExchange')">
            <span :class="exchangeFilter ? '' : 'text-placeholder'">{{ exchangeFilter || t('v7backtest.filterExchange') }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="exchange in exchangeOptions" :key="exchange" :value="exchange">{{ exchange }}</SelectItem>
          </SelectContent>
        </SelectRoot>
        <SelectRoot v-if="isV8" v-model="strategyFilter">
          <SelectTrigger class="h-8 w-auto min-w-[120px] max-w-[180px]" data-test="configs-strategy-filter" :title="t('v7backtest.filterStrategy')" :aria-label="t('v7backtest.filterStrategy')">
            <span :class="strategyFilter ? '' : 'text-placeholder'">{{ strategyFilter || t('v7backtest.filterStrategy') }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="strategy in strategyOptions" :key="strategy" :value="strategy">{{ strategy }}</SelectItem>
          </SelectContent>
        </SelectRoot>
        <span class="flex-1"></span>
        <div class="flex items-center gap-2">
          <Button type="button" variant="secondary" size="sm" class="h-8 px-3" data-test="configs-select-all" :title="t('v7backtest.selectAllVisible')" @click="selectAll">{{ t('v7backtest.selectAll') }}</Button>
          <Button type="button" variant="ghost" size="sm" class="h-8 px-3 text-secondary" data-test="configs-deselect" :title="t('v7backtest.deselectAll')" :disabled="selected.length === 0" @click="deselectAll">{{ t('v7backtest.deselect') }}</Button>
        </div>
      </div>

      <ListWrap class="pbgui-config-wrap min-h-0 flex-1 overflow-auto bg-panel" @mousemove="onListMouseMove">
        <Table class="pbgui-config-table min-w-[900px] select-none bg-transparent">
          <thead>
            <tr>
              <SortTh sort-key="name" data-col="name" :label="t('v7backtest.name')" :sort="sort.col === 'name' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'name')" />
              <SortTh sort-key="exchanges" data-col="exchanges" :label="t('v7backtest.exchange')" :sort="sort.col === 'exchanges' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'exchanges')" />
              <SortTh v-if="isV8" sort-key="strategy" data-col="strategy" :sort="sort.col === 'strategy' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'strategy')"><span data-test="strategy-col-header">{{ t('v7backtest.strategy') }}</span></SortTh>
              <SortTh sort-key="coins" data-col="coins" :label="t('v7backtest.coins')" :sort="sort.col === 'coins' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'coins')" />
              <SortTh sort-key="twe_long" data-col="twe_long" :title="t('v7backtest.tweTooltip')" :sort="sort.col === 'twe_long' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'twe_long')">TWE L/S</SortTh>
              <SortTh sort-key="start_date" data-col="start_date" :label="t('v7backtest.start')" :sort="sort.col === 'start_date' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'start_date')" />
              <SortTh sort-key="end_date" data-col="end_date" :label="t('v7backtest.end')" :sort="sort.col === 'end_date' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'end_date')" />
              <SortTh sort-key="results" data-col="results" :label="t('v7backtest.resultCountHeader')" :sort="sort.col === 'results' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'results')" />
              <SortTh sort-key="modified" data-col="modified" :label="t('v7backtest.modified')" :sort="sort.col === 'modified' ? (sort.asc ? 'asc' : 'desc') : undefined" @sort="emit('sort', 'modified')" />
              <Th align="center" class="cursor-default">{{ t('v7backtest.actions') }}</Th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="visible.length === 0">
              <td :colspan="isV8 ? 10 : 9" class="empty-state px-5! py-15! text-center text-md text-secondary">{{ t('v7backtest.noConfigsMatch') }}</td>
            </tr>
            <tr
              v-for="entry in visible"
              :key="entry.name"
              :data-name="entry.name"
              class="config-row cursor-pointer outline-none"
              :class="{ selected: selected.includes(entry.name) }"
              tabindex="0"
              @mousedown="onMouseDown($event, entry.name)"
              @mouseenter="onMouseEnter(entry.name)"
              @mouseup="onMouseUp"
              @click="onRowClick(entry.name)"
              @keydown="onRowKeydown($event, entry.name)"
              @dblclick="emit('edit', entry.name)"
            >
              <td class="pbgui-config-name max-w-[240px] truncate" :title="entry.name">{{ entry.name }}</td>
              <td class="truncate" :title="exchangeText(entry)"><span class="pbgui-config-exchange font-mono text-xs">{{ exchangeText(entry) || '-' }}</span></td>
              <td v-if="isV8" class="truncate font-mono text-xs text-secondary">{{ entry.strategy || '-' }}</td>
              <td class="max-w-[160px] truncate font-mono text-xs tabular-nums text-secondary" :title="coinsTitle(entry)">{{ coinsText(entry) }}</td>
              <td class="truncate font-mono text-xs tabular-nums">{{ num(entry.twe_long, 2) }} / {{ num(entry.twe_short, 2) }}</td>
              <td class="pbgui-config-date truncate font-mono text-xs tabular-nums">{{ formatDateTime(entry.start_date) }}</td>
              <td class="pbgui-config-date truncate font-mono text-xs tabular-nums">{{ formatDateTime(entry.end_date) }}</td>
              <td
                class="pbgui-config-count font-mono text-xs tabular-nums"
                :class="entry.results ? 'cursor-pointer font-semibold text-accent-soft hover:underline' : 'cursor-default font-normal text-muted'"
                @click.stop="entry.results ? emit('view-results', entry.name) : undefined"
              >
                {{ entry.results ?? 0 }}
              </td>
              <td class="pbgui-config-date truncate font-mono text-xs tabular-nums" :title="String(entry.modified || '')">{{ formatDateTime(entry.modified) }}</td>
              <TdActions>
                <BacktestRowActionButton class="pbgui-config-action" :icon="PhPencilSimple" :label="t('v7backtest.edit')" data-test="cfg-edit" @click="emit('edit', entry.name)" />
                <BacktestRowActionButton class="pbgui-config-action" :icon="PhPlay" :label="t('v7backtest.addToQueueTitle')" tone="accent" data-test="cfg-queue" @click="emit('queue', entry.name)" />
                <BacktestRowActionButton class="pbgui-config-action" :icon="PhChartBar" :label="t('v7backtest.viewResults')" tone="success" :disabled="!entry.results" data-test="cfg-results" @click="emit('view-results', entry.name)" />
                <BacktestRowActionButton class="pbgui-config-action" :icon="PhCopy" :label="t('v7backtest.duplicateConfig')" data-test="cfg-duplicate" @click="emit('duplicate', entry.name)" />
              </TdActions>
            </tr>
          </tbody>
        </Table>
      </ListWrap>
      <ListFooter data-test="configs-list-footer">
        <span class="tabular-nums">{{ t('v7backtest.totalConfigs', { n: visible.length }) }}</span>
        <span v-if="selected.length" class="font-medium text-accent-soft tabular-nums">{{ selected.length }} {{ t('v7backtest.queueSelected') }}</span>
      </ListFooter>
    </div>

    <div v-if="deleteConfirmOpen" id="modal-root" :class="modalBackdropClass" data-test="configs-delete-modal">
      <div :class="modalBoxClass">
        <h3>{{ t('v7backtest.deleteConfigs') }}</h3>
        <p>{{ t('v7backtest.deleteConfigsConfirm', { n: selected.length }) }}</p>
        <label class="sb-toggle"><Checkbox v-model="deleteAlsoResults" /><span>{{ t('v7backtest.alsoDeleteResults') }}</span></label>
        <div class="mt-5 flex justify-end gap-2">
          <Button type="button" variant="default" class="modal-btn" @click="deleteConfirmOpen = false">{{ t('common.cancel') }}</Button>
          <Button type="button" variant="danger" class="modal-btn" data-test="configs-delete-confirm" @click="deleteSelectedFlow(runDelete)">{{ t('common.delete') }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
