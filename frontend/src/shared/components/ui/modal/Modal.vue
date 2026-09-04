<script setup lang="ts">
/**
 * Modal — the shared dialog primitive on reka-ui Dialog.
 *
 * Replaces the hand-rolled overlay panels scattered across pages: gets
 * Escape-to-close, focus trapping + restore, scroll lock, aria-modal and
 * labelled-by wiring from reka-ui instead of per-modal keydown listeners.
 *
 * Visuals match the existing `ovl-panel` language (market_data ConfirmDialog)
 * so consumers can swap their backdrop/panel markup for this component
 * without a look change. The default width is the 520px confirm size;
 * override via `panel-class` for wider dialogs.
 */
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { PhX } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';

interface ModalProps {
  open: boolean;
  title: string;
  /** Extra classes for the panel — width/max-height overrides live here. */
  panelClass?: string;
  /** Disable Esc/backdrop close for flows that must be answered (rare). */
  dismissable?: boolean;
  /** Close on backdrop click/✕ independently of Esc (legacy modals that
   *  intentionally never closed on backdrop pass false here). */
  backdropClose?: boolean;
  /** Already-translated aria-label for the ✕ button (ui primitives stay i18n-free). */
  closeLabel?: string;
}

const props = withDefaults(defineProps<ModalProps>(), {
  panelClass: 'w-[min(520px,94vw)]',
  dismissable: true,
  backdropClose: true,
  closeLabel: 'Close',
});

const emit = defineEmits<{ 'update:open': [open: boolean]; cancel: [] }>();

function onOpenChange(open: boolean): void {
  emit('update:open', open);
  if (!open) emit('cancel');
}
</script>

<template>
  <DialogRoot :open="props.open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-[var(--z-modal)] bg-page/72" />
      <DialogContent
        :class="props.panelClass"
        aria-modal="true"
        class="fixed top-1/2 left-1/2 z-[var(--z-modal)] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[12px] border border-border-default bg-page shadow-[0_20px_70px_rgba(5,8,14,0.9)] focus:outline-none"
        @escape-key-down="!props.dismissable && $event.preventDefault()"
        @interact-outside="!(props.dismissable && props.backdropClose) && $event.preventDefault()"
        @pointer-down-outside="!(props.dismissable && props.backdropClose) && $event.preventDefault()"
      >
        <div class="flex flex-shrink-0 items-center justify-between gap-2 border-b border-border-subtle bg-card px-5 py-3.5">
          <DialogTitle class="text-md font-bold text-primary">
            <slot name="title">{{ props.title }}</slot>
          </DialogTitle>
          <Button
            v-if="props.dismissable"
            variant="ghost"
            size="sm"
            type="button"
            :aria-label="props.closeLabel"
            @click="onOpenChange(false)"
          >
            <PbIcon :icon="PhX" :size="16" />
          </Button>
        </div>
        <div class="grid gap-3 overflow-y-auto p-5">
          <slot />
          <div v-if="$slots.footer" class="flex flex-wrap justify-end gap-2">
            <slot name="footer" />
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
