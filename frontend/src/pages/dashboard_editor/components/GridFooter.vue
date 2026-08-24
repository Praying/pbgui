<script setup lang="ts">
/**
 * GridFooter — port of the add/remove row footer (dashboard_editor.html:
 * 483-485, 2562-2564, 2633-2634): ±1 row clamped to 1..10, buttons disabled
 * at the bounds. Legacy buttons carried `&#8722;&nbsp;Row` innerHTML with a
 * data-i18n override — the visible label IS the translation, so the Vue port
 * renders the translated string directly.
 */
import { useDashboardStore } from '../stores/dashboardStore';
import { dashT } from '../lib/i18n';

const store = useDashboardStore();
</script>

<template>
  <div id="grid-footer" class="grid-footer mt-[0.75rem] flex justify-center gap-[0.5rem]">
    <button
      class="grid-footer-btn cursor-pointer rounded-sm border border-secondary bg-border-default px-[0.9rem] py-[0.3rem] text-sm text-secondary [transition:border-color_.15s,color_.15s] enabled:hover:border-accent-soft enabled:hover:text-primary disabled:cursor-default disabled:opacity-30"
      :disabled="store.rows <= 1"
      @click="store.setLayout(store.rows - 1, store.cols)"
    >
      {{ dashT('dash.removeRow', '− Row') }}
    </button>
    <button
      class="grid-footer-btn cursor-pointer rounded-sm border border-secondary bg-border-default px-[0.9rem] py-[0.3rem] text-sm text-secondary [transition:border-color_.15s,color_.15s] enabled:hover:border-accent-soft enabled:hover:text-primary disabled:cursor-default disabled:opacity-30"
      :disabled="store.rows >= 10"
      @click="store.setLayout(store.rows + 1, store.cols)"
    >
      {{ dashT('dash.addRow', '+ Row') }}
    </button>
  </div>
</template>
