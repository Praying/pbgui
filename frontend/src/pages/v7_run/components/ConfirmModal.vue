<script setup lang="ts">
/**
 * The shared confirmation modal — the Vue form of the legacy delete
 * (v7_run.html:951-962) and forced-mode (:1039-1050) modals: same
 * modal-overlay/modal-box classes and modal-* ids, the ⚠ instance name in
 * .warn, and a busy state that disables the confirm button and swaps its
 * label ('Deleting…' :971 / 'Syncing…' :1059).
 */
defineProps<{
  title: string;
  warn: string;
  text: string;
  cancelText: string;
  confirmText: string;
  confirmClass: string;
  busy: boolean;
  busyText: string;
}>();

defineEmits<{ cancel: []; confirm: [] }>();
</script>

<template>
  <div class="modal-overlay" id="modal-overlay">
    <div class="modal-box" role="dialog" aria-modal="true">
      <h3>{{ title }}</h3>
      <p class="warn">&#x26A0; {{ warn }}</p>
      <p>{{ text }}</p>
      <div class="modal-btns">
        <button class="modal-btn-cancel" id="modal-cancel" @click="$emit('cancel')">{{ cancelText }}</button>
        <button :class="confirmClass" id="modal-confirm" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? busyText : confirmText }}
        </button>
      </div>
    </div>
  </div>
</template>
