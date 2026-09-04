<script setup lang="ts">
/*
 * Toast container + alert modal (:1044-1056 markup, showToast :2270-2299,
 * closeAlertModal :2301-2303) — success/info toasts bottom-right, error and
 * warning messages open the modal instead. The alert panel now sits on the
 * shared Modal primitive (Escape + focus handling for free).
 */
import { useI18n } from 'vue-i18n';
import { injectToasts } from '../composables/useToasts';
import { Button } from '@/shared/components/ui/button';
import { Modal } from '@/shared/components/ui/modal';

const toasts = injectToasts();
const { t } = useI18n();

/* Kind → Tailwind utility mappings (the former .toast.success/.info fills and
   the .alert-modal.<kind> rails). Each branch returns the complete colour set
   so the static layout utilities never fight a dynamic colour. */
function toastClass(kind: 'success' | 'info'): string {
  return kind === 'success' ? 'bg-success text-primary' : 'bg-accent-deep text-primary';
}

function alertBoxClass(kind: 'error' | 'warning' | 'success' | 'info'): string {
  switch (kind) {
    case 'error': return 'border-l-4 border-l-danger';
    case 'warning': return 'border-l-4 border-l-warning-deep';
    case 'success': return 'border-l-4 border-l-success-deep';
    default: return 'border-l-4 border-l-accent';
  }
}

function alertTitleClass(kind: 'error' | 'warning' | 'success' | 'info'): string {
  switch (kind) {
    case 'error': return 'text-danger';
    case 'warning': return 'text-warning';
    case 'success': return 'text-success-soft';
    default: return 'text-accent';
  }
}
</script>

<template>
  <div id="toastContainer">
    <div
      v-for="toast in toasts.toasts.value"
      :key="toast.id"
      class="fixed bottom-5 right-5 z-[var(--z-toast)] max-w-[400px] rounded-md px-5 py-3 text-base opacity-100 transition-opacity duration-300"
      :class="toastClass(toast.kind)"
    >
      {{ toast.message }}
    </div>
  </div>

  <Modal
    :open="toasts.alert.value.visible"
    :title="toasts.alert.value.title"
    panel-class="w-[min(500px,90vw)]"
    :close-label="t('common.close')"
    @cancel="toasts.closeAlert()"
  >
    <template #title>
      <span id="alertModalTitle" class="text-md font-bold" :class="alertTitleClass(toasts.alert.value.kind)">{{ toasts.alert.value.title }}</span>
    </template>
    <div
      id="alertModalBody"
      class="rounded-md border-l-4 px-3 py-2 text-sm leading-[1.5] break-words text-secondary"
      :class="alertBoxClass(toasts.alert.value.kind)"
    >
      {{ toasts.alert.value.message }}
    </div>
    <template #footer>
      <Button id="alertModalOk" type="button" variant="primary" class="min-w-[80px]" @click="toasts.closeAlert()">{{ t('common.ok') }}</Button>
    </template>
  </Modal>
</template>
