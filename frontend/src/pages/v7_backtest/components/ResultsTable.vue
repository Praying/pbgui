<script setup lang="ts">
/**
 * ResultsTable — _renderResultsTableInto (:5514-5577) as a Vue table:
 * sortable headers (rth/setResSort :5452-5463) over the results
 * whitelist, liquidation tinting + the ⚠ prefix (:5545-5552), the five
 * per-result icon toggles with their active state, the optional V8
 * convert button (:5547-5549) and click/drag row selection with wrap
 * auto-scroll (:5731-5785).
 */
import { PhChartLineUp, PhCopy, PhEye, PhFileText, PhFlask, PhImage, PhCaretDown, PhCaretRight, PhWarning } from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import EmptyState from '@/shared/components/EmptyState.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import BacktestRowActionButton from './BacktestRowActionButton.vue';
import { useRowDragSelect } from '../composables/useRowDragSelect';
import { collectResultGroups, resultGroupKey, type ResultGroupBlock } from '../lib/resultsModel';
import type { BacktestResultItem, ResultActionKind, SortSpec } from '../types';

const props = withDefaults(
  defineProps<{
    rows: readonly BacktestResultItem[];
    selected: ReadonlySet<string>;
    sort: SortSpec;
    activeActions: Readonly<Record<string, ReadonlySet<ResultActionKind>>>;
    showVersion?: boolean;
    showStrategy?: boolean;
    allowV8Convert?: boolean;
    /** Group Optimize-validation results into collapsible rows (v2.02.4). */
    groupValidation?: boolean;
    /** The scrolling wrap this table auto-scrolls (:5773, :5918, :5977). */
    wrapId?: string;
  }>(),
  { showVersion: true, showStrategy: true, allowV8Convert: false, groupValidation: false, wrapId: '#results-list-wrap' }
);

const emit = defineEmits<{
  sort: [column: string];
  'toggle-select': [path: string];
  'select-paths': [paths: string[], selected: boolean];
  'toggle-action': [path: string, kind: ResultActionKind];
  convert: [path: string];
  'compare-group': [paths: string[]];
}>();

const { t } = useI18n();

const showStrategy = computed(() => props.showStrategy && props.rows.some((row) => String(row.backtest_version ?? '').toLowerCase() === 'v8'));

/* ── Optimize-validation grouping (v2.02.4) ── */

/** Legacy _expandedResultGroups: keys of groups currently expanded. */
const expandedGroups = ref(new Set<string>());

/** renderEntries drives the tbody: group headers plus plain/member rows. */
type RenderEntry =
  | { type: 'group'; block: ResultGroupBlock; expanded: boolean }
  | { type: 'row'; row: BacktestResultItem; grouped: boolean; hidden: boolean };

const renderEntries = computed<RenderEntry[]>(() => {
  if (!props.groupValidation) {
    return props.rows.map((row) => ({ type: 'row' as const, row, grouped: false, hidden: false }));
  }
  const blocks = collectResultGroups(props.rows);
  const entries: RenderEntry[] = [];
  const rendered = new Set<string>();
  for (const row of props.rows) {
    const key = resultGroupKey(row);
    const block = key ? blocks.get(key) : undefined;
    if (!block) {
      entries.push({ type: 'row', row, grouped: false, hidden: false });
      continue;
    }
    if (rendered.has(key)) continue;
    rendered.add(key);
    const expanded = expandedGroups.value.has(key);
    entries.push({ type: 'group', block, expanded });
    for (const member of props.rows) {
      if (resultGroupKey(member) === key) {
        entries.push({ type: 'row', row: member, grouped: true, hidden: !expanded });
      }
    }
  }
  return entries;
});

