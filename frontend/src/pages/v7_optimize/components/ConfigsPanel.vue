<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import type { Component } from 'vue';
import { PhCaretDown, PhCaretUp, PhCopy, PhPencilSimple } from '@phosphor-icons/vue';
import { useRowDragSelect } from '../../v7_backtest/composables/useRowDragSelect';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import EmptyState from '@/shared/components/EmptyState.vue';
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
const editLabel = computed(() => t('v7optimize.editConfig'));
const duplicateLabel = computed(() => t('v7optimize.duplicate'));
function isSorted(key: string): boolean { return props.sort.key === key; }
function sortIcon(key: string): Component { return props.sort.key === key && props.sort.direction === 'desc' ? PhCaretDown : PhCaretUp; }
/* Icon-only row actions (edit / duplicate) reuse the backtest row-action tone: quiet border, accent on hover. */
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
const wrap = ref<HTMLElement | null>(null);
const tbody = ref<HTMLElement | null>(null);
const dragSelect = useRowDragSelect({
  getRows: () => tbody.value ? Array.from(tbody.value.querySelectorAll('tr[data-path]')) : [],
  getWrap: () => wrap.value,
  isSelected: (path) => props.selected.has(path),
  onToggle: (path) => emit('toggle', path),
  onSelectRange: (paths, selected) => emit('selectRange', paths, selected),
});
onBeforeUnmount(() => dragSelect.dispose());
</script>

<template>
  <div class="opt-panel-controls opt-filter-bar pbgui-list-toolbar mb-2.5 flex flex-wrap items-center gap-2.5">
    <div class="opt-panel-search" role="search">
      <Input
        class="min-w-60"
        :model-value="search"
        :placeholder="t('v7optimize.searchOptimizeName')"
        @update:model-value="emit('update:search', String($event ?? ''))"
      />
    </div>
    <div class="opt-panel-counts flex items-center gap-2.5 text-xs text-secondary" aria-live="polite">
      <span>{{ t('v7optimize.configCount', { count: rows.length }) }}</span>
      <span v-if="selectedCount" class="font-medium text-accent-soft">{{ t('v7optimize.configsSelected', { count: selectedCount }) }}</span>
    </div>
    <span class="flex-1"></span>
    <Button type="button" variant="default" size="sm" :disabled="!rows.length" data-test="select-all-configs" @click="emit('selectAll')">{{ t('v7optimize.selectAll') }}</Button>
    <Button type="button" variant="default" size="sm" :disabled="!selectedCount" @click="emit('clearSelection')">{{ t('v7optimize.deselect') }}</Button>
  </div>
  <div ref="wrap" class="opt-table-wrap opt-table-wrap--configs pbgui-list-wrap min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <table class="opt-table opt-table--configs pbgui-list-table w-full border-separate border-spacing-0 text-sm max-[800px]:min-w-[720px]">
      <thead>
        <tr>
          <th class="w-10 pr-1!"><Checkbox :model-value="allSelected" :disabled="!rows.length" :aria-label="t('v7optimize.selectAll')" data-test="configs-select-all-check" @update:model-value="allSelected ? emit('clearSelection') : emit('selectAll')" /></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'name')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thName') }}<PbIcon v-if="isSorted('name')" :icon="sortIcon('name')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'exchange')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thExchange') }}<PbIcon v-if="isSorted('exchange')" :icon="sortIcon('exchange')" :size="12" class="text-accent-soft" /></span></th>
          <th v-if="isV8" class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'strategy')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thStrategy') }}<PbIcon v-if="isSorted('strategy')" :icon="sortIcon('strategy')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'backtest_count')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thBacktests') }}<PbIcon v-if="isSorted('backtest_count')" :icon="sortIcon('backtest_count')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'start')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thStart') }}<PbIcon v-if="isSorted('start')" :icon="sortIcon('start')" :size="12" class="text-accent-soft" /></span></th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'end')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thEnd') }}<PbIcon v-if="isSorted('end')" :icon="sortIcon('end')" :size="12" class="text-accent-soft" /></span></th>
          <th>{{ t('v7optimize.thFlags') }}</th>
          <th class="cursor-pointer transition-colors hover:text-primary" @click="emit('sort', 'modified')"><span class="inline-flex items-center gap-1">{{ t('v7optimize.thModified') }}<PbIcon v-if="isSorted('modified')" :icon="sortIcon('modified')" :size="12" class="text-accent-soft" /></span></th>
          <th>{{ t('v7optimize.thActions') }}</th>
        </tr>
      </thead>
      <tbody ref="tbody">
        <tr
          v-for="row in rows"
          :key="rowName(row)"
          :data-path="rowName(row)"
          :class="{ selected: selected.has(rowName(row)) }"
          @dblclick="emit('edit', rowName(row))"
        >
          <td class="w-10 pr-1!" @click.stop>
            <Checkbox :model-value="selected.has(rowName(row))" :aria-label="rowName(row)" @update:model-value="emit('toggle', rowName(row))" />
          </td>
          <td class="max-w-[280px] truncate font-mono" :title="rowName(row)">{{ rowName(row) }}</td>
          <td>
            <span v-if="exchange(row)" class="inline-flex max-w-[180px] items-center truncate rounded-md border border-border-default/70 bg-elevated/40 px-1.5 py-0.5 font-mono text-xs text-secondary" :title="exchange(row)">{{ exchange(row) }}</span>
            <span v-else class="text-muted">-</span>
          </td>
          <td v-if="isV8"><span v-if="row.strategy" class="font-mono text-xs text-secondary">{{ row.strategy }}</span><span v-else class="text-muted">-</span></td>
          <td class="tabular-nums" :class="backtestCount(row) ? 'font-semibold' : 'text-muted'">{{ backtestCount(row) }}</td>
          <td class="tabular-nums text-xs text-secondary">{{ shortDate(value(row, 'start', 'start_date')) || '-' }}</td>
          <td class="tabular-nums text-xs text-secondary">{{ shortDate(value(row, 'end', 'end_date')) || '-' }}</td>
          <td>
            <span v-if="flagList(row).length" class="flex flex-wrap items-center gap-1">
              <span v-for="flag in flagList(row)" :key="flag" class="inline-flex items-center rounded border border-border-default/60 px-1.5 py-0.5 font-mono text-[11px] text-muted">{{ flag }}</span>
            </span>
            <span v-else class="text-muted">-</span>
          </td>
          <td class="tabular-nums text-xs text-secondary" :title="String(row.modified || '')">{{ shortDateTime(row.modified) || '-' }}</td>
          <td class="pbgui-list-actions whitespace-nowrap! overflow-visible!" @click.stop>
            <div class="pbgui-list-actions__group">
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="editLabel" :aria-label="editLabel" data-test="config-edit" @click="emit('edit', rowName(row))"><PbIcon :icon="PhPencilSimple" :size="16" /></Button>
              <Button type="button" variant="default" size="icon" :class="iconActionClass" :title="duplicateLabel" :aria-label="duplicateLabel" data-test="config-duplicate" @click="emit('duplicate', rowName(row))"><PbIcon :icon="PhCopy" :size="16" /></Button>
            </div>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="isV8 ? 10 : 9" class="p-8! text-center">
            <EmptyState
              :title="search ? t('v7optimize.noMatches') : t('v7optimize.noOptimizeConfigsFound')"
              :message="search ? undefined : t('v7optimize.emptyConfigsHelp')"
              :action-label="search ? undefined : t('v7optimize.newConfig')"
              @action="emit('create')"
            />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
