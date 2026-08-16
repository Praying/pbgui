<script setup lang="ts">
/*
 * The schedule editor form — legacy .copy-data-schedule-form + actions
 * (market_data_main.html:3466-3484): name (80 chars), interval hours 1-168,
 * enabled toggle, save/cancel-edit pair. Edit state and the save button
 * label flip come from the store (:5155-5182, :5201).
 */
import { useI18n } from 'vue-i18n';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="copy-data-schedule-form">
    <label class="settings-field">
      <span class="field-label">{{ t('market.scheduleName') }}</span>
      <input
        id="copy-data-schedule-name"
        type="text"
        maxlength="80"
        placeholder="Optimizer OHLCV refresh"
        autocomplete="off"
        :value="store.scheduleName.value"
        @input="store.setScheduleName(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="settings-field">
      <span class="field-label">{{ t('market.repeatEveryHours') }}</span>
      <input
        id="copy-data-schedule-interval"
        type="number"
        min="1"
        max="168"
        step="1"
        :value="store.scheduleInterval.value"
        @input="store.setScheduleInterval(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label class="settings-toggle">
      <input
        id="copy-data-schedule-enabled"
        type="checkbox"
        :checked="store.scheduleEnabled.value"
        @change="store.setScheduleEnabled(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('common.enabled') }}</span>
    </label>
  </div>
  <div class="copy-data-actions">
    <button
      class="btn primary"
      id="btn-copy-data-schedule-save"
      type="button"
      :disabled="store.isSaveBusy.value"
      @click="store.saveSchedule()"
    >{{ store.isEditing.value ? t('market.updateSchedule') : t('market.saveSchedule') }}</button>
    <button
      class="btn secondary"
      id="btn-copy-data-schedule-cancel"
      type="button"
      v-if="store.isEditing.value"
      @click="store.resetEditor()"
    >{{ t('market.cancelEdit') }}</button>
    <span class="note">{{ t('market.firstAutoRunNote') }}</span>
  </div>
</template>
