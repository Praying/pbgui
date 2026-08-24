<script setup lang="ts">
/**
 * GridColumn — one of the legacy per-column wrappers (editor:2237-2245):
 * columns render their rows independently so cells in different columns do
 * not share row height.
 */
import { useDashboardStore } from '../stores/dashboardStore';
import GridCell from './GridCell.vue';

defineProps<{
  col: number;
}>();

const store = useDashboardStore();
</script>

<template>
  <div class="editor-grid-col flex min-w-0 flex-1 flex-col gap-[0.75rem]">
    <GridCell v-for="r in store.rows" :key="'grid-cell-' + r + '-' + col" :row="r" :col="col" />
  </div>
</template>
