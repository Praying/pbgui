<script setup lang="ts">
/*
 * Status monitor panel (legacy market_data_main.html:3223-3227): a shell
 * with the #status-monitor-host div whose contents are owned entirely by
 * the fragment-mount controller (useStatusMonitor — the innerHTML+re-exec
 * contract, R2). Vue never renders into that host.
 *
 * The legacy loading/error callouts (:4150-4154, :4168-4172) were built as
 * HTML strings inside the host; here they render as Vue templates —
 * escaped by default, so the server error message can never become markup
 * (no v-html for server data). Deviation (documented): they are siblings
 * of the host rather than its children; the fragment host keeps its legacy
 * flex sizing and the callouts render in the same slot position.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { StatusMonitorController } from '../composables/useStatusMonitor';

const props = defineProps<{
  monitor: StatusMonitorController;
}>();

const { t } = useI18n();

const hostEl = ref<HTMLElement | null>(null);

onMounted(() => {
  props.monitor.attachHost(hostEl.value);
});

// Destroy the live fragment (its timers/WS) before the host leaves the DOM.
onBeforeUnmount(() => {
  props.monitor.destroyStatusMonitor(); // __mdsDestroy contract (:4127-4140)
  props.monitor.attachHost(null);
});
</script>

<template>
  <article class="context-shell status-panel-shell">
    <div v-if="monitor.phase.value === 'loading'" class="callout">
      <div class="eyebrow">{{ t('market.statusMonitor') }}</div>
      <p>{{ t('market.loadingStatus') }}</p>
    </div>
    <div v-else-if="monitor.phase.value === 'error'" class="callout warning">
      <div class="eyebrow">{{ t('market.statusMonitor') }}</div>
      <p>{{ monitor.errorMessage.value || t('market.failedStatusMonitor') }}</p>
    </div>
    <div id="status-monitor-host" ref="hostEl" class="status-monitor-host"></div>
  </article>
</template>
