<script setup lang="ts">
/*
 * The schedule editor form — legacy .copy-data-schedule-form + actions
 * (market_data_main.html:3466-3484): name (80 chars), interval hours 1-168,
 * enabled toggle, save/cancel-edit pair. Edit state and the save button
 * label flip come from the store (:5155-5182, :5201).
 */
import { useI18n } from 'vue-i18n';
import { btnClass, fieldLabelClass, inputClass, noteClass, settingsFieldClass, settingsToggleClass } from '../../lib/uiClasses';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();
</script>

<template>
  <div class="copy-data-schedule-form grid items-end gap-3 grid-cols-[minmax(220px,2fr)_minmax(140px,1fr)_auto] max-[900px]:grid-cols-1">
    <label :class="settingsFieldClass">
      <span :class="fieldLabelClass">{{ t('market.scheduleName') }}</span>
      <input
        id="copy-data-schedule-name"
        :class="inputClass"
        type="text"
        maxlength="80"
        placeholder="Optimizer OHLCV refresh"
        autocomplete="off"
        :value="store.scheduleName.value"
        @input="store.setScheduleName(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label :class="settingsFieldClass">
      <span :class="fieldLabelClass">{{ t('market.repeatEveryHours') }}</span>
      <input
        id="copy-data-schedule-interval"
        :class="inputClass"
        type="number"
        min="1"
        max="168"
        step="1"
        :value="store.scheduleInterval.value"
        @input="store.setScheduleInterval(($event.target as HTMLInputElement).value)"
      />
    </label>
    <label :class="settingsToggleClass">
      <input
        id="copy-data-schedule-enabled"
        class="h-4 w-4 m-0"
        type="checkbox"
        :checked="store.scheduleEnabled.value"
        @change="store.setScheduleEnabled(($event.target as HTMLInputElement).checked)"
      />
      <span>{{ t('common.enabled') }}</span>
    </label>
  </div>
  <div class="copy-data-actions flex flex-wrap items-center gap-3">
    <button
      :class="btnClass('primary')"
      id="btn-copy-data-schedule-save"
      type="button"
      :disabled="store.isSaveBusy.value"
      @click="store.saveSchedule()"
    >{{ store.isEditing.value ? t('market.updateSchedule') : t('market.saveSchedule') }}</button>
    <button
      :class="btnClass('secondary')"
      id="btn-copy-data-schedule-cancel"
      type="button"
      v-if="store.isEditing.value"
      @click="store.resetEditor()"
    >{{ t('market.cancelEdit') }}</button>
    <span :class="noteClass">{{ t('market.firstAutoRunNote') }}</span>
  </div>
</template>
