<script setup lang="ts">
/*
 * Sidebar toolbar (legacy #sidebar-sticky/#sidebar-toolbar,
 * market_data_main.html:2918-2963) rendered from the sectionButtons registry
 * (:3674-3682). DOM order is verbatim: settings/status/inventory/integrity
 * buttons, the best-1m shortcut link at best1m's registry slot (:2946), the
 * copy-data button, the hidden l2books shortcut (:2948), the activity button.
 *
 * NOT PORTED (documented):
 *  - #sidebar-resize handle (:2962) — silent no-op in legacy (sidebar_resize.js
 *    is never included, guard :9748-9755); recon §0 says do not port as-is.
 *  - The inventory/settings subsection navs and sidebar action blocks
 *    (:2929-2945, :2950-2958) — hidden context-dependent regions owned by
 *    M-data-3/M-data-6.
 *  - Shortcut visibility syncing (syncSidebarShortcutState :7427-7446) —
 *    M-data-2; the l2books link keeps its legacy default hidden.
 */
import { useI18n } from 'vue-i18n';
import type { PanelDef, PanelId } from '../types';

defineProps<{
  panels: readonly PanelDef[];
  active: PanelId;
}>();

const emit = defineEmits<{ select: [panelId: PanelId] }>();

const { t } = useI18n();
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
               click → openBest1mPanel → setActivePanel :9112-9115) -->
          <a
            v-if="panel.id === 'best1m-panel'"
            id="sidebar-best-1m-link"
            class="sb-btn sidebar-shortcut"
            href="#"
            @click.prevent="emit('select', 'best1m-panel')"
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

          <!-- hidden l2books shortcut sits between copy-data and activity
               (:2947-2948); visibility sync lands in M-data-2 -->
          <a
            v-if="panel.id === 'copy-data-panel'"
            id="sidebar-l2books-link"
            class="sb-btn sidebar-shortcut"
            href="#"
            hidden
            @click.prevent="emit('select', 'best1m-panel')"
          >{{ t('market.downloadL2books') }}</a>
        </template>
      </div>
    </div>
  </aside>
</template>
