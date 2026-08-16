<script setup lang="ts">
/*
 * The shared confirm overlay — legacy #confirm-ovl markup
 * (market_data_main.html:2893-2915) driven by useConfirmDialog
 * (showConfirmDialog/closeConfirmDialog :8161-8215). Rendered once at the
 * app root; M-data-5's integrity destructive flows and M-data-6's inventory
 * deletions share it.
 *
 * The legacy ✕ close button (:2898) had no click binding (dead) — it now
 * cancels like the Cancel button (documented deviation).
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ConfirmDialogController } from '../composables/useConfirmDialog';

const props = defineProps<{
  dialog: ConfirmDialogController;
}>();

const { t } = useI18n();

function onDocumentKeydown(event: KeyboardEvent): void {
  props.dialog.handleKeydown(event); // :9588-9599
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onDocumentKeydown);
});

// Legacy focus hand-off (:8213 open → accept, :8151-8156 close → opener).
watch(
  () => props.dialog.visible.value,
  (visible) => {
    if (!visible) return;
    const accept = document.getElementById('btn-confirm-accept');
    if (accept instanceof HTMLElement) accept.focus();
  },
  { flush: 'post' }
);
</script>

<template>
  <div
    id="confirm-ovl"
    :class="{ visible: dialog.visible.value }"
    :aria-hidden="dialog.visible.value ? 'false' : 'true'"
  >
    <div class="ovl-panel" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="ovl-header">
        <div class="ovl-header-title" id="confirm-title">{{ dialog.state.value.title }}</div>
        <div class="ovl-header-actions">
          <button class="ovl-close" id="confirm-close" type="button" aria-label="close" @click="dialog.cancel()">✕</button>
        </div>
      </div>
      <div class="confirm-body">
        <div class="confirm-message" id="confirm-message">{{ dialog.state.value.message }}</div>
        <div class="confirm-detail" id="confirm-detail" :hidden="!dialog.state.value.detail">
          {{ dialog.state.value.detail }}
        </div>
        <div class="confirm-list-wrap" id="confirm-list-wrap" :hidden="!dialog.state.value.items.length">
          <div class="confirm-list-label" id="confirm-list-label">{{ dialog.state.value.listLabel }}</div>
          <div class="confirm-list" id="confirm-list">
            <span v-for="item in dialog.state.value.items" :key="item" class="confirm-list-item">{{ item }}</span>
          </div>
        </div>
        <div class="confirm-warning" id="confirm-warning">{{ t('market.actionCannotBeUndone') }}</div>
        <div class="confirm-actions">
          <button class="btn secondary" id="btn-confirm-cancel" type="button" @click="dialog.cancel()">
            {{ t('common.cancel') }}
          </button>
          <button class="btn primary" id="btn-confirm-accept" type="button" @click="dialog.accept()">
            {{ dialog.state.value.confirmText || t('common.confirm') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
