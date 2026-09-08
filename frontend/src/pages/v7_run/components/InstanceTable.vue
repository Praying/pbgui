<script setup lang="ts">
/**
 * The instances table — the Vue form of the legacy thead/tbody rendering
 * (v7_run.html:664-891): the column list with the v8-only Strategy column
 * spliced in at index 2 (:678), sortable headers with caret arrows (:740-768),
 * the status/blocked cell classes from buildCells (:696-726), the inline row
 * buttons (data-edit/data-balance/data-convert-v8/data-forced-mode/
 * data-delete) and the empty row (:876-890). The legacy diff-based DOM
 * update becomes plain declarative rows. Styled by the shared
 * pbgui-list-table contract (components.css) like the optimize workbench.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhCurrencyDollar, PhPencilSimple, PhX } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { EmptyRow, ListWrap, SortTh, Table, TdActions, Th } from '@/shared/components/ui/table';
import { forcedModeLabelKey, normalizedForcedMode, STATUS_LABEL_KEYS, type RunInstance, type SortState } from '../lib/table';

const props = defineProps<{
  rows: RunInstance[];
  totalCount: number;
  isV8: boolean;
  supportsForcedModes: boolean;
  supportsConversion: boolean;
  sort: SortState;
  loading?: boolean;
}>();

const emit = defineEmits<{
  edit: [name: string];
  balance: [name: string];
  convert: [name: string];
  forcedMode: [name: string, mode: string, expectedVersion?: number];
  remove: [name: string];
  sort: [col: string];
}>();

const { t } = useI18n();

interface Column {
  key: string;
  labelKey: string | null;
}

/** COLS (:665-678) — label null = the unlabeled actions column. */
const columns = computed<Column[]>(() => {
  const base: Column[] = [
    { key: 'name', labelKey: 'v7run.colName' },
    { key: 'user', labelKey: 'v7run.user' },
  ];
  if (props.isV8) base.push({ key: 'strategy', labelKey: 'v7run.colStrategy' }); // :678
  return base.concat([
    { key: 'enabled_on', labelKey: 'v7run.colEnabledOn' },
    { key: 'status', labelKey: 'v7run.status' },
    { key: 'version', labelKey: 'v7run.colCfgVer' },
    { key: 'running_version', labelKey: 'v7run.colRunVer' },
    { key: 'twe', labelKey: 'v7run.colTwe' },
    { key: 'running_on', labelKey: 'v7run.colRunningOn' },
    { key: 'desired_state', labelKey: 'v7run.colDesired' },
    { key: 'note', labelKey: 'v7run.note' },
    { key: '_actions', labelKey: null },
  ]);
});



/** buildCells status label (:698). */
function statusLabel(row: RunInstance): string {
  const key = STATUS_LABEL_KEYS[row.status ?? ''] ?? null;
  return key ? t(key) : row.status || '-';
}

/** buildCells running_on text (:700-703). */
function runningOn(row: RunInstance): string {
  const runOn = (row.running_on || []).join(', ') || '-';
  if ((!row.running_on || !row.running_on.length) && row.blocked_on && row.blocked_on.length) {
    return t('v7run.blockedOn', { hosts: row.blocked_on.join(', ') });
  }
  return runOn;
}

/** Status → pbgui-badge tint utilities (the former v7-run.css .st-* tints;
   branches spelled out because Tailwind cannot see dynamically concatenated
   class names). */
function statusClass(status: string | null | undefined): string {
  const st = String(status || 'disabled').replace(/[^a-z_]/g, '');
  if (st === 'synced') return 'bg-success/15 text-success';
  if (st === 'outdated' || st === 'activate_needed') return 'bg-warning/15 text-warning';
  if (st === 'stop_needed' || st === 'blocked' || st === 'conflicted' || st === 'tombstoned' || st === 'config_error') return 'bg-danger/15 text-danger';
  if (st === 'collecting') return 'bg-secondary/12 text-secondary';
  return 'bg-secondary/10 text-secondary';
}

function orDash(value: unknown): string {
  return value != null && value !== '' ? String(value) : '-';
}

function forcedModeSummary(row: RunInstance): string {
  const longMode = normalizedForcedMode(row.forced_mode_long);
  const shortMode = normalizedForcedMode(row.forced_mode_short);
  if (!longMode && !shortMode) return '';
  if (longMode === shortMode) return t(forcedModeLabelKey(longMode));
  return `L: ${t(forcedModeLabelKey(longMode))} · S: ${t(forcedModeLabelKey(shortMode))}`;
}

function onRowDblClick(row: RunInstance, event: MouseEvent): void {
  if ((event.target as Element).closest('[data-edit],[data-balance],[data-delete],[data-forced-mode],[data-convert-v8]')) return; // :1442
  emit('edit', row.name); // :1443-1444
}

/* Secondary row actions are icon buttons sharing the workbench chrome; the
   P/G/T/N forced-mode keys keep their semantic variant tints. */
const iconActionClass = 'size-7 shrink-0 rounded-md border border-border-default bg-elevated text-secondary shadow-none hover:border-accent/45 hover:bg-accent/10 hover:text-accent-soft';
</script>

