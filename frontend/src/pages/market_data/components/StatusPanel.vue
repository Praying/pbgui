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
 * siblings of the frame rather than its children; the frame keeps the
 * legacy flex sizing and auto-sizes to its content via useFrameAutoResize
 * (monitor variant: ResizeObserver + 120 ms settle, :7507-7575).
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { calloutClass } from '../lib/uiClasses';
import { useFrameAutoResize } from '../composables/useFrameAutoResize';
import type { StatusMonitorController } from '../composables/useStatusMonitor';

const props = defineProps<{
  monitor: StatusMonitorController;
}>();

const { t } = useI18n();

const frameEl = ref<HTMLIFrameElement | null>(null);

const autoResize = useFrameAutoResize({
  frame: () => frameEl.value,
  useResizeObserver: true, // monitor variant (:7564-7570)
  settleMs: 120, // :7552
});

function onFrameLoad(): void {
  autoResize.handleLoad(); // legacy frame load listener (:7490, :7550)
  props.monitor.handleFrameLoad();
}

onMounted(() => {
  props.monitor.attachFrame(frameEl.value);
});

// Reset the mount state before the frame leaves the DOM (R2); the frame
// document (its timers/WS) is discarded with the element.
onBeforeUnmount(() => {
  autoResize.teardown(); // R7 — no observer survives a remount
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
