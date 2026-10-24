<script setup lang="ts">
/*
 * Activity log panel (legacy market_data_main.html:3579-3592,
 * ensureActivityLogViewer :8851-8866 + syncActivityLogViewer :8869-8873).
 *
 * Hosts the shared Vue log viewer (`@/shared/components/LogViewer.vue`), the
 * same component the Logging Monitor / API Keys / VPS Monitor pages mount.
 * The previous version instantiated the legacy global
 * `frontend/js/log_viewer_panel.js` through `window.LogViewerPanel`, which
 * could never resolve: that file declares `class LogViewerPanel` at the top
 * level of a classic script, and class declarations create a global *lexical*
 * binding instead of a `window` property, so the panel always landed in its
 * "viewer unavailable" error state.
 *
 * The viewer follows the panel's visibility through its `active` prop — the
 * socket lives exactly while the panel is shown (legacy
 * syncActivityLogViewer), so a backgrounded panel holds no connection.
 */
import { useI18n } from 'vue-i18n';
import LogViewer from '@/shared/components/LogViewer.vue';
import { SYSTEM_PRESETS } from '@/shared/log/logViewerPresets';
import { noteClass, panelCardClass, panelHeadClass } from '../lib/uiClasses';
import { wsBase } from '../config';

defineProps<{
  /** Panel visibility — PanelShell keeps every panel mounted, toggling hidden. */
  active: boolean;
}>();

const { t } = useI18n();
</script>

<template>
  <article :class="[panelCardClass, 'activity-log-shell flex min-h-0 flex-col gap-4']">
    <div :class="panelHeadClass">
      <div>
        <div class="text-xs font-bold tracking-label text-secondary uppercase">
          {{ t('market.activityLog') }}
        </div>
        <h2 class="mt-1 text-lg font-semibold tracking-tight text-primary">
          {{ t('market.sharedLogViewer') }}
        </h2>
      </div>
    </div>
    <p :class="[noteClass, 'max-w-[680px] leading-relaxed']">{{ t('market.activityLogNote') }}</p>
    <div class="activity-log-shell__body flex min-h-[620px] flex-1 flex-col">
      <LogViewer
        :active="active"
        :ws-base="wsBase()"
        default-file="MarketData.log"
        :presets="SYSTEM_PRESETS"
        show-sidebar
      />
    </div>
  </article>
</template>