<template>
  <ListWrap class="min-h-0 flex-1 overflow-auto rounded-md border border-border-default">
    <Table class="min-w-max">
      <thead id="thead">
        <tr>
          <template v-for="col in columns" :key="col.key">
            <SortTh
              v-if="col.labelKey"
              :sort-key="col.key"
              :label="t(col.labelKey)"
              :sort="sort.col === col.key ? (sort.asc ? 'asc' : 'desc') : undefined"
              @sort="emit('sort', col.key)"
            />
            <Th v-else />
          </template>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr class="cursor-pointer"
          v-for="row in rows"
          :key="row.name"
          :data-key="row.name"
          :class="row.status === 'disabled' ? 'opacity-60' : ''"
          @dblclick="onRowDblClick(row, $event)"
        >
          <td class="whitespace-nowrap font-medium">{{ row.name }}</td>
          <td class="whitespace-nowrap">{{ orDash(row.user) }}</td>
          <td v-if="isV8" class="whitespace-nowrap">{{ orDash(row.strategy) }}</td>
          <td class="whitespace-nowrap">{{ orDash(row.enabled_on) }}</td>
          <td>
            <span class="pbgui-badge inline-flex items-center gap-1.5 rounded-full px-2 py-[2px] text-xs font-semibold" :class="statusClass(row.status)" :title="row.blocked_reason || undefined">
              <span class="h-1.5 w-1.5 rounded-full bg-current opacity-80"></span>
              {{ statusLabel(row) }}
            </span>
            <div v-if="supportsForcedModes && forcedModeSummary(row)" class="mt-1 text-xs font-semibold text-warning" :class="{ 'text-danger': normalizedForcedMode(row.forced_mode_long) === 'panic' || normalizedForcedMode(row.forced_mode_short) === 'panic' }">
              {{ t('v7run.globalForcedMode') }}: {{ forcedModeSummary(row) }}
            </div>
          </td>
          <td class="whitespace-nowrap tabular-nums">{{ row.version != null ? String(row.version) : '-' }}</td>
          <td class="whitespace-nowrap tabular-nums">{{ row.running_version != null ? String(row.running_version) : '-' }}</td>
          <td class="whitespace-nowrap tabular-nums">{{ orDash(row.twe) }}</td>
          <td class="whitespace-nowrap">{{ runningOn(row) }}</td>
          <td class="whitespace-nowrap">{{ orDash(row.desired_state) }}</td>
          <td class="whitespace-nowrap">{{ row.note || '' }}</td>
          <TdActions>
            <template v-if="supportsForcedModes">
              <Button class="size-7 shrink-0 rounded-md p-0 text-xs font-bold" variant="danger" size="sm" type="button" data-forced-mode="panic" :data-forced-name="row.name" :title="t('v7run.panicAllPositions')" :aria-label="t('v7run.panicAllPositions')" @click="emit('forcedMode', row.name, 'panic')">P</Button>
              <Button class="size-7 shrink-0 rounded-md p-0 text-xs font-bold" variant="warning" size="sm" type="button" data-forced-mode="graceful_stop" :data-forced-name="row.name" :title="t('v7run.gracefulStopAllPositions')" :aria-label="t('v7run.gracefulStopAllPositions')" @click="emit('forcedMode', row.name, 'graceful_stop')">G</Button>
              <Button class="size-7 shrink-0 rounded-md p-0 text-xs font-bold" variant="success" size="sm" type="button" data-forced-mode="tp_only" :data-forced-name="row.name" :title="t('v7run.takeProfitOnlyAllPositions')" :aria-label="t('v7run.takeProfitOnlyAllPositions')" @click="emit('forcedMode', row.name, 'tp_only')">T</Button>
              <Button v-if="forcedModeSummary(row)" class="size-7 shrink-0 rounded-md p-0 text-xs font-bold" variant="info" size="sm" type="button" data-forced-mode="normal" :data-forced-name="row.name" :data-forced-version="row.version ?? 0" :title="t('v7run.clearForcedMode')" :aria-label="t('v7run.clearForcedMode')" @click="emit('forcedMode', row.name, 'normal', row.version ?? 0)">N</Button>
            </template>
            <Button type="button" variant="default" size="icon" :class="iconActionClass" :data-edit="row.name" :title="t('v7run.edit')" :aria-label="t('v7run.edit')" @click="emit('edit', row.name)"><PbIcon :icon="PhPencilSimple" :size="16" /></Button>
            <Button type="button" variant="default" size="icon" :class="iconActionClass" :data-balance="row.name" :title="t('v7run.openBalanceCalculator')" :aria-label="t('v7run.openBalanceCalculator')" @click="emit('balance', row.name)"><PbIcon :icon="PhCurrencyDollar" :size="16" /></Button>
            <Button v-if="supportsConversion" class="h-7 shrink-0 rounded-md px-1.5 text-xs font-semibold" variant="info" size="sm" type="button" :data-convert-v8="row.name" :title="t('v7run.convertToV8')" :aria-label="t('v7run.convertToV8')" @click="emit('convert', row.name)">V8</Button>
            <Button class="size-7 shrink-0 rounded-md p-0" variant="danger" size="sm" type="button" :data-delete="row.name" :title="t('common.delete')" :aria-label="t('common.delete')" @click="emit('remove', row.name)"><PbIcon :icon="PhX" :size="16" /></Button>
          </TdActions>
        </tr>
        <EmptyRow
          v-if="!rows.length"
          :colspan="columns.length"
          :title="loading
            ? t('common.loading')
            : totalCount ? t('v7run.noInstancesMatchFilters') : t('v7run.noLiveInstancesYet', { label: isV8 ? 'PB8' : 'PB7' })"
        />
      </tbody>
    </Table>
  </ListWrap>
</template>
