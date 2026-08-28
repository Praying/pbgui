<script setup lang="ts">
/*
 * The recurring copy schedule list — legacy #copy-data-schedule-list
 * (market_data_main.html:3485-3487) rendered by renderCopyDataSchedules
 * (:5095-5125). Row data via computeScheduleRowView; the run/edit/delete
 * buttons carry data-copy-schedule-action/:9283-9293.
 *
 * The list renders three states — loading (first load in flight), empty
 * (dashed panel with the noCopySchedules .note anchor + a hint line) and
 * the rows. Rows add a column header (hidden below 900px, where rows
 * collapse to one column), a disabled badge next to the name, a danger
 * tint on rows whose last run errored, and hover feedback; Run now is
 * the only filled action, edit/delete ride ghost so the row reads calm.
 */
import { useI18n } from 'vue-i18n';
import {
  PhArrowsClockwise,
  PhPauseCircle,
  PhPencilSimple,
  PhPlay,
  PhTrash,
} from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { noteClass } from '../../lib/uiClasses';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

defineEmits<{
  run: [scheduleId: string];
  edit: [scheduleId: string];
  remove: [scheduleId: string];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="copy-data-schedule-list grid gap-2" id="copy-data-schedule-list">
    <p
      v-if="store.isLoadingSchedules.value && store.scheduleRows.value.length === 0"
      :class="noteClass"
      role="status"
    >{{ t('market.loadingCopySchedules') }}</p>
    <div
      v-else-if="store.scheduleRows.value.length === 0"
      class="copy-data-schedule-empty grid place-items-center gap-1.5 rounded-lg border border-dashed border-border-default px-4 py-7 text-center"
      data-state="empty"
    >
      <PbIcon :icon="PhArrowsClockwise" :size="24" class="text-muted" />
      <p class="note m-0">{{ t('market.noCopySchedules') }}</p>
      <p class="note m-0 text-xs text-muted">{{ t('market.noCopySchedulesHint') }}</p>
    </div>
    <template v-else>
      <div
        class="copy-data-schedule-head grid gap-3 grid-cols-[minmax(220px,1.5fr)_minmax(240px,2fr)_minmax(190px,1fr)_auto] px-3 max-[900px]:hidden"
        aria-hidden="true"
      >
        <div class="text-xs uppercase tracking-label text-muted">{{ t('market.copyScheduleColSchedule') }}</div>
        <div class="text-xs uppercase tracking-label text-muted">{{ t('market.copyScheduleColTarget') }}</div>
        <div class="text-xs uppercase tracking-label text-muted">{{ t('market.copyScheduleColLastRun') }}</div>
        <div class="text-xs uppercase tracking-label text-muted text-right">{{ t('market.copyScheduleColActions') }}</div>
      </div>
      <div
        v-for="row in store.scheduleRows.value"
        :key="row.id"
        class="copy-data-schedule-row grid items-center gap-3 grid-cols-[minmax(220px,1.5fr)_minmax(240px,2fr)_minmax(190px,1fr)_auto] rounded-lg border py-2 px-3 transition-colors duration-150 max-[900px]:grid-cols-1"
        :class="[
          row.error
            ? 'border-danger/40 bg-danger/[0.05]'
            : 'border-border-default bg-page/50 hover:border-border-strong',
          row.enabled ? '' : 'is-disabled opacity-[0.68]',
        ]"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-1.5">
            <div class="copy-data-schedule-name font-bold text-primary">{{ row.name }}</div>
            <span
              v-if="!row.enabled"
              class="copy-data-schedule-badge inline-flex items-center gap-1 rounded-sm border border-border-default bg-card/70 px-1.5 py-px text-[10px] font-medium uppercase tracking-label text-secondary"
            ><PbIcon :icon="PhPauseCircle" :size="12" />{{ t('common.disabled') }}</span>
          </div>
          <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.timing }}</div>
        </div>
        <div class="min-w-0">
          <div class="text-primary">{{ row.targetRoot }}</div>
          <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.exchanges }}</div>
        </div>
        <div class="min-w-0">
          <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.last }}</div>
          <div v-if="row.error" class="copy-data-schedule-detail text-xs text-danger [overflow-wrap:anywhere]">{{ row.error }}</div>
        </div>
        <div class="copy-data-schedule-actions flex flex-wrap justify-end gap-2 max-[900px]:justify-start">
          <Button
            variant="primary"
            size="sm"
            type="button"
            data-copy-schedule-action="run"
            :data-schedule-id="row.id"
            @click="$emit('run', row.id)"
          ><PbIcon :icon="PhPlay" :size="14" /> {{ t('market.runNow') }}</Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            data-copy-schedule-action="edit"
            :data-schedule-id="row.id"
            @click="$emit('edit', row.id)"
          ><PbIcon :icon="PhPencilSimple" :size="14" /> {{ t('market.edit') }}</Button>
          <Button
            variant="ghost"
            size="sm"
            class="text-danger hover:bg-danger/12 hover:text-danger-soft"
            type="button"
            data-copy-schedule-action="delete"
            :data-schedule-id="row.id"
            @click="$emit('remove', row.id)"
          ><PbIcon :icon="PhTrash" :size="14" /> {{ t('common.delete') }}</Button>
        </div>
      </div>
    </template>
  </div>
</template>
