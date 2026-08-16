<script setup lang="ts">
/*
 * Sidebar toolbar (legacy #sidebar-sticky/#sidebar-toolbar,
 * market_data_main.html:2918-2963) rendered from the sectionButtons registry
 * (:3674-3682). DOM order is verbatim: settings/status/inventory/integrity
 * buttons, the best-1m shortcut link at best1m's registry slot (:2946), the
 * copy-data button, the l2books shortcut (:2948), the activity button.
 *
 * M-data-2 wiring: the two shortcuts carry a best-1m section mode —
 * 'build' (:9112-9115) and 'download' (:9117-9120) — emitted on the
 * `shortcut` event for App's openBest1mPanel (:7687-7691). Their active/
 * aria-current state and the l2books visibility come from
 * computeSidebarShortcutState (:7427-7446, :7415-7425).
 *
 * NOT PORTED (documented):
 *  - #sidebar-resize handle (:2962) — silent no-op in legacy (sidebar_resize.js
 *    is never included, guard :9748-9755); recon §0 says do not port as-is.
 *  - The inventory/settings subsection navs and sidebar action blocks
 *    (:2929-2945, :2950-2958) — hidden context-dependent regions owned by
 *    M-data-3/M-data-6.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { computeSidebarShortcutState, type Best1mSection } from '../composables/useContextExchange';
import type { PanelDef, PanelId } from '../types';

const props = defineProps<{
  panels: readonly PanelDef[];
  active: PanelId;
  /** Current context exchange key (uiState.contextExchange). */
  contextExchange: string;
  /** Current best-1m section (uiState.best1mPanelSection). */
  best1mSection: Best1mSection;
}>();

const emit = defineEmits<{
  select: [panelId: PanelId];
  /** Sidebar shortcut click carrying the best-1m section mode. */
  shortcut: [mode: Best1mSection];
}>();

const { t } = useI18n();

const shortcutState = computed(() =>
  computeSidebarShortcutState(props.active, props.contextExchange, props.best1mSection)
);
</script>

<template>
  <aside id="sidebar">
    <div id="sidebar-sticky">
      <div id="sidebar-header">
        <span class="sb-title">{{ t('market.sidebarTitle') }}</span>
      </div>

      <div id="sidebar-toolbar">
        <template v-for="panel in panels" :key="panel.id">
          <!-- best1m's registry slot renders the shortcut link (:2946,
               click → openBest1mPanel('build') :9112-9115) -->
          <a
            v-if="panel.id === 'best1m-panel'"
            id="sidebar-best-1m-link"
            class="sb-btn sidebar-shortcut"
            href="#"
            :class="{ active: shortcutState.best1mActive }"
            :aria-current="shortcutState.best1mActive ? 'page' : 'false'"
            @click.prevent="emit('shortcut', 'build')"
          >{{ t(panel.labelKey) }}</a>

          <button
            v-if="panel.buttonId !== null"
            :id="panel.buttonId"
            class="sb-btn"
            type="button"
            :data-panel="panel.id"
            :class="{ active: panel.id === active }"
            @click="emit('select', panel.id)"
          >{{ t(panel.labelKey) }}</button>

          <!-- l2books shortcut between copy-data and activity (:2947-2948);
               hyperliquid-only (:7422), click → openBest1mPanel('download')
               :9117-9120 -->
          <a
            v-if="panel.id === 'copy-data-panel'"
            id="sidebar-l2books-link"
            class="sb-btn sidebar-shortcut"
            href="#"
            :hidden="contextExchange !== 'hyperliquid'"
            :class="{ active: shortcutState.l2booksActive }"
            :aria-current="shortcutState.l2booksActive ? 'page' : 'false'"
            @click.prevent="emit('shortcut', 'download')"
          >{{ t('market.downloadL2books') }}</a>
        </template>
      </div>
    </div>
  </aside>
</template>
