<script setup lang="ts">
import { provide, type Component } from 'vue';
import { useDashboardStore } from '@/pages/dashboard_editor/stores/dashboardStore';
import { cellContextKey } from '@/pages/dashboard_editor/lib/cellContext';

const props = defineProps<{
  row: number;
  col: number;
  widget: Component;
  class?: string;
}>();

const store = useDashboardStore();
provide(cellContextKey, { row: props.row, col: props.col });
</script>

<template>
  <section class="fixed-widget-cell" :class="props.class">
    <component :is="widget" :key="store.epochOf(row, col)" />
  </section>
</template>

<style scoped>
.fixed-widget-cell {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  background: var(--surface-panel);
  box-shadow: var(--shadow-panel);
}
</style>
