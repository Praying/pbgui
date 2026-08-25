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
import { PhArrowClockwise, PhChartBar, PhFileText, PhGear, PhPlay, PhStop, PhToggleLeft, PhToggleRight } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { serviceButtons, serviceStatusClass, serviceStatusText, serviceStatusTitle, type Translate } from '../status';
import type { ServiceAction, ServiceStatusMap } from '../types';
import LogViewer from './LogViewer.vue';

export interface ServiceTab {
  id: string;
  i18nKey: string;
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
const actionIcons = {
  start: PhPlay,
  stop: PhStop,
  restart: PhArrowClockwise,
  enable: PhToggleRight,
  disable: PhToggleLeft,
} as const;
/** ui/ Button variant per action — mirrors the legacy .ctrl-btn.<action> tones
   (start=green, stop=red, restart=amber, enable=accent, disable=neutral). */
const actionVariants = {
  start: 'success',
  stop: 'danger',
  restart: 'warning',
  enable: 'info',
  disable: 'default',
} as const;
const tabIcons = { log: PhFileText, settings: PhGear, status: PhChartBar } as const;

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
      <Button
        v-for="b in buttons"
        :key="b.action"
        class="ctrl-btn"
        :class="b.action"
        :variant="actionVariants[b.action]"
        size="sm"
        type="button"
        :disabled="b.disabled"
        @click="emit('action', svcId, b.action)"
      ><PbIcon :icon="actionIcons[b.action]" /> {{ b.label }}</Button>
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
      ><PbIcon v-if="tab.id in tabIcons" :icon="tabIcons[tab.id as keyof typeof tabIcons]" /> {{ t(tab.i18nKey) }}</button>
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
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--surface-workspace);
}
.ctrl-title {
  font-size: var(--fs-md);
  font-weight: 700;
  color: var(--text-primary);
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
  background: var(--text-disabled);
  flex-shrink: 0;
}
.status-dot.running { background: var(--success); }
.status-dot.stopped { background: var(--danger); }
.status-dot.warn { background: var(--warning); }
.status-label {
  font-size: var(--fs-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.tab-bar {
  display: flex;
  gap: 2px;
  padding: 0.25rem 1rem 0;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  background: var(--bg-page);
}
.tab-btn {
  padding: 0.3rem 0.75rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--fs-sm);
  font-family: inherit;
  border-bottom: 2px solid transparent;
  transition: all 0.12s;
}
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-btn:hover:not(.active) { color: var(--text-secondary); }
.tab-pane { display: none; flex: 1; overflow: hidden; flex-direction: column; }
.tab-pane.active { display: flex; }
.log-wrap { flex: 1; overflow: hidden; }
.tab-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
}
.tab-placeholder-hint {
  font-size: var(--fs-sm);
  color: var(--text-disabled);
}

/* ── Shared service-log workspace refinement ────────────────────────────── */
.ctrl-strip {
  min-height: 58px;
  padding: 10px clamp(14px, 2vw, 24px);
  gap: 12px;
  border-bottom-color: rgb(var(--text-secondary-rgb) / 0.14);
  background:
    linear-gradient(90deg, rgb(var(--bg-panel-rgb) / 0.9), rgb(var(--bg-page-rgb) / 0.9)),
    var(--surface-workspace);
  box-shadow: 0 1px rgba(255, 255, 255, 0.025) inset;
}

.ctrl-title {
  color: var(--text-secondary);
  font-size: 16px;
  letter-spacing: -0.015em;
}

.ctrl-status {
  gap: 7px;
  min-width: 0;
  padding: 5px 9px;
  border: 1px solid rgb(var(--text-secondary-rgb) / 0.13);
  border-radius: 999px;
  background: rgb(var(--bg-page-rgb) / 0.34);
}

.status-dot {
  width: 8px;
  height: 8px;
  box-shadow: 0 0 0 3px rgb(var(--text-secondary-rgb) / 0.1);
}

.status-dot.running {
  background: var(--success);
  box-shadow: 0 0 0 3px rgb(var(--success-rgb) / 0.12), 0 0 12px rgb(var(--success-rgb) / 0.42);
}

.status-dot.stopped {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgb(var(--danger-rgb) / 0.1);
}

.status-dot.warn {
  background: var(--warning);
  box-shadow: 0 0 0 3px rgb(var(--warning-rgb) / 0.1);
}

.status-label {
  color: var(--text-secondary);
  font-size: 11px;
  letter-spacing: 0.07em;
}

.ctrl-btns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tab-bar {
  gap: 4px;
  padding: 7px clamp(14px, 2vw, 24px) 0;
  border-bottom-color: rgb(var(--text-secondary-rgb) / 0.14);
  background: rgb(var(--bg-page-rgb) / 0.86);
}

.tab-btn {
  min-height: 35px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  border-radius: 7px 7px 0 0;
  color: var(--text-muted);
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.tab-btn.active {
  border-color: rgb(var(--accent-rgb) / 0.2);
  border-bottom-color: var(--accent);
  background: rgb(var(--accent-rgb) / 0.12);
  color: var(--accent-soft);
}

.tab-btn:hover:not(.active) {
  border-color: rgb(var(--text-secondary-rgb) / 0.12);
  background: rgb(var(--text-secondary-rgb) / 0.06);
  color: var(--text-secondary);
}

.log-wrap {
  padding: 12px clamp(14px, 2vw, 24px) 18px;
  background: rgb(var(--bg-page-rgb) / 0.52);
}

.tab-placeholder {
  margin: 12px clamp(14px, 2vw, 24px) 18px;
  border: 1px dashed rgb(var(--text-secondary-rgb) / 0.18);
  border-radius: 10px;
  background: rgb(var(--text-secondary-rgb) / 0.035);
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
