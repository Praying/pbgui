<script setup lang="ts">
/*
 * The panel-switching mechanism (legacy setActivePanel DOM slice,
 * market_data_main.html:9038-9043): one section per registry panel, the
 * hidden attribute toggled per panel, active-panel class on the active one.
 * Panel bodies arrive as the scoped default slot — M-data-2..7 replace the
 * placeholders with the real panel components.
 */
import type { PanelDef, PanelId } from '../types';

defineProps<{
  panels: readonly PanelDef[];
  active: PanelId;
}>();
</script>

<template>
  <section
    v-for="panel in panels"
    :id="panel.id"
    :key="panel.id"
    class="content-panel flex flex-1 min-h-0 flex-col gap-5 overflow-y-auto"
    :class="[panel.id === active ? 'active-panel' : '', panel.id === 'status-panel' ? 'pr-0' : 'pr-1']"
    :hidden="panel.id !== active"
  >
    <slot :panel="panel" />
  </section>
</template>
