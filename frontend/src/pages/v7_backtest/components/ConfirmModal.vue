<script setup lang="ts">
/**
 * ConfirmModal — the showModal-based confirm dialogs of the archive
 * family (deleteArchive :9014-9026, deleteSelectedArchiveResults
 * :6067-6080, remove previews :6141-6155, deleteArchiveRetestSchedule
 * :9218-9225, deleteArchiveOptimizeConfig :9412-9420) as declarative
 * markup — no string-built innerHTML.
 */
import { useI18n } from 'vue-i18n';

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
  <div v-if="open" id="modal-root" :data-test="testId">
    <div class="modal-box">
      <h3>{{ title }}</h3>
      <div class="modal-body"><slot /></div>
      <div class="modal-actions">
        <button type="button" class="modal-btn" @click="emit('cancel')">{{ t('common.cancel') }}</button>
        <button type="button" class="modal-btn" :class="danger ? 'modal-btn-danger' : 'modal-btn-primary'" :data-test="testId + '-ok'" @click="emit('confirm')">
          {{ confirmLabel ?? t('common.ok') }}
        </button>
      </div>
    </div>
  </div>
</template>
