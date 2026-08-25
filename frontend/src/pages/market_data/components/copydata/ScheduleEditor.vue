<script setup lang="ts">
/*
 * The schedule editor form — legacy .copy-data-schedule-form + actions
 * (market_data_main.html:3466-3484): name (80 chars), interval hours 1-168,
 * enabled toggle, save/cancel-edit pair. Edit state and the save button
 * label flip come from the store (:5155-5182, :5201).
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { fieldLabelClass, noteClass, settingsFieldClass, settingsToggleClass } from '../../lib/uiClasses';
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
      <Input
        id="copy-data-schedule-name"
        type="text"
        maxlength="80"
        placeholder="Optimizer OHLCV refresh"
        autocomplete="off"
        :model-value="store.scheduleName.value"
        @update:model-value="store.setScheduleName(String($event ?? ''))"
      />
    </label>
    <label :class="settingsFieldClass">
      <span :class="fieldLabelClass">{{ t('market.repeatEveryHours') }}</span>
      <Input
        id="copy-data-schedule-interval"
        type="number"
        min="1"
        max="168"
        step="1"
        :model-value="store.scheduleInterval.value"
        @update:model-value="store.setScheduleInterval(String($event ?? ''))"
      />
    </label>
    <label :class="[settingsToggleClass, 'cursor-pointer']">
      <Checkbox
        id="copy-data-schedule-enabled"
        :model-value="store.scheduleEnabled.value"
        @update:model-value="store.setScheduleEnabled($event === true)"
      />
      <span>{{ t('common.enabled') }}</span>
    </label>
  </div>
  <div class="copy-data-actions flex flex-wrap items-center gap-3">
    <Button
      variant="primary"
      id="btn-copy-data-schedule-save"
      type="button"
      :disabled="store.isSaveBusy.value"
      @click="store.saveSchedule()"
    >{{ store.isEditing.value ? t('market.updateSchedule') : t('market.saveSchedule') }}</Button>
    <Button
      variant="info"
      id="btn-copy-data-schedule-cancel"
      type="button"
      v-if="store.isEditing.value"
      @click="store.resetEditor()"
    >{{ t('market.cancelEdit') }}</Button>
    <span :class="noteClass">{{ t('market.firstAutoRunNote') }}</span>
  </div>
</template>
