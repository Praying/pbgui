<script setup lang="ts">
/**
 * The shared confirmation modal — the Vue form of the legacy delete
 * (v7_run.html:951-962) and forced-mode (:1039-1050) modals: same
 * modal-overlay/modal-box classes and modal-* ids, the ⚠ instance name in
 * .warn, and a busy state that disables the confirm button and swaps its
 * label ('Deleting…' :971 / 'Syncing…' :1059).
 */
import { Button } from '@/shared/components/ui/button';

defineProps<{
  title: string;
  warn: string;
  text: string;
  cancelText: string;
  confirmText: string;
  /** ui-migration: the legacy confirmClass css string is a Button variant. */
  confirmVariant: 'danger' | 'warning' | 'success';
  busy: boolean;
  busyText: string;
}>();

defineEmits<{ cancel: []; confirm: [] }>();
</script>

<template>
  <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop" id="modal-overlay">
    <div class="min-w-[340px] max-w-[460px] rounded-lg border border-border-default bg-panel px-7 py-5 text-center" role="dialog" aria-modal="true">
      <h3 class="mb-3 text-lg">{{ title }}</h3>
      <p class="font-semibold text-warning">&#x26A0; {{ warn }}</p>
      <p class="mb-5 text-base text-secondary">{{ text }}</p>
      <div class="flex justify-center gap-2">
        <Button size="lg" id="modal-cancel" type="button" @click="$emit('cancel')">{{ cancelText }}</Button>
        <Button :variant="confirmVariant" size="lg" id="modal-confirm" type="button" :disabled="busy" @click="$emit('confirm')">
          {{ busy ? busyText : confirmText }}
        </Button>
      </div>
    </div>
  </div>
</template>
