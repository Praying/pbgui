<script setup lang="ts">
/*
 * Scaffold-only stub for the panels M-data-2..7 will fill (the dashboard
 * editor's EmptyCell pattern). Removed as each panel lands.
 */
import { useI18n } from 'vue-i18n';
import type { PanelDef } from '../types';

defineProps<{
  panel: PanelDef;
  /** Migration task that replaces this placeholder (report hint only). */
  task: string;
}>();

const { t } = useI18n();
</script>

<template>
  <article class="panel-card panel-placeholder">
    <div class="panel-placeholder-name">{{ t(panel.labelKey) }}</div>
    <div class="panel-placeholder-hint">#{{ panel.id }} · {{ task }}</div>
  </article>
</template>
