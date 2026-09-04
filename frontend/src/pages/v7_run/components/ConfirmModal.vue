<script setup lang="ts">
/**
 * The shared confirmation modal — the Vue form of the legacy delete
 * (v7_run.html:951-962) and forced-mode (:1039-1050) modals: the ⚠ instance
 * name in .warn, and a busy state that disables the confirm button and swaps
 * its label ('Deleting…' :971 / 'Syncing…' :1059). Now on the shared Modal
 * primitive — Escape, focus trap and scroll lock come from reka-ui.
 */
import { PhWarning } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Modal } from '@/shared/components/ui/modal';

defineProps<{
  title: string;
  warn: string;
  text: string;
  cancelText: string;
  confirmText: string;
  /** ui-migration: the legacy confirmClass css string is a Button variant. */
  confirmVariant: 'danger' | 'warning' | 'success' | 'info';
  busy: boolean;
  busyText: string;
}>();

const emit = defineEmits<{ cancel: []; confirm: [] }>();

const { t } = useI18n();
</script>

<template>
  <Modal
    open
    :title="title"
    panel-class="w-[min(460px,94vw)]"
    :close-label="t('common.close')"
    @cancel="emit('cancel')"
  >
    <div class="text-center">
      <p class="font-semibold text-warning"><PbIcon :icon="PhWarning" :size="14" class="mr-1 align-[-2px] inline-block" />{{ warn }}</p>
      <p class="mb-2 text-base text-secondary">{{ text }}</p>
    </div>
    <template #footer>
      <Button size="lg" id="modal-cancel" type="button" @click="emit('cancel')">{{ cancelText }}</Button>
      <Button :variant="confirmVariant" size="lg" id="modal-confirm" type="button" :disabled="busy" @click="emit('confirm')">
        {{ busy ? busyText : confirmText }}
      </Button>
    </template>
  </Modal>
</template>
