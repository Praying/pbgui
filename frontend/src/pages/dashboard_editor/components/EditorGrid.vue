<script setup lang="ts">
/**
 * EditorGrid — the grid container (legacy #editor-grid, editor:480-481,
 * 2231-2235): one column wrapper per column, `cols-N` class for the legacy
 * CSS. The old styles/editor.css was deleted at the Tailwind migration —
 * the grid layout is template utilities now; `cols-N` stays as an inert
 * anchor (the legacy .editor-grid.cols-* rules were empty).
 */
import { useDashboardStore } from '../stores/dashboardStore';
import GridColumn from './GridColumn.vue';

const store = useDashboardStore();
</script>

<template>
  <div id="editor-grid" class="editor-grid flex items-start gap-[0.75rem]" :class="'cols-' + store.cols">
    <GridColumn v-for="c in store.cols" :key="'grid-col-' + c" :col="c" />
  </div>
</template>
