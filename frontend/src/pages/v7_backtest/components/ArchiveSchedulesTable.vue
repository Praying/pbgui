<script setup lang="ts">
/**
 * ArchiveSchedulesTable — renderArchiveRetestSchedules (:9149-9200):
 * status/cadence/targets/date-mode/next-run/last-status columns, the
 * own-only actions cell (:9167, :9183-9187) and the empty state.
 */
import { PhCheckCircle, PhPause, PhPlay, PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
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
    <table v-else class="tbl">
      <thead>
        <tr>
          <th>{{ t('v7backtest.status') }}</th>
          <th>{{ t('v7backtest.cadence') }}</th>
          <th>{{ t('v7backtest.targets') }}</th>
          <th>{{ t('v7backtest.dateMode') }}</th>
          <th>{{ t('v7backtest.nextRun') }}</th>
          <th>{{ t('v7backtest.lastStatus') }}</th>
          <th v-if="own">{{ t('v7backtest.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in schedules" :key="item.id">
          <td>{{ scheduleStatusLabel(item, tt) }}</td>
          <td>{{ scheduleCadenceLabel(item, tt) }}</td>
          <td>{{ (item.targets ?? []).length }}</td>
          <td>{{ scheduleModeLabel(item, tt) }}</td>
          <td>{{ item.next_run_at ?? '' }}</td>
          <td class="text-secondary" style="max-width: 320px; word-break: break-word">{{ statusText(item) }}</td>
          <td v-if="own" class="actions-cell" @click.stop>
            <button type="button" class="icon-btn good" data-test="archive-sched-run" :title="t('v7backtest.runNow')" :aria-label="t('v7backtest.runNow')" @click="emit('run', item.id)"><PbIcon :icon="PhPlay" :size="18" /></button>
            <button type="button" class="icon-btn" data-test="archive-sched-toggle" :title="t('v7backtest.enableDisable')" :aria-label="t('v7backtest.enableDisable')" @click="emit('toggle', item.id)"><PbIcon :icon="item.enabled === false ? PhCheckCircle : PhPause" :size="18" /></button>
            <button type="button" class="icon-btn danger" data-test="archive-sched-delete" :title="t('v7backtest.delete')" :aria-label="t('v7backtest.delete')" @click="emit('remove', item.id)"><PbIcon :icon="PhTrash" :size="18" /></button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
