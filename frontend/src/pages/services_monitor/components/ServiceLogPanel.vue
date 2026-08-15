<script setup lang="ts">
/*
 * Per-service panel shell, ported from the legacy ctrl-strip + log-wrap /
 * tab-bar markup of frontend/services_monitor.html: status dot/label and
 * action buttons (renderServiceButtons non-compact), the log container
 * (initLogViewer -> LogViewer with the service's default logFile, created on
 * first activation and kept alive like the legacy _logViewers cache) and the
 * switchTab tab bar with hash persistence for the multi-tab services.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { serviceButtons, serviceStatusClass, serviceStatusText, serviceStatusTitle, type Translate } from '../status';
import type { ServiceAction, ServiceStatusMap } from '../types';
import LogViewer from './LogViewer.vue';

export interface ServiceTab {
  id: string;
  i18nKey: string;
  /** Legacy tab icons: 📋 log, ⚙ settings, 📊 status; the pool tab has none. */
  icon?: string;
  /** Task that will implement the pane - placeholder until then. */
  task: string;
}

interface Props {
  svcId: string;
  label: string;
  logFile: string;
  statuses: ServiceStatusMap;
  pending?: Record<string, ServiceAction>;
  /** True while the panel is visible; gates the log viewer like legacy selectPanel. */
  active?: boolean;
  /** Tab bar; omit for the plain single-log panels (pbcluster/pbrun/…). */
  tabs?: ServiceTab[];
}

const props = withDefaults(defineProps<Props>(), {
  pending: () => ({}),
  active: false,
  tabs: undefined,
});

const emit = defineEmits<{ action: [svcId: string, action: ServiceAction] }>();

const { t } = useI18n();
const tt: Translate = (key, named) => (named ? t(key, named) : t(key));

const status = computed(() => props.statuses[props.svcId] ?? {});
const pending = computed(() => props.pending[props.svcId] ?? null);
const dotClass = computed(() => serviceStatusClass(status.value));
const statusText = computed(() => serviceStatusText(tt, status.value, pending.value));
const statusTitle = computed(() => serviceStatusTitle(tt, status.value));
const buttons = computed(() => serviceButtons(tt, props.svcId === 'api-server', status.value, pending.value));

/** Legacy restoreFromHash: `#svcId/tab`. */
function tabFromHash(): string | null {
  const parts = window.location.hash.replace(/^#/, '').split('/');
  return parts[0] === props.svcId ? parts[1] || null : null;
}

const hasTabs = computed(() => (props.tabs?.length ?? 0) > 0);
const activeTab = ref('log');

if (hasTabs.value) {
  const restored = tabFromHash();
  if (restored && props.tabs!.some((tab) => tab.id === restored)) activeTab.value = restored;
}

/** Legacy switchTab: swap panes and persist `#svcId/tab` in the hash. */
function switchTab(tabId: string): void {
  activeTab.value = tabId;
  if (hasTabs.value) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${props.svcId}/${tabId}`);
  }
}

/** Legacy initLogViewer: the viewer is created on first activation and cached. */
const logOpened = ref(false);
watch(
  () => [props.active, activeTab.value] as const,
  ([isActive, tab]) => {
    if (isActive && tab === 'log') logOpened.value = true;
  },
  { immediate: true }
);
</script>

<template>
  <div class="ctrl-strip">
    <span class="ctrl-title">{{ label }}</span>
    <div class="ctrl-status">
      <div class="status-dot" :class="dotClass"></div>
      <span class="status-label" :title="statusTitle">{{ statusText }}</span>
    </div>
    <span style="flex: 1"></span>
    <span class="ctrl-btns">
      <button
        v-for="b in buttons"
        :key="b.action"
        class="ctrl-btn"
        :class="b.action"
        type="button"
        :disabled="b.disabled"
        @click="emit('action', svcId, b.action)"
      ><template v-if="b.icon">{{ b.icon }} </template>{{ b.label }}</button>
    </span>
  </div>

  <template v-if="hasTabs">
    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn"
        :class="{ active: activeTab === tab.id }"
        :data-tab="tab.id"
        type="button"
        @click="switchTab(tab.id)"
      >{{ tab.icon ? `${tab.icon} ` : '' }}{{ t(tab.i18nKey) }}</button>
    </div>
    <div :id="`${svcId}-tab-log`" class="tab-pane log-wrap" :class="{ active: activeTab === 'log' }">
      <LogViewer v-if="logOpened" v-show="activeTab === 'log'" :file="logFile" />
    </div>
    <div
      v-for="tab in tabs.filter((x) => x.id !== 'log')"
      :id="`${svcId}-tab-${tab.id}`"
      :key="tab.id"
      class="tab-pane"
      :class="{ active: activeTab === tab.id }"
    >
      <div class="tab-placeholder">
        <div class="tab-placeholder-hint">{{ t(tab.i18nKey) }} · {{ svcId }} ({{ tab.task }})</div>
      </div>
    </div>
  </template>
  <div v-else class="log-wrap">
    <LogViewer v-if="logOpened" :file="logFile" />
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (ctrl-strip/tabs/log-wrap). -->
<style scoped>
.ctrl-strip {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 1rem;
  border-bottom: 1px solid #1e2736;
  flex-shrink: 0;
  background: #111827;
}
.ctrl-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: #e2e8f0;
}
.ctrl-status {
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #4a5568;
  flex-shrink: 0;
}
.status-dot.running { background: #21c354; }
.status-dot.stopped { background: #ff4b4b; }
.status-dot.warn { background: #f59e0b; }
.status-label {
  font-size: var(--fs-xs);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ctrl-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 5px;
  border: 1px solid #2d3748;
  background: #1a202c;
  color: #94a3b8;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  transition: all 0.12s;
}
.ctrl-btn:hover:not(:disabled) { border-color: #4a5568; color: #e2e8f0; }
.ctrl-btn:disabled { cursor: default; opacity: 0.6; }
.ctrl-btn.start { border-color: #166534; color: #4ade80; background: #052e16; }
.ctrl-btn.stop { border-color: #7f1d1d; color: #fca5a5; background: #2d1515; }
.ctrl-btn.restart { border-color: #b45309; color: #fcd34d; background: #1c1a08; }
.ctrl-btn.enable { border-color: #1d4ed8; color: #93c5fd; background: #10213f; }
.ctrl-btn.disable { border-color: #475569; color: #cbd5e1; background: #1e293b; }
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 0.25rem 1rem 0;
  border-bottom: 1px solid #1e2736;
  flex-shrink: 0;
  background: #0e1117;
}
.tab-btn {
  padding: 0.3rem 0.75rem;
  border: none;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  border-bottom: 2px solid transparent;
  transition: all 0.12s;
}
.tab-btn.active { color: #63b3ed; border-bottom-color: #63b3ed; }
.tab-btn:hover:not(.active) { color: #94a3b8; }
.tab-pane { display: none; flex: 1; overflow: hidden; flex-direction: column; }
.tab-pane.active { display: flex; }
.log-wrap { flex: 1; overflow: hidden; }
.tab-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
}
.tab-placeholder-hint {
  font-size: var(--fs-sm);
  color: #4a5568;
}
</style>
