<script setup lang="ts">
/**
 * Action toolbar — converged-navigation layout. Panel switching moved to the
 * workbench rail (AppShell `sections`); this strip carries only the active
 * panel's contextual actions, or the editor actions while a config is open.
 * (Was: the backtest_shell.js sidebar chrome, create :82-161.)
 */
import type { BacktestPanel, NavItem } from '../types';

defineProps<{
  items: NavItem[];
  /** The active view panel — selects which ctx slot is visible. */
  active: BacktestPanel;
  /** While a config editor session is open, the editor slot replaces the
      panel actions (the editor has its own Home button to come back). */
  editorOpen: boolean;
}>();
</script>

<template>
  <div class="page-toolbar" role="toolbar">
    <slot v-if="editorOpen" name="editor" />
    <template v-else>
      <div
        v-for="item in items"
        :key="'ctx-' + item.panel"
        :id="'ctx-' + item.panel"
        class="ctx-actions"
        :style="{ display: item.panel === active ? '' : 'none' }"
      >
        <slot :name="'ctx-' + item.panel" />
      </div>
    </template>
  </div>
</template>
