<script setup lang="ts">
/**
 * EditorGrid — the grid container (legacy #editor-grid, editor:480-481,
 * 2231-2235): one column wrapper per column, `cols-N` class for the legacy
 * CSS. Imports styles/editor.css — the verbatim port of the legacy editor
 * <style> block (D-3's App composes this; D-4+ widgets import widgets.css
 * from D-1).
 */
import { useDashboardStore } from '../stores/dashboardStore';
import GridColumn from './GridColumn.vue';
import '../styles/editor.css';

const store = useDashboardStore();
</script>

<template>
  <div id="editor-grid" class="editor-grid" :class="'cols-' + store.cols">
    <GridColumn v-for="c in store.cols" :key="'grid-col-' + c" :col="c" />
  </div>
</template>
