<script setup lang="ts">
/*
 * M-data-6 — a Plotly plot host (legacy #inventory-overview-plot /
 * #inventory-minute-plot, market_data_main.html:3567/:3570). The store
 * owns the figure pipeline (useInventoryHeatmap); this component only
 * registers its host element so applyPlotlyFigure/clearPlotlyTarget can
 * reach it (lib/heatmapFigure — purge-before-replace contract, recon R6).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { InventoryPlotKey } from '../../composables/useInventoryHeatmap';

const props = defineProps<{
  plotKey: InventoryPlotKey;
  /** Store.registerPlot — (key, el) on mount, (key, null) on unmount. */
  register: (key: InventoryPlotKey, el: HTMLElement | null) => void;
  id: string;
}>();

const el = ref<HTMLElement | null>(null);

onMounted(() => {
  if (el.value) props.register(props.plotKey, el.value);
});

onBeforeUnmount(() => {
  props.register(props.plotKey, null);
});
</script>

<template>
  <div :id="id" ref="el" class="inventory-plot"></div>
</template>
