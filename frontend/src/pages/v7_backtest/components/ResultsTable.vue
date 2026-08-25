<script setup lang="ts">
/**
 * ResultsTable — _renderResultsTableInto (:5514-5577) as a Vue table:
 * sortable headers (rth/setResSort :5452-5463) over the results
 * whitelist, liquidation tinting + the ⚠ prefix (:5545-5552), the five
 * per-result icon toggles with their active state, the optional V8
 * convert button (:5547-5549) and click/drag row selection with wrap
 * auto-scroll (:5731-5785).
 */
import { PhCopy, PhEye, PhFileText, PhFlask, PhImage } from '@phosphor-icons/vue';
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useRowDragSelect } from '../composables/useRowDragSelect';
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
    /** The scrolling wrap this table auto-scrolls (:5773, :5918, :5977). */
    wrapId?: string;
  }>(),
  { showVersion: true, showStrategy: true, allowV8Convert: false, wrapId: '#results-list-wrap' }
);

const emit = defineEmits<{
  sort: [column: string];
  'toggle-select': [path: string];
  'select-paths': [paths: string[], selected: boolean];
  'toggle-action': [path: string, kind: ResultActionKind];
  convert: [path: string];
}>();

const { t } = useI18n();

const showStrategy = computed(() => props.showStrategy && props.rows.some((row) => String(row.backtest_version ?? '').toLowerCase() === 'v8'));
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

function arrowFor(col: string): string {
  return props.sort.col === col ? (props.sort.asc ? ' ▲' : ' ▼') : '';
}

function headerTitle(label: string): string {
  return t('v7backtest.sortBy', { label });
}

/** Header checkbox selects/deselects every visible row (:816-818). */
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.has(row.path)));
function toggleAll(): void {
  emit('select-paths', props.rows.map((row) => row.path), !allSelected.value);
}

/** fmt (:6490-6493). */
function fmt(value: number | null | undefined, decimals: number): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value).toFixed(decimals);
}

/** fmtDate (:6497-6502). */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
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
  <div v-if="rows.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary">
    <div class="mb-3 text-[48px] opacity-40">📊</div>
    {{ t('v7backtest.noResultsFound') }}
  </div>
  <div v-else ref="wrap" style="position: relative">
    <table class="tbl">
      <thead>
        <tr>
          <th class="check-col" style="text-align: center">
            <Checkbox
              :model-value="allSelected"
              :aria-label="t('v7backtest.selectAll')"
              data-test="results-select-all-check"
              @update:model-value="toggleAll"
            />
          </th>
          <th
            v-for="header in headers"
            :key="header.col"
            :data-col="header.col"
            style="cursor: pointer"
            :title="headerTitle(header.label)"
            @click="emit('sort', header.col)"
          >
            {{ header.label }}<span class="sort-arrow">{{ arrowFor(header.col) }}</span>
          </th>
          <th :title="t('v7backtest.tweTooltip')">TWE</th>
          <th>POS</th>
          <th style="text-align: center">{{ t('v7backtest.actions') }}</th>
        </tr>
      </thead>
      <tbody ref="tbody">
        <tr
          v-for="row in rows"
          :key="row.path"
          :data-path="row.path"
          :data-liquidated="row.liquidated ? 'true' : undefined"
          :class="{ selected: selected.has(row.path) }"
          :style="row.liquidated ? { background: 'rgb(var(--danger-rgb) / .10)' } : undefined"
          @click="emit('toggle-select', row.path)"
        >
          <td class="check-col" @click.stop>
            <Checkbox
              :model-value="selected.has(row.path)"
              :aria-label="row.path"
              @update:model-value="emit('toggle-select', row.path)"
            />
          </td>
          <td v-if="showVersion">PB{{ (row.backtest_version || '').toUpperCase() }}</td>
          <td :title="row.display_name || `${row.config_name}/${row.exchange_dir || ''}/${row.result_name}`" data-col="config_name" style="max-width: 250px">
            <span v-if="row.liquidated" style="color: var(--red)" :title="t('v7backtest.liquidated')">⚠️</span>
            {{ row.display_name || `${row.config_name}/${row.exchange_dir || ''}/${row.result_name}` }}
          </td>
          <td v-if="showStrategy" class="mono">{{ row.strategy || '-' }}</td>
          <td v-if="showCoins" :title="coinsText(row)" data-col="coins_text" style="max-width: 140px">{{ coinsText(row) }}</td>
          <td>{{ exchangesText(row) }}</td>
          <td>{{ fmtDate(row.modified) }}</td>
          <td>{{ fmt(row.adg, 4) }}</td>
          <td>{{ fmt(row.gain, 2) }}</td>
          <td>{{ fmt(row.drawdown_worst, 4) }}</td>
          <td>{{ fmt(row.sharpe_ratio, 4) }}</td>
          <td>{{ fmt(row.starting_balance, 0) }}</td>
          <td>{{ fmt(row.final_balance, 0) }}</td>
          <td>{{ fmt(row.twe_long, 2) }} / {{ fmt(row.twe_short, 2) }}</td>
          <td>{{ fmt(row.pos_long, 0) }} / {{ fmt(row.pos_short, 0) }}</td>
          <td class="actions-cell" @click.stop>
            <Button
              v-for="action in ACTION_BUTTONS"
              :key="action.kind"
              type="button"
              variant="ghost"
              class="icon-btn h-auto border-0 p-0.5"
              :class="{ active: activeActions[row.path]?.has(action.kind) }"
              :data-action="action.kind"
              :data-path="row.path"
              :title="action.kind === 'plot' ? t('v7backtest.plotImages', { version: String(row.backtest_version || 'v7').toUpperCase() }) : t(action.titleKey)"
              :aria-label="action.kind === 'plot' ? t('v7backtest.plotImages', { version: String(row.backtest_version || 'v7').toUpperCase() }) : t(action.titleKey)"
              @click="emit('toggle-action', row.path, action.kind)"
            >
              <PbIcon :icon="action.icon" :size="18" />
            </Button>
            <Button
              v-if="allowV8Convert && row.backtest_version === 'v7'"
              type="button"
              variant="ghost"
              class="icon-btn h-auto border-0 p-0.5"
              data-action="convert"
              :data-path="row.path"
              :title="t('v7backtest.convertResultToV8')"
              @click="emit('convert', row.path)"
            >
              V8
            </Button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
