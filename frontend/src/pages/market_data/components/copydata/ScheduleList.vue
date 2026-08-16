<script setup lang="ts">
/*
 * The recurring copy schedule list — legacy #copy-data-schedule-list
 * (market_data_main.html:3485-3487) rendered by renderCopyDataSchedules
 * (:5095-5125). Row data via computeScheduleRowView; the run/edit/delete
 * buttons carry data-copy-schedule-action/:9283-9293.
 */
import { useI18n } from 'vue-i18n';
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
  <div class="copy-data-schedule-list" id="copy-data-schedule-list">
    <p v-if="store.scheduleRows.value.length === 0" class="note">{{ t('market.noCopySchedules') }}</p>
    <div
      v-for="row in store.scheduleRows.value"
      :key="row.id"
      class="copy-data-schedule-row"
      :class="{ 'is-disabled': !row.enabled }"
    >
      <div>
        <div class="copy-data-schedule-name">{{ row.name }}</div>
        <div class="copy-data-schedule-detail">{{ row.timing }}</div>
      </div>
      <div>
        <div>{{ row.targetRoot }}</div>
        <div class="copy-data-schedule-detail">{{ row.exchanges }}</div>
      </div>
      <div>
        <div class="copy-data-schedule-detail">{{ row.last }}</div>
        <div v-if="row.error" class="copy-data-schedule-detail">{{ row.error }}</div>
      </div>
      <div class="copy-data-schedule-actions">
        <button
          class="btn secondary"
          type="button"
          data-copy-schedule-action="run"
          :data-schedule-id="row.id"
          @click="$emit('run', row.id)"
        >{{ t('market.runNow') }}</button>
        <button
          class="btn secondary"
          type="button"
          data-copy-schedule-action="edit"
          :data-schedule-id="row.id"
          @click="$emit('edit', row.id)"
        >{{ t('market.edit') }}</button>
        <button
          class="btn danger"
          type="button"
          data-copy-schedule-action="delete"
          :data-schedule-id="row.id"
          @click="$emit('remove', row.id)"
        >{{ t('common.delete') }}</button>
      </div>
    </div>
  </div>
</template>
