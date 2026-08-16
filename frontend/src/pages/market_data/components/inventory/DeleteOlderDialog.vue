<script setup lang="ts">
/*
 * M-data-6 — the delete-by-date overlay (legacy #inventory-delete-date-ovl
 * :2861-2891 + renderInventoryOlderPreview :8253-8311 +
 * openInventoryDeleteDatePicker :8120-8132, market_data_main.html). The
 * view model arrives pre-computed (lib/inventoryOlderPreview) — pure props
 * in, events out.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
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
const input = ref<HTMLInputElement | null>(null);

/** Legacy openInventoryDeleteDatePicker (:8120-8132). */
function openPicker(): void {
  const el = input.value;
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
</script>

<template>
  <div id="inventory-delete-date-ovl" :class="{ visible }" :aria-hidden="visible ? 'false' : 'true'">
    <div class="ovl-panel">
      <div class="ovl-header">
        <div class="ovl-header-title">{{ t('market.deleteByDateTitle') }}</div>
        <div class="ovl-header-actions">
          <button class="ovl-close" id="inventory-delete-date-close" type="button" @click="emit('close')">✕</button>
        </div>
      </div>
      <div class="inventory-delete-date-body">
        <div class="inventory-delete-date-scope-block">
          <div class="note" id="inventory-delete-date-scope">{{ view.scopeText }}</div>
          <div
            class="inventory-delete-date-selection"
            id="inventory-delete-date-selection"
            :hidden="!view.showSelection"
          >
            <div class="inventory-delete-date-selection-label">{{ t('market.selectedCoins') }}</div>
            <div class="inventory-delete-date-selection-list" id="inventory-delete-date-selection-list">
              <span
                v-for="item in view.selectionItems"
                :key="item"
                class="inventory-delete-date-selection-item"
              >{{ item }}</span>
            </div>
          </div>
        </div>
        <label class="inventory-delete-date-field">
          <span class="field-label">{{ t('market.deleteOlderThan') }}</span>
          <div class="inventory-delete-date-input-wrap">
            <input
              id="inventory-delete-date-input"
              ref="input"
              type="date"
              :value="cutoffDay"
              @change="emit('setCutoff', String(($event.target as HTMLInputElement).value || ''))"
            />
            <button
              class="inventory-delete-date-picker-btn"
              id="btn-inventory-delete-date-picker"
              type="button"
              :title="t('market.openCalendar')"
              @click="openPicker"
            >📅</button>
          </div>
        </label>
        <div class="inventory-preview-list" id="inventory-delete-date-preview">
          <div class="note">{{ view.noteText }}</div>
        </div>
        <div class="inventory-delete-date-actions">
          <button class="btn secondary" id="btn-inventory-delete-date-cancel" type="button" @click="emit('close')">
            {{ t('common.cancel') }}
          </button>
          <button
            class="btn primary"
            id="btn-inventory-delete-by-date-confirm"
            type="button"
            :disabled="!view.canDelete"
            @click="emit('delete')"
          >
            {{ t('market.deleteFiles') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
