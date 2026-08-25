<script setup lang="ts">
/*
 * The recurring copy schedule list — legacy #copy-data-schedule-list
 * (market_data_main.html:3485-3487) rendered by renderCopyDataSchedules
 * (:5095-5125). Row data via computeScheduleRowView; the run/edit/delete
 * buttons carry data-copy-schedule-action/:9283-9293.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
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
    <p v-if="store.scheduleRows.value.length === 0" :class="noteClass">{{ t('market.noCopySchedules') }}</p>
    <div
      v-for="row in store.scheduleRows.value"
      :key="row.id"
      class="copy-data-schedule-row grid items-center gap-3 grid-cols-[minmax(220px,1.5fr)_minmax(240px,2fr)_minmax(190px,1fr)_auto] rounded-lg border border-border-default bg-page/50 py-2 px-3 max-[900px]:grid-cols-1"
      :class="row.enabled ? '' : 'is-disabled opacity-[0.68]'"
    >
      <div>
        <div class="copy-data-schedule-name font-bold text-primary">{{ row.name }}</div>
        <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.timing }}</div>
      </div>
      <div>
        <div>{{ row.targetRoot }}</div>
        <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.exchanges }}</div>
      </div>
      <div>
        <div class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.last }}</div>
        <div v-if="row.error" class="copy-data-schedule-detail text-xs text-secondary [overflow-wrap:anywhere]">{{ row.error }}</div>
      </div>
      <div class="copy-data-schedule-actions flex flex-wrap justify-end gap-2 max-[900px]:justify-start">
        <Button
          variant="info"
          type="button"
          data-copy-schedule-action="run"
          :data-schedule-id="row.id"
          @click="$emit('run', row.id)"
        >{{ t('market.runNow') }}</Button>
        <Button
          variant="info"
          type="button"
          data-copy-schedule-action="edit"
          :data-schedule-id="row.id"
          @click="$emit('edit', row.id)"
        >{{ t('market.edit') }}</Button>
        <Button
          variant="danger"
          type="button"
          data-copy-schedule-action="delete"
          :data-schedule-id="row.id"
          @click="$emit('remove', row.id)"
        >{{ t('common.delete') }}</Button>
      </div>
    </div>
  </div>
</template>
