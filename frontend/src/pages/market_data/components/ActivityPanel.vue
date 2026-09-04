<script setup lang="ts">
/*
 * Activity log panel (M-data-8 — legacy market_data_main.html:3579-3592,
 * ensureActivityLogViewer :8851-8866 + syncActivityLogViewer :8869-8873):
 * hosts the global LogViewerPanel script (frontend/js/log_viewer_panel.js,
 * loaded by index.html — an ES-module port would duplicate the shared viewer
 * the logging_monitor/vps pages already mount, so the Vue panel keeps the
 * script bridge, the logging_monitor installViewer pattern).
 *
 * The viewer is created lazily on first activation and follows the panel's
 * visibility — open() connects the WS, close() disconnects (legacy
 * syncActivityLogViewer), so a backgrounded panel holds no socket. The
 * legacy %%TOKEN%% injection is gone with the cookie-session migration
 * (index.html boot note); the REST/WS auth rides the session cookie.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ErrorState from '@/shared/components/ErrorState.vue';
import { noteClass, panelCardClass, panelHeadClass } from '../lib/uiClasses';
import { wsBase } from '../config';

type Viewer = { open(): void; close(): void };
type ViewerCtor = new (options: Record<string, unknown>) => Viewer;

const props = defineProps<{
  /** Panel visibility — PanelShell keeps every panel mounted, toggling hidden. */
  active: boolean;
}>();

const { t } = useI18n();
const viewerUnavailable = ref(false);
let viewer: Viewer | null = null;

/** Legacy ensureActivityLogViewer (:8851-8866) — one viewer per page life;
 *  the script missing (blocked asset) surfaces as an inline error state
 *  instead of legacy's silent null. */
function ensureViewer(): Viewer | null {
  if (viewer) return viewer;
  const Ctor = (window as Window & { LogViewerPanel?: ViewerCtor }).LogViewerPanel;
  if (typeof Ctor !== 'function') {
    viewerUnavailable.value = true;
    return null;
  }
  viewer = new Ctor({
    containerId: 'activity-log-target',
    wsBase: wsBase(), // getWsBase (:4102-4106)
    defaultHost: 'local',
    defaultFile: 'MarketData.log',
    presets: 'system',
    showRestart: false,
    height: '100%',
  });
  return viewer;
}

/** Legacy syncActivityLogViewer (:8869-8873) — open on activation, close on
 *  leave. post-flush so the hidden toggle has landed before open() builds. */
watch(
  () => props.active,
  (active) => {
    if (active) ensureViewer()?.open();
    else viewer?.close();
  },
  { flush: 'post' },
);

/** restorePanel may boot straight into this panel (:9736-9746); the watch
 *  above cannot fire for the initial value, so the first activation is
 *  handled here, after #activity-log-target is in the DOM. */
onMounted(() => {
  if (props.active) ensureViewer()?.open();
});

onBeforeUnmount(() => viewer?.close());
</script>

<template>
  <article :class="[panelCardClass, 'activity-log-shell flex min-h-0 flex-col gap-4']">
    <div :class="panelHeadClass">
      <div>
        <div class="text-xs font-bold tracking-[0.08em] text-secondary uppercase">
          {{ t('market.activityLog') }}
        </div>
        <h2 class="mt-1 text-lg font-semibold tracking-tight text-primary">
          {{ t('market.sharedLogViewer') }}
        </h2>
      </div>
    </div>
    <p :class="[noteClass, 'max-w-[680px] leading-relaxed']">{{ t('market.activityLogNote') }}</p>
    <ErrorState
      v-if="viewerUnavailable"
      :title="t('common.error')"
      :message="t('sysmon.logViewerUnavailable', { v: 'LogViewerPanel' })"
    />
    <div v-else id="activity-log-target" class="flex min-h-[620px] flex-1 flex-col"></div>
  </article>
</template>
