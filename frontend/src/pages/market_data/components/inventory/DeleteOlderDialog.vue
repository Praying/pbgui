<script setup lang="ts">
/*
 * M-data-6 — the delete-by-date overlay (legacy #inventory-delete-date-ovl
 * :2861-2891 + renderInventoryOlderPreview :8253-8311 +
 * openInventoryDeleteDatePicker :8120-8132, market_data_main.html). The
 * view model arrives pre-computed (lib/inventoryOlderPreview) — pure props
 * in, events out.
 */
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { fieldLabelClass, noteClass } from '../../lib/uiClasses';
import type { OlderPreviewView } from '../../lib/inventoryOlderPreview';

defineProps<{
  visible: boolean;
  cutoffDay: string;
  view: OlderPreviewView;
}>();

const emit = defineEmits<{
  /** Date input change (:9537-9543) — the raw yyyy-mm-dd value. */
  setCutoff: [value: string];
  /** Confirm click (:9544-9546). */
  delete: [];
  /** ✕ / Cancel (:9547-9552). */
  close: [];
}>();

const { t } = useI18n();

/** Legacy openInventoryDeleteDatePicker (:8120-8132). The ui/ Input exposes
 *  focus/blur/select only, so the picker path resolves the element from the
 *  picker button's own wrap (id lookups would hit stale dialog instances). */
function openPicker(event: MouseEvent): void {
  const wrap = (event.currentTarget as HTMLElement).closest('.inventory-delete-date-input-wrap');
  const el = wrap?.querySelector<HTMLInputElement>('input') ?? null;
  if (!el) return;
  el.focus();
  if (typeof el.showPicker === 'function') {
    try {
      el.showPicker();
      return;
    } catch {
      /* :8127-8129 */
    }
  }
  el.click();
}

/** The former .inventory-delete-date-field input[type="date"] rule — the
 *  native webkit calendar indicator stays invisible (pseudo-element, the
 *  picker button drives the click); the ui/ Input owns the rest. */
const dateInputClass =
  'inventory-delete-date-input pr-[34px] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0';

/** The former .inventory-delete-date-picker-btn rule — the absolute
 *  positioning geometry stays; the chrome is the ghost variant's. */
const pickerBtnClass =
  'inventory-delete-date-picker-btn absolute top-1/2 right-[2px] h-7 w-7 -translate-y-1/2 p-0 text-sm leading-none';
</script>

<template>
  <div
    id="inventory-delete-date-ovl"
    class="fixed inset-0 z-[var(--z-modal)] items-center justify-center bg-page/68 p-5"
    :class="visible ? 'visible flex' : 'hidden'"
    :aria-hidden="visible ? 'false' : 'true'"
  >
    <div class="ovl-panel w-[min(440px,94vw)] overflow-hidden rounded-[12px] border border-border-default bg-page shadow-[0_20px_70px_rgba(5,8,14,0.9)]">
      <div class="ovl-header flex flex-shrink-0 items-center justify-between border-b border-border-subtle bg-card pt-[0.85rem] pr-[1.1rem] pb-[0.85rem] pl-[1.25rem]">
        <div class="ovl-header-title flex items-center gap-[0.5rem] text-md font-bold text-primary">{{ t('market.deleteByDateTitle') }}</div>
        <div class="ovl-header-actions relative z-[3] flex items-center gap-[0.5rem]">
          <Button class="ovl-close text-md leading-none" variant="ghost" size="sm" id="inventory-delete-date-close" type="button" @click="emit('close')">✕</Button>
        </div>
      </div>
      <div class="inventory-delete-date-body grid gap-3 p-3">
        <div class="inventory-delete-date-scope-block grid gap-2">
          <div :class="noteClass" id="inventory-delete-date-scope">{{ view.scopeText }}</div>
          <div
            class="inventory-delete-date-selection grid gap-1"
            id="inventory-delete-date-selection"
            :hidden="!view.showSelection"
          >
            <div class="inventory-delete-date-selection-label text-xs uppercase tracking-[0.04em] text-secondary">{{ t('market.selectedCoins') }}</div>
            <div class="inventory-delete-date-selection-list flex max-h-[min(132px,22vh)] flex-wrap gap-1 overflow-y-auto rounded-lg border border-accent/12 bg-page/42 p-1" id="inventory-delete-date-selection-list">
              <span
                v-for="item in view.selectionItems"
                :key="item"
                class="inventory-delete-date-selection-item inline-flex min-h-6 items-center whitespace-nowrap rounded-full border border-accent/24 bg-accent/12 py-[1px] px-2 text-xs text-primary"
              >{{ item }}</span>
            </div>
          </div>
        </div>
        <label class="inventory-delete-date-field grid gap-1 text-sm">
          <span :class="[fieldLabelClass, 'font-medium']">{{ t('market.deleteOlderThan') }}</span>
          <div class="inventory-delete-date-input-wrap relative">
            <Input
              id="inventory-delete-date-input"
              :class="dateInputClass"
              type="date"
              :model-value="cutoffDay"
              @update:model-value="emit('setCutoff', String($event ?? ''))"
            />
            <Button
              variant="ghost"
              :class="pickerBtnClass"
              id="btn-inventory-delete-date-picker"
              type="button"
              :title="t('market.openCalendar')"
              @click="openPicker"
            >📅</Button>
          </div>
        </label>
        <div class="inventory-preview-list grid gap-1 text-sm text-secondary" id="inventory-delete-date-preview">
          <div :class="noteClass">{{ view.noteText }}</div>
        </div>
        <div class="inventory-delete-date-actions flex flex-wrap justify-end gap-2">
          <Button variant="info" id="btn-inventory-delete-date-cancel" type="button" @click="emit('close')">
            {{ t('common.cancel') }}
          </Button>
          <Button
            variant="primary"
            id="btn-inventory-delete-by-date-confirm"
            type="button"
            :disabled="!view.canDelete"
            @click="emit('delete')"
          >
            {{ t('market.deleteFiles') }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
