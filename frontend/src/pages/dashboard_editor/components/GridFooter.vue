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
  <div id="grid-footer" class="grid-footer">
    <button
      class="grid-footer-btn"
      :disabled="store.rows <= 1"
      @click="store.setLayout(store.rows - 1, store.cols)"
    >
      {{ dashT('dash.removeRow', '− Row') }}
    </button>
    <button
      class="grid-footer-btn"
      :disabled="store.rows >= 10"
      @click="store.setLayout(store.rows + 1, store.cols)"
    >
      {{ dashT('dash.addRow', '+ Row') }}
    </button>
  </div>
</template>
