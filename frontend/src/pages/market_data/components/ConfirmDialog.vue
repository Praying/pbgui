<script setup lang="ts">
/*
 * The shared confirm overlay — legacy #confirm-ovl markup
 * (market_data_main.html:2893-2915) driven by useConfirmDialog
 * (showConfirmDialog/closeConfirmDialog :8161-8215). Rendered once at the
 * app root; M-data-5's integrity destructive flows and M-data-6's inventory
 * deletions share it. The ✕ close button cancels like legacy (:9553-9555).
 */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { PhX } from '@phosphor-icons/vue';
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
    class="fixed inset-0 z-[var(--z-modal)] items-center justify-center bg-page/72 p-5"
    :class="dialog.visible.value ? 'visible flex' : 'hidden'"
    :aria-hidden="dialog.visible.value ? 'false' : 'true'"
  >
    <div class="ovl-panel w-[min(520px,94vw)] overflow-hidden rounded-[12px] border border-border-default bg-page shadow-[0_20px_70px_rgba(5,8,14,0.9)]" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div class="ovl-header flex flex-shrink-0 items-center justify-between border-b border-border-subtle bg-card pt-[0.85rem] pr-[1.1rem] pb-[0.85rem] pl-[1.25rem]">
        <div class="ovl-header-title flex items-center gap-[0.5rem] text-md font-bold text-primary" id="confirm-title">{{ dialog.state.value.title }}</div>
        <div class="ovl-header-actions relative z-[3] flex items-center gap-[0.5rem]">
          <Button class="ovl-close text-md leading-none" variant="ghost" size="sm" id="confirm-close" type="button" :aria-label="t('common.close')" @click="dialog.cancel()"><PbIcon :icon="PhX" :size="16" /></Button>
        </div>
      </div>
      <div class="confirm-body grid gap-3 p-3">
        <div class="confirm-message text-base leading-[1.5] text-primary" id="confirm-message">{{ dialog.state.value.message }}</div>
        <div class="confirm-detail text-sm leading-[1.45] text-secondary" id="confirm-detail" :hidden="!dialog.state.value.detail">
          {{ dialog.state.value.detail }}
        </div>
        <div class="confirm-list-wrap grid gap-1" id="confirm-list-wrap" :hidden="!dialog.state.value.items.length">
          <div class="confirm-list-label text-xs uppercase tracking-[0.04em] text-secondary" id="confirm-list-label">{{ dialog.state.value.listLabel }}</div>
          <div class="confirm-list flex max-h-[min(140px,24dvh)] flex-wrap gap-1 overflow-y-auto rounded-lg border border-accent/12 bg-page/42 p-1" id="confirm-list">
            <span v-for="item in dialog.state.value.items" :key="item" class="confirm-list-item inline-flex min-h-6 items-center whitespace-nowrap rounded-full border border-accent/24 bg-accent/12 py-[1px] px-2 text-xs text-primary">{{ item }}</span>
          </div>
        </div>
        <div class="confirm-warning text-sm leading-[1.45] text-warning" id="confirm-warning">{{ t('market.actionCannotBeUndone') }}</div>
        <div class="confirm-actions flex flex-wrap justify-end gap-2">
          <Button variant="info" id="btn-confirm-cancel" type="button" @click="dialog.cancel()">
            {{ t('common.cancel') }}
          </Button>
          <Button variant="primary" id="btn-confirm-accept" type="button" @click="dialog.accept()">
            {{ dialog.state.value.confirmText || t('common.confirm') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
