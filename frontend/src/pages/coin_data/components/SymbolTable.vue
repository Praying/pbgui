<script setup lang="ts">
/*
 * The shared sortable symbol table — the render core of the three legacy
 * panels (renderMainRows :2619-2651, renderUnmatchedRows :2653-2680,
 * renderHip3Rows :2682-2716). Column defs drive the colgroup widths, the
 * sortable headers (:2891-2904) and the per-row cells. The owning panel
 * markup (<section>/<details> + summaries) stays in App.vue — the ported CSS
 * targets those structures (#hip3-panel > .panel-body …).
 */
import { useI18n } from 'vue-i18n';
import { PhDatabase } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { columnsForTable, type ColumnDef } from '../lib/columns';
import { formatCompact, formatPrice, formatRatio, rowKey } from '../lib/format';
import type { TableViewName } from '../types';

const props = defineProps<{
  table: TableViewName;
  rows: Array<Record<string, unknown>>;
  selectedKey: string;
}>();

const emit = defineEmits<{
  (e: 'sort', table: TableViewName, key: string): void;
  (e: 'select', table: TableViewName, key: string): void;
}>();

const { t } = useI18n();

const columns = columnsForTable(props.table);

/* ── Tailwind class mappings (the former coin-data.css table rules) ──
   Each helper returns a complete utility set — the legacy bare
   table/th/td rules and the #hip3-panel .table-wrap overrides never mix
   with the generic declarations that preceded them. */

/** The bare table rule as utilities; coin-<table>-table stays as the
 *  legacy inert anchor (the old :class concatenated it dynamically). */
function tableClass(): string {
  return `coin-${props.table}-table w-full border-collapse table-fixed`;
}

/** .table-wrap base vs the #hip3-panel variant — the hip3 branch carries
 *  the legacy overflow/scrollbar-gutter/padding overrides in full, the
 *  equivalent of #hip3-panel.active-panel .table-wrap winning over the
 *  generic .table-wrap overflow. */
function tableWrapClass(): string {
  const base = 'coin-data-table-wrap flex-1 min-h-0 [scrollbar-width:thin] [scrollbar-color:var(--border-strong)_transparent] max-[980px]:flex-none max-[980px]:max-h-none';
  return props.table === 'hip3'
    ? `${base} overflow-x-auto overflow-y-scroll overscroll-contain [scrollbar-gutter:stable_both-edges] pt-0 px-[1rem] pb-[1rem]`
    : `${base} overflow-auto`;
}

/** tr.data-row states — the selected branch carries the accent tint
 *  alone (legacy cascade: .selected ranked after :hover, so a selected
 *  row keeps its tint on hover); the neutral branch carries the hover
 *  lift. 'data-row' / 'selected' remain the legacy anchors. */
function rowClass(selected: boolean): string {
  return selected ? 'selected' : '';
}

function headerLabel(column: ColumnDef): string {
  return column.labelKey ? t(column.labelKey) : column.key;
}

/** Cell text (:2637-2648, :2673-2677, :2706-2713); badge/chip columns render in-template. */
function cellText(row: Record<string, unknown>, column: ColumnDef): string {
  const value = row[column.key];
  switch (column.render) {
    case 'rank':
      return value == null ? '-' : String(value);
    case 'price':
      return formatPrice(value);
    case 'compact':
      return formatCompact(value);
    case 'ratio':
      return formatRatio(value);
    default:
      return value == null || value === '' ? '-' : String(value);
  }
}

function emptyMessage(): string {
  if (props.table === 'unmatched') return t('market.noUnmatchedSymbols');
  if (props.table === 'hip3') return t('market.noHip3Symbols');
  return t('market.noSymbolsMatch');
}

/** renderTags (:2597-2606) — first three chips plus the '+N' overflow. */
function rowTags(row: Record<string, unknown>, column: ColumnDef): string[] {
  return Array.isArray(row[column.key]) ? (row[column.key] as string[]) : [];
}
</script>

