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

const emit = defineEmits<{
  action: [svcId: string, action: ServiceAction];
  /** Legacy switchTab side effects (e.g. loadCmcPool for the pbcoindata pool tab). */
  tab: [svcId: string, tabId: string];
}>();

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
  emit('tab', props.svcId, tabId);
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
        class="ctrl-btn pbgui-action"
        :class="b.action"
        type="button"
        :disabled="b.disabled"
        @click="emit('action', svcId, b.action)"
      ><template v-if="b.icon">{{ b.icon }} </template>{{ b.label }}</button>
    </span>
  </div>

  <!-- Legacy per-service extras between the ctrl strip and the tab bar
       (e.g. the pbcoindata CMC status bar). -->
  <slot name="above-tabs"></slot>

  <template v-if="hasTabs">
    <div class="tab-bar pbgui-tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        class="tab-btn pbgui-tab"
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
      <!-- Pane content arrives per task; the placeholder stays until then. -->
      <slot :name="`tab-${tab.id}`">
        <div class="tab-placeholder">
          <div class="tab-placeholder-hint">{{ t(tab.i18nKey) }} · {{ svcId }} ({{ tab.task }})</div>
        </div>
      </slot>
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

/* ── Shared service-log workspace refinement ────────────────────────────── */
.ctrl-strip {
  min-height: 58px;
  padding: 10px clamp(14px, 2vw, 24px);
  gap: 12px;
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background:
    linear-gradient(90deg, rgba(21, 38, 61, 0.9), rgba(14, 23, 37, 0.9)),
    #111827;
  box-shadow: 0 1px rgba(255, 255, 255, 0.025) inset;
}

.ctrl-title {
  color: #e8f0fa;
  font-size: 16px;
  letter-spacing: -0.015em;
}

.ctrl-status {
  gap: 7px;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid rgba(148, 163, 184, 0.13);
  border-radius: 999px;
  background: rgba(6, 13, 24, 0.34);
}

.status-dot {
  width: 8px;
  height: 8px;
  box-shadow: 0 0 0 3px rgba(74, 85, 104, 0.1);
}

.status-dot.running {
  background: #34d399;
  box-shadow: 0 0 0 3px rgba(52, 211, 153, 0.12), 0 0 12px rgba(52, 211, 153, 0.42);
}

.status-dot.stopped {
  background: #f87171;
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.1);
}

.status-dot.warn {
  background: #fbbf24;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.1);
}

.status-label {
  color: #9db2ca;
  font-size: 11px;
  letter-spacing: 0.07em;
}

.ctrl-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ctrl-btn {
  min-height: 31px;
  padding: 0 10px;
  border-color: rgba(148, 163, 184, 0.17);
  border-radius: 7px;
  background: rgba(148, 163, 184, 0.08);
  color: #b7c6d8;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.ctrl-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.38);
  background: rgba(37, 99, 235, 0.16);
  color: #edf4fc;
}

.ctrl-btn.start {
  border-color: rgba(52, 211, 153, 0.32);
  background: rgba(16, 185, 129, 0.12);
  color: #86efac;
}

.ctrl-btn.stop {
  border-color: rgba(248, 113, 113, 0.32);
  background: rgba(185, 28, 28, 0.15);
  color: #fca5a5;
}

.ctrl-btn.restart {
  border-color: rgba(251, 191, 36, 0.32);
  background: rgba(180, 83, 9, 0.14);
  color: #fde68a;
}

.ctrl-btn.enable {
  border-color: rgba(96, 165, 250, 0.32);
  background: rgba(37, 99, 235, 0.14);
  color: #bfdbfe;
}

.tab-bar {
  gap: 4px;
  padding: 7px clamp(14px, 2vw, 24px) 0;
  border-bottom-color: rgba(148, 163, 184, 0.14);
  background: rgba(9, 16, 27, 0.86);
}

.tab-btn {
  min-height: 35px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: 7px 7px 0 0;
  color: #71849b;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tab-btn.active {
  border-color: rgba(96, 165, 250, 0.2);
  border-bottom-color: #60a5fa;
  background: rgba(37, 99, 235, 0.12);
  color: #dbeafe;
}

.tab-btn:hover:not(.active) {
  border-color: rgba(148, 163, 184, 0.12);
  background: rgba(148, 163, 184, 0.06);
  color: #cbd5e1;
}

.log-wrap {
  padding: 12px clamp(14px, 2vw, 24px) 18px;
  background: rgba(7, 13, 22, 0.52);
}

.tab-placeholder {
  margin: 12px clamp(14px, 2vw, 24px) 18px;
  border: 1px dashed rgba(148, 163, 184, 0.18);
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.035);
}

@media (max-width: 720px) {
  .ctrl-strip {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .ctrl-status {
    order: 3;
  }

  .ctrl-strip > span[style*="flex: 1"] {
    display: none;
  }

  .ctrl-btns {
    margin-left: auto;
  }

  .tab-bar {
    overflow-x: auto;
  }

  .tab-btn {
    flex-shrink: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