/** Legacy toggleResultGroup: flip one group's expansion. */
function toggleGroup(key: string): void {
  const next = new Set(expandedGroups.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expandedGroups.value = next;
}

/** Legacy compareResultGroup: select the whole group and compare it. */
function compareGroup(paths: string[]): void {
  emit('select-paths', paths, true);
  emit('compare-group', paths);
}

function onResultRowKeydown(event: KeyboardEvent, resultPath: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  emit('toggle-select', resultPath);
}
const showCoins = computed(() =>
  props.rows.some((row) => Boolean(row.coins_text) || (Array.isArray(row.coins) && row.coins.length > 0))
);

interface HeaderColumn {
  col: string;
  label: string;
}

/** The sortable columns (:5534-5537) — TWE/POS stay static like legacy. */
const headers = computed<HeaderColumn[]>(() => {
  const columns: HeaderColumn[] = [];
  if (props.showVersion) columns.push({ col: 'backtest_version', label: t('v7backtest.version') });
  columns.push({ col: 'config_name', label: t('v7backtest.backtestName') });
  if (showStrategy.value) columns.push({ col: 'strategy', label: t('v7backtest.strategy') });
  if (showCoins.value) columns.push({ col: 'coins_text', label: t('v7backtest.coins') });
  columns.push({ col: 'exchange_dir', label: t('v7backtest.exch') });
  columns.push({ col: 'modified', label: t('v7backtest.resultTime') });
  columns.push({ col: 'adg', label: 'ADG' });
  columns.push({ col: 'gain', label: t('v7backtest.gain') });
  columns.push({ col: 'drawdown_worst', label: t('v7backtest.worstDD') });
  columns.push({ col: 'sharpe_ratio', label: 'Sharpe' });
  columns.push({ col: 'starting_balance', label: t('v7backtest.startB') });
  columns.push({ col: 'final_balance', label: t('v7backtest.finalB') });
  return columns;
});



function headerTitle(label: string): string {
  return t('v7backtest.sortBy', { label });
}

/** fmt (:6490-6493). */
function fmt(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return Number(value).toFixed(decimals);
}

/** fmtDate (:6497-6502). */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '-';
  try {
    const date = new Date(iso);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return iso;
  }
}

function coinsText(row: BacktestResultItem): string {
  return row.coins_text || (Array.isArray(row.coins) ? row.coins.join(', ') : '');
}

function exchangesText(row: BacktestResultItem): string {
  return Array.isArray(row.exchanges) ? row.exchanges.join(', ') : '';
}

const ACTION_BUTTONS: Array<{ kind: ResultActionKind; icon: Component; titleKey: string }> = [
  { kind: 'view', icon: PhEye, titleKey: 'v7backtest.viewChartsTitle' },
  { kind: 'analysis', icon: PhFlask, titleKey: 'v7backtest.analysisJson' },
  { kind: 'config', icon: PhFileText, titleKey: 'v7backtest.configJson' },
  { kind: 'plot', icon: PhImage, titleKey: 'v7backtest.plotImages' },
  { kind: 'fills', icon: PhCopy, titleKey: 'v7backtest.fillsPlots' },
];

/* ── drag selection (:5731-5785) ── */

const wrap = ref<HTMLElement | null>(null);
const tbody = ref<HTMLElement | null>(null);

const dragSelect = useRowDragSelect({
  getRows: () => (tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : []),
  // the real scroll container is the panel's list wrap (:853/:902/:932) —
  // legacy auto-scrolled THAT wrap's scrollTop (:5773); ResultsTable's own
  // root div does not scroll. wrapId scopes archive/legacy mounts.
  getWrap: () => (wrap.value ? (wrap.value.closest(props.wrapId) as HTMLElement | null) : null),
  isSelected: (path) => props.selected.has(path),
  onToggle: (path) => emit('toggle-select', path),
  onSelectRange: (paths, selected) => emit('select-paths', paths, selected),
});

onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <EmptyState
    v-if="rows.length === 0"
    class="min-h-[220px]"
    size="inline"
    :icon="PhChartLineUp"
    :title="t('v7backtest.noResultsFound')"
  />
  <div v-else ref="wrap" class="relative">
    <Table class="min-w-max select-none">
      <thead>
        <tr>
          <SortTh
            v-for="header in headers"
            :key="header.col"
            :sort-key="header.col"
            :data-col="header.col"
            :label="header.label"
            :title="headerTitle(header.label)"
            :sort="sort.col === header.col ? (sort.asc ? 'asc' : 'desc') : undefined"
            @sort="emit('sort', header.col)"
          />
          <Th :title="t('v7backtest.tweTooltip')" class="cursor-default">TWE</Th>
          <Th class="cursor-default">POS</Th>
          <Th class="cursor-default">{{ t('v7backtest.actions') }}</Th>
        </tr>
      </thead>
      <tbody ref="tbody">
        <template v-for="entry in renderEntries" :key="entry.type === 'group' ? entry.block.key : entry.row.path">
          <tr v-if="entry.type === 'group'" class="result-group-row">
            <td :colspan="headers.length + 3" class="p-0">
              <div class="result-group-header flex items-center gap-2 px-3 py-1.5">
                <button
                  type="button"
                  class="result-group-compare grid size-6 place-items-center rounded-md border border-secondary/16 text-secondary transition-colors hover:border-accent/30 hover:text-accent-soft"
                  :title="t('v7backtest.compareValidationGroup')"
                  :aria-label="t('v7backtest.compareValidationGroup')"
                  @click.stop="compareGroup(entry.block.paths)"
                ><PbIcon :icon="PhChartLineUp" :size="13" /></button>
                <button
                  type="button"
                  class="result-group-toggle flex min-w-0 items-center gap-2 text-left"
                  :aria-expanded="entry.expanded ? 'true' : 'false'"
                  @click.stop="toggleGroup(entry.block.key)"
                >
                  <PbIcon :icon="entry.expanded ? PhCaretDown : PhCaretRight" :size="12" class="shrink-0 text-accent-soft" />
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">{{ t('v7backtest.optimizeValidation') }}</span>
                  <strong class="truncate font-medium text-primary" :title="entry.block.label">{{ entry.block.label }}</strong>
                  <span class="shrink-0 text-xs text-secondary">{{ t('v7backtest.groupResultsCount', { n: entry.block.paths.length }) }}</span>
                </button>
              </div>
            </td>
          </tr>
          <tr
            v-else
            :data-path="entry.row.path"
            :data-liquidated="entry.row.liquidated ? 'true' : undefined"
            :class="{ selected: selected.has(entry.row.path), 'result-group-member': entry.grouped }"
            :hidden="entry.hidden || undefined"
            :aria-selected="selected.has(entry.row.path) ? 'true' : 'false'"
            tabindex="0"
            :style="entry.row.liquidated ? { background: 'rgb(var(--danger-rgb) / .10)' } : undefined"
            @click="emit('toggle-select', entry.row.path)"
            @keydown="onResultRowKeydown($event, entry.row.path)"
          >
          <td v-if="showVersion" class="truncate font-semibold text-secondary">PB{{ (entry.row.backtest_version || '').toUpperCase() }}</td>
          <td :title="entry.row.display_name || `${entry.row.config_name}/${entry.row.exchange_dir || ''}/${entry.row.result_name}`" data-col="config_name" class="max-w-[280px] truncate font-medium text-primary">
            <span v-if="entry.row.liquidated" class="mr-1 inline-flex items-baseline align-[-1px] text-danger" :title="t('v7backtest.liquidated')"><PbIcon :icon="PhWarning" :size="12" /></span>
            {{ entry.row.display_name || `${entry.row.config_name}/${entry.row.exchange_dir || ''}/${entry.row.result_name}` }}
          </td>
          <td v-if="showStrategy" class="truncate font-mono">{{ entry.row.strategy || '-' }}</td>
          <td v-if="showCoins" :title="coinsText(entry.row)" data-col="coins_text" class="max-w-[140px] truncate">{{ coinsText(entry.row) }}</td>
          <td class="truncate" :title="exchangesText(entry.row)">{{ exchangesText(entry.row) }}</td>
          <td class="truncate text-xs tabular-nums text-secondary" :title="entry.row.modified || ''">{{ fmtDate(entry.row.modified) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.adg, 4) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.gain, 2) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.drawdown_worst, 4) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.sharpe_ratio, 4) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.starting_balance, 0) }}</td>
          <td class="truncate font-mono tabular-nums">{{ entry.row.final_balance_estimated ? '~ ' : '' }}{{ fmt(entry.row.final_balance, 0) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.twe_long, 2) }} / {{ fmt(entry.row.twe_short, 2) }}</td>
          <td class="truncate font-mono tabular-nums">{{ fmt(entry.row.pos_long, 0) }} / {{ fmt(entry.row.pos_short, 0) }}</td>
          <TdActions>
            <BacktestRowActionButton
              v-for="action in ACTION_BUTTONS"
              :key="action.kind"
              :icon="action.icon"
              :label="action.kind === 'plot' ? t('v7backtest.plotImages', { version: String(entry.row.backtest_version || 'v7').toUpperCase() }) : t(action.titleKey)"
              :pressed="activeActions[entry.row.path]?.has(action.kind)"
              :data-action="action.kind"
              :data-path="entry.row.path"
              @click="emit('toggle-action', entry.row.path, action.kind)"
            />
            <BacktestRowActionButton
              v-if="allowV8Convert && entry.row.backtest_version === 'v7'"
              :label="t('v7backtest.convertResultToV8')"
              tone="accent"
              data-action="convert"
              :data-path="entry.row.path"
              @click="emit('convert', entry.row.path)"
            >
              <span class="font-mono text-[10px] font-bold tracking-tight">V8</span>
            </BacktestRowActionButton>
          </TdActions>
        </tr>
        </template>
      </tbody>
    </Table>
  </div>
</template>

<style scoped>
.result-group-row > td {
  border-bottom: 1px solid var(--border-secondary, rgb(255 255 255 / 0.08));
  background: var(--bg-panel, rgb(255 255 255 / 0.03));
  position: sticky;
  top: 33px;
  z-index: 1;
}

.result-group-toggle {
  cursor: pointer;
  color: inherit;
}
</style>