<template>
  <div class="table-wrap" :class="tableWrapClass()">
    <table :class="tableClass()">
      <colgroup><col v-for="column in columns" :key="column.key" :style="{ width: column.width }" /></colgroup>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="coin-table-header sortable cursor-pointer sticky top-0 z-[2] text-secondary text-sm uppercase tracking-[0.055em] font-bold text-left px-[0.65rem] py-[0.6rem] leading-[1.05] border-b whitespace-nowrap"
            :data-table="table"
            :data-key="column.key"
            @click="emit('sort', table, column.key)"
          >{{ headerLabel(column) }}</th>
        </tr>
      </thead>
      <tbody :id="table + '-body'">
        <tr
          v-for="row in rows"
          :key="rowKey(row, table)"
          class="data-row cursor-pointer"
          :class="rowClass(selectedKey === rowKey(row, table))"
          :data-table="table"
          :data-key="rowKey(row, table)"
          @click="emit('select', table, rowKey(row, table))"
        >
          <td v-for="column in columns" :key="column.key" class="coin-table-cell px-[0.65rem] py-[0.38rem] border-b text-primary leading-[1.12] align-middle overflow-hidden text-ellipsis whitespace-nowrap" :class="column.mono ? 'mono text-sm' : 'text-md'" :title="cellText(row, column)">
            <template v-if="column.render === 'cpt'">
              <span v-if="row[column.key]" class="badge pbgui-badge badge-success ok inline-flex items-center justify-center min-w-[22px] py-[0.03rem] px-[0.35rem] rounded-full border text-xs font-bold leading-none bg-success/15 border-success/30 text-success">{{ t('common.yes') }}</span>
              <span v-else class="badge pbgui-badge badge-muted dim inline-flex items-center justify-center min-w-[22px] py-[0.03rem] px-[0.35rem] rounded-full border text-xs font-bold leading-none bg-secondary/12 border-secondary/20 text-primary">{{ t('common.no') }}</span>
            </template>
            <template v-else-if="column.render === 'notice'">
              <span v-if="row[column.key]" class="badge pbgui-badge badge-warning warn inline-flex items-center justify-center min-w-[22px] py-[0.03rem] px-[0.35rem] rounded-full border text-xs font-bold leading-none bg-warning/14 border-warning/28 text-warning-soft" :title="String(row[column.key])">{{ t('market.notice') }}</span>
              <span v-else class="badge pbgui-badge badge-muted dim inline-flex items-center justify-center min-w-[22px] py-[0.03rem] px-[0.35rem] rounded-full border text-xs font-bold leading-none bg-secondary/12 border-secondary/20 text-primary">-</span>
            </template>
            <template v-else-if="column.render === 'tags'">
              <div v-if="rowTags(row, column).length" class="tags-cell flex flex-nowrap items-center gap-1 whitespace-nowrap overflow-hidden min-w-0" :title="rowTags(row, column).join(', ')">
                <span v-for="tag in rowTags(row, column).slice(0, 3)" :key="tag" class="tag-chip inline-flex items-center flex-none max-w-[82px] py-[0.02rem] px-[0.34rem] rounded-full bg-secondary/12 border border-secondary/16 text-primary text-xs leading-none overflow-hidden text-ellipsis whitespace-nowrap" :title="tag">{{ tag }}</span>
                <span v-if="rowTags(row, column).length > 3" class="tag-chip inline-flex items-center flex-none max-w-[82px] py-[0.02rem] px-[0.34rem] rounded-full bg-secondary/12 border border-secondary/16 text-primary text-xs leading-none overflow-hidden text-ellipsis whitespace-nowrap" :title="rowTags(row, column).join(', ')">+{{ rowTags(row, column).length - 3 }}</span>
              </div>
              <template v-else>-</template>
            </template>
            <template v-else>{{ cellText(row, column) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="coin-table-empty empty-state flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center" :id="table + '-empty'" :class="rows.length > 0 ? 'hidden' : ''">
    <span class="grid h-12 w-12 place-items-center rounded-xl border text-secondary">
      <PbIcon :icon="PhDatabase" :size="23" />
    </span>
    <span class="max-w-[46ch] text-sm leading-relaxed text-muted">{{ emptyMessage() }}</span>
  </div>
</template>

<style scoped>
/* .table-wrap scrollbar chrome — ported from styles/coin-data.css at the
   Tailwind migration. The ::-webkit-scrollbar pseudo-element rules cannot
   be utilities; the scrollbar-width / scrollbar-color declarations live
   on the element itself as arbitrary utilities (see tableWrapClass). */
.table-wrap::-webkit-scrollbar {
  width: 5px;
  height: 5px;
}

.table-wrap::-webkit-scrollbar-track {
  background: transparent;
}

.table-wrap::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 999px;
}

.table-wrap::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.coin-data-table-wrap {
  background: var(--coin-data);
}

.coin-table-header {
  border-color: var(--coin-border);
  background: var(--coin-header);
}

.coin-table-header:hover {
  background: color-mix(in srgb, var(--coin-header) 90%, var(--accent) 10%);
  color: var(--text-primary);
}

.coin-table-cell {
  border-color: var(--coin-border);
}

.data-row {
  transition: background-color var(--motion-fast) var(--ease-standard);
}

.data-row:hover {
  background: var(--coin-row-hover);
}

.data-row.selected,
.data-row.selected:hover {
  background: var(--coin-row-selected);
  box-shadow: inset 3px 0 0 var(--accent);
}

.coin-table-empty {
  min-height: 180px;
  background:
    radial-gradient(circle at 50% 38%, rgb(var(--accent-rgb) / 0.045), transparent 12rem),
    var(--coin-data);
}

.coin-table-empty > span:first-child {
  border-color: var(--coin-border);
  background: rgb(var(--accent-rgb) / 0.04);
}
</style>
