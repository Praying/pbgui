<script setup lang="ts">
/*
 * Toast container + alert modal (:1044-1056 markup, showToast :2270-2299,
 * closeAlertModal :2301-2303) — success/info toasts bottom-right, error and
 * warning messages open the modal instead.
 */
import { injectToasts } from '../composables/useToasts';

const toasts = injectToasts();

/* Kind → Tailwind utility mappings (the former .toast.success/.info fills and
   the .alert-modal.<kind> rails). Each branch returns the complete colour set
   so the static layout utilities never fight a dynamic colour. */
function toastClass(kind: 'success' | 'info'): string {
  return kind === 'success' ? 'bg-success text-[#f2f5fb]' : 'bg-accent-deep text-[#f2f5fb]';
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
      class="fixed bottom-5 right-5 z-[2000] max-w-[400px] rounded-md px-5 py-3 text-base opacity-100 transition-opacity duration-300"
      :class="toastClass(toast.kind)"
    >
      {{ toast.message }}
    </div>
  </div>

  <div id="alertModalOverlay" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop" v-show="toasts.alert.value.visible">
    <div
      id="alertModalBox"
      class="alert-modal flex w-[90%] max-w-[500px] flex-col gap-3 rounded-lg border border-border-default bg-panel px-8 py-7 shadow-modal"
      :class="alertBoxClass(toasts.alert.value.kind)"
    >
      <div id="alertModalTitle" class="text-md font-bold" :class="alertTitleClass(toasts.alert.value.kind)">{{ toasts.alert.value.title }}</div>
      <div id="alertModalBody" class="text-sm leading-[1.5] text-secondary break-words">{{ toasts.alert.value.message }}</div>
      <div class="flex justify-end">
        <button class="btn pbgui-btn btn-primary min-w-[80px]" @click="toasts.closeAlert()">OK</button>
      </div>
    </div>
  </div>
</template>
