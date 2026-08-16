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
    class="content-panel"
    :class="{ 'active-panel': panel.id === active }"
    :hidden="panel.id !== active"
  >
    <slot :panel="panel" />
  </section>
</template>
