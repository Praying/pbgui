<script setup lang="ts">
/**
 * Panel shell — the backtest_shell.js sidebar chrome (create :82-161 +
 * adopt.selectPanel :194-227): section nav with the queue badge, one
 * ctx-actions block per panel (only the active one visible) and the
 * shared resize handle. The editor sidebar (setEditorMode :211-222)
 * mounts here in M-v7-9 via the `editor` slot.
 */
import { useI18n } from 'vue-i18n';
import type { BacktestPanel, NavItem } from '../types';

defineProps<{
  items: NavItem[];
  /** The active view panel (nav highlight follows the mapped panel, :1447). */
  active: BacktestPanel;
  queueBadge?: string;
}>();
const emit = defineEmits<{ select: [panel: BacktestPanel] }>();

const { t } = useI18n();
</script>

<template>
  <aside id="sidebar">
    <div id="sidebar-inner">
      <button
        v-for="item in items"
        :key="item.panel"
        type="button"
        class="sb-section"
        :class="{ active: item.panel === active }"
        :data-panel="item.panel"
        @click="emit('select', item.panel)"
      >
        <span class="sb-icon">{{ item.icon }}</span> <span>{{ t(item.labelKey) }}</span>
        <span v-if="item.badge" id="queue-count-badge" style="margin-left: auto; font-size: var(--fs-xs); color: var(--text-dim)">{{ queueBadge }}</span>
      </button>

      <hr class="sb-sep" />

      <div
        v-for="item in items"
        :key="'ctx-' + item.panel"
        :id="'ctx-' + item.panel"
        class="ctx-actions"
        :style="{ display: item.panel === active ? '' : 'none' }"
      >
        <slot :name="'ctx-' + item.panel" />
      </div>

      <!-- M-v7-9: the configs editor sidebar replaces the nav (setEditorMode) -->
      <slot name="editor" />
    </div>
    <div id="sidebar-resize"></div>
  </aside>
</template>
