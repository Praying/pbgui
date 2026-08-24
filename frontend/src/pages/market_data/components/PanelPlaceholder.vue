<script setup lang="ts">
/*
 * Scaffold-only stub for the panels M-data-2..7 will fill (the dashboard
 * editor's EmptyCell pattern). Removed as each panel lands.
 */
import { useI18n } from 'vue-i18n';
import { panelCardClass } from '../lib/uiClasses';
import type { PanelDef } from '../types';

defineProps<{
  panel: PanelDef;
  /** Migration task that replaces this placeholder (report hint only). */
  task: string;
}>();

const { t } = useI18n();
</script>

<template>
  <article :class="panelCardClass" class="panel-placeholder flex flex-none flex-col items-center gap-2 my-auto text-center text-muted">
    <div class="panel-placeholder-name text-lg font-bold">{{ t(panel.labelKey) }}</div>
    <div class="panel-placeholder-hint text-sm text-secondary">#{{ panel.id }} · {{ task }}</div>
  </article>
</template>
