<script setup lang="ts">
/**
 * ConfirmModal — the showModal-based confirm dialogs of the archive
 * family (deleteArchive :9014-9026, deleteSelectedArchiveResults
 * :6067-6080, remove previews :6141-6155, deleteArchiveRetestSchedule
 * :9218-9225, deleteArchiveOptimizeConfig :9412-9420) as declarative
 * markup — no string-built innerHTML.
 */
import { useI18n } from 'vue-i18n';
import { modalBackdropClass, modalBoxClass, modalBtnClass } from '../lib/uiClasses';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    confirmLabel?: string;
    danger?: boolean;
    testId?: string;
  }>(),
  { confirmLabel: undefined, danger: false, testId: 'confirm-modal' }
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
const { t } = useI18n();
</script>

<template>
  <div v-if="open" id="modal-root" :class="modalBackdropClass" :data-test="testId">
    <div :class="modalBoxClass">
      <h3>{{ title }}</h3>
      <div class="min-h-0 flex-1 overflow-auto"><slot /></div>
      <div class="mt-5 flex justify-end gap-2">
        <button type="button" :class="modalBtnClass()" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="button" :class="modalBtnClass(danger ? 'danger' : 'primary')" :data-test="testId + '-ok'" @click="emit('confirm')">
          {{ confirmLabel ?? t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>
