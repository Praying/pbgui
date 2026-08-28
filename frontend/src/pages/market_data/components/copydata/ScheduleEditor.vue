<script setup lang="ts">
/*
 * The schedule editor form — legacy .copy-data-schedule-form + actions
 * (market_data_main.html:3466-3484): name (80 chars), interval hours 1-168,
 * enabled toggle, save/cancel-edit pair. Edit state and the save button
 * label flip come from the store (:5155-5182, :5201).
 */
import { useI18n } from 'vue-i18n';
import { PhCheck, PhPencilSimple, PhX } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import PbIcon from '@/shared/components/PbIcon.vue';
import { fieldLabelClass, noteClass, settingsFieldClass, settingsToggleClass } from '../../lib/uiClasses';
import type { UseCopyData } from '../../composables/useCopyData';

defineProps<{
  store: UseCopyData;
}>();

const { t } = useI18n();
</script>

<template>
  <!-- Editing context bar — without it the save button's update-vs-create
       flip is invisible until the row list refreshes. -->
  <div
    v-if="store.isEditing.value"
    class="copy-data-editing-note flex items-center gap-2 rounded-[10px] border border-accent/24 bg-accent/8 px-3 py-2 text-sm text-primary"
  >
    <PbIcon :icon="PhPencilSimple" :size="16" class="shrink-0 text-accent" />
    <span>{{ t('market.editingScheduleNote', { name: store.scheduleName.value }) }}</span>
  </div>
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
      :loading="store.isSaveBusy.value"
      @click="store.saveSchedule()"
    ><PbIcon v-if="!store.isSaveBusy.value" :icon="PhCheck" :size="14" /> {{ store.isEditing.value ? t('market.updateSchedule') : t('market.saveSchedule') }}</Button>
    <Button
      variant="ghost"
      id="btn-copy-data-schedule-cancel"
      type="button"
      v-if="store.isEditing.value"
      @click="store.resetEditor()"
    ><PbIcon :icon="PhX" :size="14" /> {{ t('market.cancelEdit') }}</Button>
    <span :class="noteClass">{{ t('market.firstAutoRunNote') }}</span>
  </div>
</template>
