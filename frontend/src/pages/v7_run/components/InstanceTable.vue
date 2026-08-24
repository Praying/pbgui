<script setup lang="ts">
/**
 * The instances table — the Vue form of the legacy thead/tbody rendering
 * (v7_run.html:664-891): the column list with the v8-only Strategy column
 * spliced in at index 2 (:678), sortable headers with ▲/▼ arrows (:740-768),
 * the status/blocked cell classes from buildCells (:696-726), the inline row
 * buttons (data-edit/data-balance/data-convert-v8/data-forced-mode/
 * data-delete) and the empty row (:876-890). The legacy diff-based DOM
 * update becomes plain declarative rows.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { STATUS_LABEL_KEYS, type RunInstance, type SortState } from '../lib/table';

const props = defineProps<{
  rows: RunInstance[];
  totalCount: number;
  isV8: boolean;
  supportsForcedModes: boolean;
  supportsConversion: boolean;
  sort: SortState;
}>();

const emit = defineEmits<{
  edit: [name: string];
  balance: [name: string];
  convert: [name: string];
  forcedMode: [name: string, mode: string];
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

/** Sort arrow text (:747-748). */
function arrow(key: string): string {
  if (props.sort.col !== key) return '';
  return props.sort.asc ? ' \u25B2' : ' \u25BC';
}

/** buildCells status label (:698). */
function statusLabel(row: RunInstance): string {
  const key = STATUS_LABEL_KEYS[row.status ?? ''] ?? null;
  return key ? t(key) : row.status || '\u2013';
}

/** buildCells running_on text (:700-703). */
function runningOn(row: RunInstance): string {
  const runOn = (row.running_on || []).join(', ') || '\u2013';
  if ((!row.running_on || !row.running_on.length) && row.blocked_on && row.blocked_on.length) {
    return t('v7run.blockedOn', { hosts: row.blocked_on.join(', ') });
  }
  return runOn;
}

/** Status → Tailwind utilities (the former v7-run.css .st-* tints). */
function statusClass(status: string | null | undefined): string {
  const st = String(status || 'disabled').replace(/[^a-z_]/g, '');
  if (st === 'synced') return 'font-semibold text-success';
  if (st === 'outdated') return 'font-semibold text-warning';
  if (st === 'activate_needed') return 'text-warning';
  if (st === 'stop_needed') return 'text-danger';
  if (st === 'blocked' || st === 'conflicted' || st === 'tombstoned' || st === 'config_error') return 'font-semibold text-danger';
  if (st === 'collecting') return 'italic text-secondary';
  return 'text-secondary';
}

function orDash(value: unknown): string {
  return value != null && value !== '' ? String(value) : '\u2013';
}

function onRowDblClick(row: RunInstance, event: MouseEvent): void {
  if ((event.target as Element).closest('[data-edit],[data-balance],[data-delete],[data-forced-mode],[data-convert-v8]')) return; // :1442
  emit('edit', row.name); // :1443-1444
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="v7run-table w-full border-collapse text-base">
      <thead id="thead">
        <tr>
          <th class="sticky top-0 cursor-pointer select-none border-b-2 border-border-default bg-panel text-sm uppercase text-secondary hover:text-primary" v-for="col in columns" :key="col.key" :data-sort="col.labelKey ? col.key : undefined" @click="col.labelKey && emit('sort', col.key)">
            <template v-if="col.labelKey">{{ t(col.labelKey) }}</template>
            <span v-if="col.labelKey" class="ml-0.5 text-[10px]">{{ arrow(col.key) }}</span>
          </th>
        </tr>
      </thead>
      <tbody id="tbody">
        <tr class="group cursor-pointer"
          v-for="row in rows"
          :key="row.name"
          :data-key="row.name"
          :class="row.status === 'disabled' ? 'opacity-45' : ''"
          @dblclick="onRowDblClick(row, $event)"
        >
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ row.name }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ orDash(row.user) }}</td>
          <td v-if="isV8" class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ orDash(row.strategy) }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ orDash(row.enabled_on) }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated"><span :class="statusClass(row.status)" :title="row.blocked_reason || undefined">
              {{ statusLabel(row) }}
            </span>
          </td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ row.version != null ? String(row.version) : '–' }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ row.running_version != null ? String(row.running_version) : '–' }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ orDash(row.twe) }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ runningOn(row) }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ orDash(row.desired_state) }}</td>
          <td class="border-b border-border-default px-2 py-1 text-left whitespace-nowrap group-hover:bg-elevated">{{ row.note || '' }}</td>
          <td>
            <template v-if="supportsForcedModes">
              <button class="ml-1 h-6 w-7 cursor-pointer rounded-[3px] border border-danger bg-danger p-0 text-sm font-bold text-[#f2f5fb] hover:opacity-85" data-forced-mode="panic" :data-forced-name="row.name" :title="t('v7run.panicAllPositions')">P</button>
              <button class="ml-1 h-6 w-7 cursor-pointer rounded-[3px] border border-warning bg-warning p-0 text-sm font-bold text-accent-contrast hover:opacity-85" data-forced-mode="graceful_stop" :data-forced-name="row.name" :title="t('v7run.gracefulStopAllPositions')">G</button>
              <button class="ml-1 h-6 w-7 cursor-pointer rounded-[3px] border border-success bg-success p-0 text-sm font-bold text-accent-contrast hover:opacity-85" data-forced-mode="tp_only" :data-forced-name="row.name" :title="t('v7run.takeProfitOnlyAllPositions')">T</button>
            </template>
            <button class="h-6 w-7 cursor-pointer rounded-[3px] border border-border-default bg-panel p-0 text-sm text-accent hover:bg-elevated" :data-edit="row.name" :title="t('v7run.edit')">&#x270E;</button>
            <button class="h-6 w-7 cursor-pointer rounded-[3px] border border-border-default bg-panel p-0 text-sm text-accent hover:bg-elevated" :data-balance="row.name" :title="t('v7run.openBalanceCalculator')">$</button>
            <button v-if="supportsConversion" class="ml-1 h-6 min-w-7 cursor-pointer rounded-[3px] border border-border-default bg-panel px-1 text-xs text-accent hover:bg-elevated" :data-convert-v8="row.name" :title="t('v7run.convertToV8')">V8</button>
            <button class="ml-1 h-6 w-7 cursor-pointer rounded-[3px] border border-border-default bg-panel p-0 text-sm text-danger hover:bg-elevated" :data-delete="row.name" :title="t('common.delete')">&#x2716;</button>
          </td>
        </tr>
        <tr v-if="!rows.length" id="instances-empty-row">
          <td :colspan="columns.length" style="padding:48px 12px;text-align:center;color:var(--text-dim)">
            {{ totalCount ? t('v7run.noInstancesMatchFilters') : t('v7run.noLiveInstancesYet', { label: isV8 ? 'PB8' : 'PB7' }) }}
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
