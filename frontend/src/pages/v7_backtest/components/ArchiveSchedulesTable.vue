<script setup lang="ts">
/**
 * ArchiveSchedulesTable — renderArchiveRetestSchedules (:9149-9200):
 * status/cadence/targets/date-mode/next-run/last-status columns, the
 * own-only actions cell (:9167, :9183-9187) and the empty state.
 */
import { PhCheckCircle, PhPause, PhPlay, PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Table, TdActions, Th } from '@/shared/components/ui/table';
import { scheduleCadenceLabel, scheduleModeLabel, scheduleStatusLabel } from '../lib/archiveModel';
import type { ArchiveRetestScheduleItem } from '../types';
import type { I18nT } from '../types.i18n';

defineProps<{
  schedules: readonly ArchiveRetestScheduleItem[];
  own: boolean;
}>();

const emit = defineEmits<{ run: [id: string]; toggle: [id: string]; remove: [id: string] }>();

const { t } = useI18n();
const tt = ((key: string, params?: Record<string, unknown>) => t(key, params ?? {})) as I18nT;

function statusText(item: ArchiveRetestScheduleItem): string {
  return item.last_status ? (item.last_message ? `${item.last_status}: ${item.last_message}` : item.last_status) : '';
}
</script>

<template>
  <div>
    <div v-if="schedules.length === 0" class="empty-state px-5 py-15 text-center text-md text-secondary">{{ t('v7backtest.noRetestSchedules') }}</div>
    <Table v-else class="select-none">
      <thead>
        <tr>
          <Th class="cursor-default">{{ t('v7backtest.status') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.cadence') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.targets') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.dateMode') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.nextRun') }}</Th>
          <Th class="cursor-default">{{ t('v7backtest.lastStatus') }}</Th>
          <Th v-if="own" class="cursor-default">{{ t('v7backtest.actions') }}</Th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in schedules" :key="item.id">
          <td class="truncate">{{ scheduleStatusLabel(item, tt) }}</td>
          <td class="truncate text-secondary">{{ scheduleCadenceLabel(item, tt) }}</td>
          <td class="tabular-nums">{{ (item.targets ?? []).length }}</td>
          <td class="truncate text-secondary">{{ scheduleModeLabel(item, tt) }}</td>
          <td class="truncate text-xs tabular-nums text-secondary" :title="item.next_run_at ?? ''">{{ item.next_run_at ?? '' }}</td>
          <td class="max-w-[320px] break-words text-secondary" :title="statusText(item)">{{ statusText(item) }}</td>
          <TdActions v-if="own">
            <Button type="button" variant="success" size="sm" class="size-7 shrink-0 rounded-md p-0" data-test="archive-sched-run" :title="t('v7backtest.runNow')" :aria-label="t('v7backtest.runNow')" @click="emit('run', item.id)"><PbIcon :icon="PhPlay" :size="16" /></Button>
            <Button type="button" variant="default" size="sm" class="size-7 shrink-0 rounded-md p-0" data-test="archive-sched-toggle" :title="t('v7backtest.enableDisable')" :aria-label="t('v7backtest.enableDisable')" @click="emit('toggle', item.id)"><PbIcon :icon="item.enabled === false ? PhCheckCircle : PhPause" :size="16" /></Button>
            <Button type="button" variant="danger" size="sm" class="size-7 shrink-0 rounded-md p-0" data-test="archive-sched-delete" :title="t('v7backtest.delete')" :aria-label="t('v7backtest.delete')" @click="emit('remove', item.id)"><PbIcon :icon="PhTrash" :size="16" /></Button>
          </TdActions>
        </tr>
      </tbody>
    </Table>
  </div>
</template>
