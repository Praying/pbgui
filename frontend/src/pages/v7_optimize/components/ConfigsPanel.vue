<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { PhClipboardText, PhCopy, PhMagnifyingGlass, PhPencilSimple } from '@phosphor-icons/vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { EmptyRow, ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import type { ConfigSummary } from '../types';

const props = withDefaults(
  defineProps<{
    rows: ConfigSummary[];
    selected: Set<string>;
    search: string;
    isV8: boolean;
    sort?: { key: string; direction: 'asc' | 'desc' };
  }>(),
  { sort: () => ({ key: 'modified', direction: 'desc' }) },
);
const emit = defineEmits<{
  'update:search': [value: string];
  toggle: [name: string];
  create: [];
  edit: [name: string];
  duplicate: [name: string];
  sort: [key: string];
  selectAll: [];
  clearSelection: [];
  selectRange: [paths: string[], selected: boolean];
}>();
const { t } = useI18n();
const selectedCount = computed(() => props.selected.size);
const allSelected = computed(() => props.rows.length > 0 && props.rows.every((row) => props.selected.has(rowName(row))));
function rowName(row: ConfigSummary): string { return String(row.name || ''); }
function exchange(row: ConfigSummary): string {
  const value = row.exchanges ?? row.exchange;
  return Array.isArray(value) ? value.join(', ') : String(value || '');
}
function value(row: ConfigSummary, ...keys: string[]): string { for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]); return ''; }
function flagList(row: ConfigSummary): string[] {
  const raw = row.flags;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  return raw ? [String(raw)] : [];
}
function backtestCount(row: ConfigSummary): number { return Number(row.backtest_count ?? 0); }
/* Trim ISO timestamps to the date-only columns (:start/:end). */
function shortDate(input: unknown): string {
  const match = String(input ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? String(input ?? '');
}
/* Trim the noisy ISO microseconds (:47.207418) to YYYY-MM-DD HH:MM. */
function shortDateTime(input: unknown): string {
  const text = String(input ?? '');
  const withTime = text.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  return withTime ? `${withTime[1]} ${withTime[2]}` : shortDate(text);
}

function onConfigRowKeydown(event: KeyboardEvent, configName: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  emit('toggle', configName);
}
const editLabel = computed(() => t('v7optimize.editConfig'));
const duplicateLabel = computed(() => t('v7optimize.duplicate'));
/* Icon-only row actions (edit / duplicate) reuse the backtest row-action tone: quiet border, accent on hover. */
const iconActionClass = 'pbgui-config-action size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
const wrap = ref<InstanceType<typeof ListWrap> | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value?.root ?? null,
  isSelected: (path) => props.selected.has(path),
  onToggle: (path) => emit('toggle', path),
  onSelectRange: (paths, selected) => emit('selectRange', paths, selected),
});
onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <div class="pbgui-config-list flex min-h-0 flex-1 flex-col">
    <div class="pbgui-config-toolbar pbgui-list-toolbar mb-2 flex flex-wrap items-center gap-2">
      <div class="pbgui-config-search-wrap" role="search">
        <Input
          class="pbgui-config-search"
          :model-value="search"
          :placeholder="t('v7optimize.searchOptimizeName')"
          @update:model-value="emit('update:search', String($event ?? ''))"
        />
      </div>
      <span class="flex-1"></span>
      <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-configs" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
      <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
    </div>
    <div class="pbgui-config-frame">
      <ListWrap ref="wrap" class="pbgui-config-wrap">
        <Table class="pbgui-config-table select-none">
          <thead>
            <tr>
              <SortTh sort-key="name" :label="t('v7optimize.thName')" :sort="sort.key === 'name' ? sort.direction : undefined" @sort="emit('sort', 'name')" />
              <SortTh sort-key="exchange" :label="t('v7optimize.thExchange')" :sort="sort.key === 'exchange' ? sort.direction : undefined" @sort="emit('sort', 'exchange')" />
              <SortTh v-if="isV8" sort-key="strategy" :label="t('v7optimize.thStrategy')" :sort="sort.key === 'strategy' ? sort.direction : undefined" @sort="emit('sort', 'strategy')" />
              <SortTh sort-key="backtest_count" :label="t('v7optimize.thBacktests')" :sort="sort.key === 'backtest_count' ? sort.direction : undefined" @sort="emit('sort', 'backtest_count')" />
              <SortTh sort-key="start" :label="t('v7optimize.thStart')" :sort="sort.key === 'start' ? sort.direction : undefined" @sort="emit('sort', 'start')" />
              <SortTh sort-key="end" :label="t('v7optimize.thEnd')" :sort="sort.key === 'end' ? sort.direction : undefined" @sort="emit('sort', 'end')" />
              <Th>{{ t('v7optimize.thFlags') }}</Th>
              <SortTh sort-key="modified" :label="t('v7optimize.thModified')" :sort="sort.key === 'modified' ? sort.direction : undefined" @sort="emit('sort', 'modified')" />
              <Th>{{ t('v7optimize.thActions') }}</Th>
            </tr>
          </thead>
          <tbody ref="tbody">
            <tr
              v-for="row in rows"
              :key="rowName(row)"
              :data-path="rowName(row)"
              class="config-row cursor-pointer outline-none"
              :class="{ selected: selected.has(rowName(row)) }"
              :aria-selected="selected.has(rowName(row)) ? 'true' : 'false'"
              tabindex="0"
              @click="emit('toggle', rowName(row))"
              @keydown="onConfigRowKeydown($event, rowName(row))"
              @dblclick="emit('edit', rowName(row))"
            >
              <td class="pbgui-config-name max-w-[280px] truncate" :title="rowName(row)">{{ rowName(row) }}</td>
              <td>
                <span class="pbgui-config-exchange" :title="exchange(row)">{{ exchange(row) || '-' }}</span>
              </td>
              <td v-if="isV8" data-test="config-strategy" :title="String(row.strategy || '')"><span v-if="row.strategy" class="font-mono text-xs text-secondary">{{ row.strategy }}</span><span v-else class="text-muted">-</span></td>
              <td class="pbgui-config-count" :class="backtestCount(row) ? 'font-semibold' : 'text-muted'">{{ backtestCount(row) }}</td>
              <td class="pbgui-config-date">{{ shortDate(value(row, 'start', 'start_date')) || '-' }}</td>
              <td class="pbgui-config-date">{{ shortDate(value(row, 'end', 'end_date')) || '-' }}</td>
              <td data-test="config-flags" :title="flagList(row).join(', ')">
                <span v-if="flagList(row).length" class="flex flex-wrap items-center gap-1">
                  <span v-for="flag in flagList(row)" :key="flag" class="inline-flex items-center rounded border border-border-default/60 px-1.5 py-0.5 font-mono text-[11px] text-muted">{{ flag }}</span>
                </span>
                <span v-else class="text-muted">-</span>
              </td>
              <td class="pbgui-config-date" :title="String(row.modified || '')">{{ shortDateTime(row.modified) || '-' }}</td>
              <TdActions>
                <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="editLabel" :aria-label="editLabel" data-test="config-edit" @click="emit('edit', rowName(row))"><PbIcon :icon="PhPencilSimple" :size="16" /></Button>
                <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="duplicateLabel" :aria-label="duplicateLabel" data-test="config-duplicate" @click="emit('duplicate', rowName(row))"><PbIcon :icon="PhCopy" :size="16" /></Button>
              </TdActions>
            </tr>
            <EmptyRow
              v-if="!rows.length"
              size="inline"
              :colspan="isV8 ? 9 : 8"
              :icon="search ? PhMagnifyingGlass : PhClipboardText"
              :title="search ? t('v7optimize.noMatches') : t('v7optimize.noOptimizeConfigsFound')"
              :message="search ? undefined : t('v7optimize.emptyConfigsHelp')"
              :action-label="search ? undefined : t('v7optimize.newConfig')"
              :action-variant="search ? 'secondary' : 'primary'"
              @action="emit('create')"
            />
          </tbody>
        </Table>
      </ListWrap>
      <ListFooter data-test="configs-list-footer">
        <span class="tabular-nums">{{ t('v7optimize.configCount', { count: rows.length }) }}</span>
        <span v-if="selectedCount" class="pbgui-config-selected-count font-medium text-accent-soft tabular-nums">{{ t('v7optimize.configsSelected', { count: selectedCount }) }}</span>
      </ListFooter>
    </div>
  </div>
</template>
