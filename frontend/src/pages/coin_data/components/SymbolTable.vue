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
  <div class="table-wrap">
    <table :class="'coin-' + table + '-table'">
      <colgroup><col v-for="column in columns" :key="column.key" :style="{ width: column.width }" /></colgroup>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="sortable"
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
          class="data-row"
          :class="{ selected: selectedKey === rowKey(row, table) }"
          :data-table="table"
          :data-key="rowKey(row, table)"
          @click="emit('select', table, rowKey(row, table))"
        >
          <td v-for="column in columns" :key="column.key" :class="{ mono: column.mono }" :title="cellText(row, column)">
            <template v-if="column.render === 'cpt'">
              <span v-if="row[column.key]" class="badge ok">{{ t('common.yes') }}</span>
              <span v-else class="badge dim">{{ t('common.no') }}</span>
            </template>
            <template v-else-if="column.render === 'notice'">
              <span v-if="row[column.key]" class="badge warn" :title="String(row[column.key])">{{ t('market.notice') }}</span>
              <span v-else class="badge dim">-</span>
            </template>
            <template v-else-if="column.render === 'tags'">
              <div v-if="rowTags(row, column).length" class="tags-cell" :title="rowTags(row, column).join(', ')">
                <span v-for="tag in rowTags(row, column).slice(0, 3)" :key="tag" class="tag-chip" :title="tag">{{ tag }}</span>
                <span v-if="rowTags(row, column).length > 3" class="tag-chip" :title="rowTags(row, column).join(', ')">+{{ rowTags(row, column).length - 3 }}</span>
              </div>
              <template v-else>-</template>
            </template>
            <template v-else>{{ cellText(row, column) }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
  <div class="empty-state" :id="table + '-empty'" :class="{ hidden: rows.length > 0 }">{{ emptyMessage() }}</div>
</template>
