<script setup lang="ts">
/*
 * Status monitor panel (legacy market_data_main.html:3223-3227): the shell
 * hosting the monitor iframe. M-data-8: the retired innerHTML fragment
 * (classic inline scripts re-executed per exchange) became the built
 * market_data_status Vue page — an ES-module document that innerHTML+re-exec
 * cannot remount — so the panel embeds it same-origin like the
 * jobs_monitor/hl_data_actions frames of this page (useStatusMonitor owns
 * the src/phase protocol; see its header for the mount history).
 *
 * The legacy loading/error callouts (:4150-4154, :4168-4172) were built as
 * HTML strings inside the host; here they render as Vue templates — escaped
 * by default, so a server error message can never become markup (no v-html
 * for server data). Deviation (documented since M-data-2): they are
 * siblings of the frame rather than its children.
 *
 * Height: the frame fills the panel through flex (`flex-1 min-h-0`), and the
 * embedded page fills its own document (`#mds-app { height: 100% }`), so the
 * legacy content-height sync (the monitor variant of useFrameAutoResize) is
 * gone — it only produced an inline height that the panel stretched anyway,
 * leaving the monitor's content in a short strip with a dead area below it.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { calloutClass } from '../lib/uiClasses';
import type { StatusMonitorController } from '../composables/useStatusMonitor';

const props = defineProps<{
  monitor: StatusMonitorController;
}>();

const { t } = useI18n();

const frameEl = ref<HTMLIFrameElement | null>(null);

function onFrameLoad(): void {
  props.monitor.handleFrameLoad(); // legacy frame load listener (:7490, :7550)
}

onMounted(() => {
  props.monitor.attachFrame(frameEl.value);
});

// Reset the mount state before the frame leaves the DOM (R2); the frame
// document (its timers/WS) is discarded with the element.
onBeforeUnmount(() => {
  props.monitor.destroyStatusMonitor();
  props.monitor.attachFrame(null);
});
</script>

<template>
  <article class="context-shell status-panel-shell flex w-full flex-1 min-h-0 flex-col gap-3 self-stretch border-0 bg-transparent p-0 rounded-none shadow-none">
    <div v-if="monitor.phase.value === 'loading'" :class="calloutClass(false)">
      <div class="eyebrow">{{ t('market.statusMonitor') }}</div>
      <p>{{ t('market.loadingStatus') }}</p>
    </div>
    <div v-else-if="monitor.phase.value === 'error'" :class="calloutClass(true)">
      <div class="eyebrow">{{ t('market.statusMonitor') }}</div>
      <p>{{ monitor.errorMessage.value || t('market.failedStatusMonitor') }}</p>
    </div>
    <iframe
      id="status-monitor-host"
      ref="frameEl"
      class="status-monitor-host block w-full flex-1 min-h-0 border-0"
      :title="t('market.statusMonitor')"
      scrolling="no"
      @load="onFrameLoad"
      @error="monitor.handleFrameError()"
    ></iframe>
  </article>
</template>
