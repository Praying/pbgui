<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { PhCaretDown, PhCaretRight, PhCheckCircle, PhGear, PhStop, PhX, PhXCircle } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import AppShell from '@/shared/components/AppShell.vue';
import type { PageSection } from '@/shared/navigation';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { vpsWsUrl } from './config';
import type { ConnectionInfo, HistoryPayload, HistoryPoint, InstanceRecord, Metrics, ServiceCheck, VpsState } from './types';

const { t } = useI18n();
const query = new URLSearchParams(window.location.search);
const hideIpMode = ref(query.get('hide_ip') === '1');
const queryCompact = query.get('compact') === '1';
const activeTab = ref<'dashboard' | 'instances' | 'services' | 'logs'>('dashboard');
const sections = computed<PageSection[]>(() => [
  { key: 'dashboard', label: t('sysmon.dashboard') },
  { key: 'instances', label: t('sysmon.instances') },
  { key: 'services', label: t('sysmon.services') },
  { key: 'logs', label: t('sysmon.liveLogs') },
]);
function onSectionSelect(key: string): void {
  if (key === 'dashboard' || key === 'instances' || key === 'services' || key === 'logs') switchTab(key);
}
const state = ref<VpsState | null>(null);
const connection = ref<'connecting' | 'connected' | 'lost'>('connecting');
const compactMode = ref(queryCompact);
const debugLogging = ref(false);
const collapsedHosts = ref<Record<string, boolean>>({});
const collapsedServices = ref<Record<string, boolean>>({});
const instanceServerFilter = ref('All');
const instanceVersionFilter = ref('All');
const instanceErrorsOnly = ref(false);
const instanceShowOther = ref(false);
const resultModal = ref<{ title: string; message: string } | null>(null);
const historyModal = ref<{ host: string; bot: string; metric: string; data: HistoryPayload | null; error: string } | null>(null);
const socket = ref<WebSocket | null>(null);
const generation = ref(0);
const viewer = ref<any>(null);
const historyRequestId = ref(0);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const connectionMap = computed<Record<string, ConnectionInfo>>(() => state.value?.connections?.connections || {});
const hosts = computed(() => Object.keys(connectionMap.value).sort((a, b) => {
  const rank = (value: string) => value === 'connected' ? 0 : value === 'connecting' ? 1 : 2;
  return rank(connectionMap.value[a]?.status || '') - rank(connectionMap.value[b]?.status || '') || a.localeCompare(b);
}));
const summary = computed(() => ({
  total: state.value?.connections?.total || hosts.value.length,
  connected: state.value?.connections?.connected || 0,
  connecting: state.value?.connections?.connecting || 0,
  disconnected: state.value?.connections?.disconnected || 0,
}));
const services = computed(() => state.value?.services || {});
const instances = computed(() => state.value?.instances || {});

function numberValue(value: unknown): number {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function formatBytes(value: unknown): string {
  const bytes = numberValue(value);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(1)} ${units[index]}`;
}

function formatAge(timestamp: unknown): string {
  const ts = numberValue(timestamp);
  if (!ts) return t('common.unknown');
  const age = Math.max(0, Date.now() / 1000 - ts);
  if (age < 5) return t('sysmon.now');
  if (age < 60) return `${Math.floor(age)}s`;
  if (age < 3600) return `${Math.floor(age / 60)}m`;
  return `${Math.floor(age / 3600)}h`;
}

function pctColor(value: unknown): string {
  const pct = numberValue(value);
  return pct >= 90 ? 'var(--danger)' : pct >= 75 ? 'var(--warning)' : 'var(--accent)';
}

function cpuDisplay(metrics: Metrics | undefined): { value: string; sub: string } {
  const live = numberValue(metrics?.cpu);
  const window = numberValue(metrics?.cpu_60s_window);
  return { value: `${live.toFixed(1)}%`, sub: window >= 60 ? `1m ${numberValue(metrics?.cpu_60s).toFixed(1)}%` : window > 0 ? `${Math.floor(Math.min(60, window))}s/60s` : '' };
}

/* Status → Tailwind utility mapping (the former vps-monitor.css carried the
   same green/orange/red ramps as .vps-badge/.service-status/.agent-file
   variants). Each helper returns the FULL colour set including the neutral
   default, so the static class never fights a dynamic one. */
function badgeStatusClass(status: unknown): string {
  const value = String(status || '').toLowerCase();
  if (value === 'running' || value === 'connected' || value === 'ok') return 'bg-success-deep text-success-soft';
  if (value === 'connecting' || value === 'restarting' || value === 'stale') return 'bg-warning-deep text-warning-soft';
  if (value === 'stopped' || value === 'error' || value === 'missing') return 'bg-danger-deep text-danger-soft';
  return 'bg-border-strong';
}

function serviceStatusClass(status: unknown): string {
  const value = String(status || '').toLowerCase();
  if (value === 'running' || value === 'connected' || value === 'ok') return 'text-success-soft';
  if (value === 'stopped' || value === 'error' || value === 'missing') return 'text-danger-soft';
  return 'text-secondary';
}

function agentFileClass(state: string): string {
  if (state === 'ok') return 'bg-success-deep text-success-soft';
  if (state === 'stale') return 'bg-warning-deep text-warning-soft';
  if (state === 'error' || state === 'missing') return 'bg-danger-deep text-danger-soft';
  return 'bg-border-strong';
}

function stateMessage(message: unknown): string {
  return String(message ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

function send(command: Record<string, unknown>): void {
  const ws = socket.value;
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(command));
}

function closeResult(): void { resultModal.value = null; }

function handleResult(message: Record<string, unknown>): void {
  const ok = message.ok === true || message.success === true;
  const detail = stateMessage(message.message || message.detail || message.error || (ok ? t('sysmon.actionCompleted', { svc: String(message.cmd || '') }) : t('common.error')));
  resultModal.value = { title: ok ? t('sysmon.action') : t('common.error'), message: detail || JSON.stringify(message) };
}

function receive(message: Record<string, unknown>): void {
  if (message.type === 'state') {
    state.value = (message.data || {}) as VpsState;
    if (state.value.ui_settings) {
      if (state.value.ui_settings.compact !== undefined && !queryCompact) compactMode.value = state.value.ui_settings.compact === 'true';
      if (state.value.ui_settings.debug_logging !== undefined) debugLogging.value = state.value.ui_settings.debug_logging === 'true';
    }
  } else if (message.type === 'result') {
    handleResult(message);
  } else if (message.type === 'cpu_history' || message.type === 'metric_history') {
    const data = (message.data || {}) as HistoryPayload;
    if (!historyModal.value) return;
    if (message.sid && String(message.sid) !== String(historyRequestId.value)) return;
    historyModal.value.data = data;
  } else if (message.type === 'error') {
    if (historyModal.value) historyModal.value.error = stateMessage(message.error);
    else resultModal.value = { title: t('common.error'), message: stateMessage(message.error) };
  }
}

function connect(): void {
  const currentGeneration = ++generation.value;
  connection.value = 'connecting';
  const ws = new WebSocket(vpsWsUrl());
  socket.value = ws;
  ws.onopen = () => { if (currentGeneration === generation.value) connection.value = 'connected'; };
  ws.onmessage = (event) => {
    if (currentGeneration !== generation.value) return;
    try { receive(JSON.parse(event.data) as Record<string, unknown>); } catch { /* Ignore malformed server frames. */ }
  };
  ws.onerror = () => { if (currentGeneration === generation.value) connection.value = 'lost'; };
  ws.onclose = () => {
    if (currentGeneration !== generation.value) return;
    connection.value = 'lost';
    if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000);
  };
}

function disconnect(): void {
  generation.value += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  const ws = socket.value;
  socket.value = null;
  if (ws) { ws.onopen = null; ws.onmessage = null; ws.onerror = null; ws.onclose = null; ws.close(); }
}

function setSetting(key: string, value: boolean): void {
  send({ cmd: 'set_setting', key, value: value ? 'true' : 'false' });
}

function switchTab(tab: 'dashboard' | 'instances' | 'services' | 'logs'): void {
  activeTab.value = tab;
  if (tab === 'logs') void nextTick(initViewer);
}

function toggleHost(host: string): void { collapsedHosts.value = { ...collapsedHosts.value, [host]: !collapsedHosts.value[host] }; }
function toggleServices(host: string): void { collapsedServices.value = { ...collapsedServices.value, [host]: !collapsedServices.value[host] }; }
function isHostCollapsed(host: string): boolean { return collapsedHosts.value[host] ?? compactMode.value; }
function isServiceCollapsed(host: string): boolean { return collapsedServices.value[host] ?? compactMode.value; }

function restartService(host: string, service: string): void { send({ cmd: 'restart_service', host, service }); }
function killInstance(host: string, row: InstanceRecord): void { send({ cmd: 'kill_instance', host, name: instanceName(row), pb_version: instanceVersion(row) }); }

function instanceName(row: InstanceRecord): string { return String(row.name || row.u || '?'); }
function instanceVersion(row: InstanceRecord): string { return String(row.pb_version || row.p || '7'); }

function viewInstanceLog(host: string, row: InstanceRecord): void {
  switchTab('logs');
  void nextTick(() => {
    initViewer();
    viewer.value?.setHost?.(host);
    viewer.value?.setService?.(`Bot:${instanceName(row)}:${instanceVersion(row)}`);
  });
}

function serviceStatus(host: string, service: string): ServiceCheck | null {
  return services.value[host]?.[service] || null;
}

function initViewer(): void {
  if (viewer.value || typeof window === 'undefined') return;
  const Viewer = (window as Window & { LogViewerPanel?: new (options: Record<string, unknown>) => any }).LogViewerPanel;
  if (!Viewer) return;
  const origin = getBoot().origin;
  viewer.value = new Viewer({
    containerId: 'vps-log-viewer', wsBase: origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'),
    defaultHost: 'local', defaultService: 'PBRun', presets: 'trading', showRestart: true, height: '100%',
    serviceStatusProvider: (host: string, service: string) => serviceStatus(host, service),
  });
  viewer.value.open?.();
}

function closeViewer(): void { viewer.value?.close?.(); viewer.value = null; }

function historyValues(data: HistoryPayload | null): Array<{ ts: string; value: string }> {
  if (!data) return [];
  const points = data.points || data.cumulative_points || data.fills_points || data.daily_points;
  if (Array.isArray(points)) return points.map((point) => ({ ts: formatAge((point as HistoryPoint).ts), value: numberValue((point as HistoryPoint).value).toFixed(2) }));
  if (Array.isArray(data.values)) return data.values.map((value, index) => ({ ts: String(index + 1), value: numberValue(value).toFixed(2) }));
  return [];
}

const currentHistoryValues = computed(() => historyValues(historyModal.value?.data || null));
const currentHistoryPolyline = computed(() => {
  const values = currentHistoryValues.value;
  const max = Math.max(1, ...values.map((point) => numberValue(point.value)));
  return values.map((point, index) => `${(index / Math.max(1, values.length - 1)) * 580 + 10},${165 - (numberValue(point.value) / max) * 145}`).join(' ');
});

function openHistory(host: string, metric: string, bot = ''): void {
  const requestMetric = metric === 'cpu' ? 'get_cpu_history' : 'get_metric_history';
  historyRequestId.value += 1;
  historyModal.value = { host, bot, metric, data: null, error: '' };
  send({ cmd: requestMetric, host, bot_name: bot, metric: metric === 'pnl_fills' ? 'pnl' : metric, sid: String(historyRequestId.value) });
}

function metricTitle(metric: string): string {
  const labels: Record<string, string> = { cpu: t('sysmon.cpu'), memory: t('sysmon.memory'), disk: t('sysmon.disk'), swap: t('sysmon.swap'), pnl: t('sysmon.pnlToday'), fills: t('sysmon.fills') };
  return labels[metric] || metric;
}

function monitorAgent(host: string): Record<string, unknown> {
  return (state.value?.streams?.[host]?.monitor_agent || {}) as Record<string, unknown>;
}

function agentFiles(host: string): Array<{ name: string; state: string }> {
  const files = (monitorAgent(host).files || {}) as Record<string, Record<string, unknown>>;
  return Object.entries(files).map(([name, file]) => ({ name, state: String(file?.state || 'unknown') }));
}

function instancesForHost(host: string): InstanceRecord[] {
  return instances.value[host] || [];
}

const instanceRows = computed(() => {
  const rows: Array<{ host: string; row: InstanceRecord }> = [];
  for (const host of Object.keys(instances.value)) for (const row of instancesForHost(host)) rows.push({ host, row });
  for (const [host, list] of Object.entries(state.value?.v7_instances || {})) {
    for (const row of list) if (!instancesForHost(host).some((item) => instanceName(item) === instanceName(row))) rows.push({ host, row: { ...row, status: row.status || 'stopped' } });
  }
  for (const [host, list] of Object.entries(state.value?.v8_instances || {})) {
    for (const row of list) if (!instancesForHost(host).some((item) => instanceName(item) === instanceName(row))) rows.push({ host, row: { ...row, status: row.status || 'stopped' } });
  }
  return rows;
});

const visibleInstanceRows = computed(() => instanceRows.value.filter(({ host, row }) => {
  if (instanceServerFilter.value !== 'All' && host !== instanceServerFilter.value) return false;
  if (instanceVersionFilter.value !== 'All' && instanceVersion(row) !== instanceVersionFilter.value) return false;
  if (instanceErrorsOnly.value && !numberValue(row.et || row.errors_4w) && !numberValue(row.tt || row.tracebacks_4w)) return false;
  if (!instanceShowOther.value && row.status && !['running', 'synced', 'outdated', 'pending'].includes(String(row.status))) return false;
  return true;
}));

const serviceHosts = computed(() => Object.keys(services.value).sort());

function metricValue(metrics: Metrics | undefined, metric: string): number {
  if (!metrics) return 0;
  return numberValue(metric === 'memory' ? metrics.mem_percent : metric === 'disk' ? metrics.disk_percent : metric === 'swap' ? metrics.swap_percent : metrics.cpu);
}

function metricLabel(metric: string): string {
  return metric === 'memory' ? 'RAM' : metric.charAt(0).toUpperCase() + metric.slice(1);
}

function monitorAgentLabel(host: string): string {
  const status = String(monitorAgent(host).state || 'unknown');
  return status === 'ok' ? t('sysmon.ok') : status === 'stale' ? t('sysmon.stale') : status === 'missing' ? t('sysmon.missing') : status === 'error' ? t('common.error') : t('common.unknown');
}

function serviceLabel(status: unknown): string {
  const value = String(status || 'unknown');
  return value === 'running' ? t('sysmon.running') : value === 'stopped' ? t('sysmon.stopped') : value === 'restarting' ? t('sysmon.restarting') : value === 'disabled' ? t('sysmon.disabled') : value;
}

onMounted(() => {
  document.title = t('sysmon.vpsMonitorTitle');
  connect();
});

onUnmounted(() => { disconnect(); closeViewer(); });
</script>

<template>
  <AppShell
    class="operations-shell operations-shell--vps-monitor"
    page-key="system_vps_monitor"
    :page-title="t('sysmon.vpsMonitor')"
    :page-description="t('sysmon.vpsMonitorSubtitle')"
    :sections="sections"
    :active-section="activeTab"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('sysmon.status')"
        :value="connection === 'connected' ? t('sysmon.connected') : connection === 'lost' ? t('sysmon.connectionLost') : t('sysmon.connectingVpsMonitor')"
        :tone="connection === 'connected' ? 'success' : connection === 'lost' ? 'danger' : 'warning'"
      />
    </template>

  <div class="vps-monitor flex min-h-0 flex-1 flex-col bg-page text-primary" :class="{ compact: compactMode }">
    <div
      class="bg-warning-deep px-3.5 py-2 text-center text-warning-soft"
      :class="{ hidden: connection === 'connected' }"
      data-status="connection"
    >
      {{ connection === 'connected' ? t('sysmon.connected') : connection === 'lost' ? t('sysmon.connectionLost') : t('sysmon.connectingVpsMonitor') }}
    </div>
    <div class="flex min-h-0 flex-1">
      <section class="flex min-w-0 flex-1 flex-col p-3.5">
        <div class="mb-3 flex flex-wrap gap-3.5 text-[0.82rem] text-secondary">
          <label class="flex items-center gap-1.75"><input data-option="hide-ip" v-model="hideIpMode" type="checkbox"> {{ t('sysmon.hideIp') }}</label>
          <label class="flex items-center gap-1.75"><input data-option="compact" v-model="compactMode" type="checkbox" @change="setSetting('compact', compactMode)"> {{ t('sysmon.compact') }}</label>
          <label class="flex items-center gap-1.75"><input v-model="debugLogging" type="checkbox" @change="setSetting('debug_logging', debugLogging)"> {{ t('sysmon.debugLog') }}</label>
        </div>
        <div v-if="activeTab === 'dashboard'" class="min-h-0 flex-1 overflow-auto">
          <div class="mb-3.5 flex flex-wrap gap-3.75 text-[0.85rem] text-primary">
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style="background:var(--success)"></span>{{ t('sysmon.connectedCount', { n: summary.connected }) }}</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style="background:var(--warning)"></span>{{ t('sysmon.connectingCount', { n: summary.connecting }) }}</span>
            <span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full" style="background:var(--danger)"></span>{{ t('sysmon.disconnectedCount', { n: summary.disconnected }) }}</span>
          </div>
          <article v-for="host in hosts" :key="host" class="mb-2.5 overflow-hidden rounded-[7px] border border-border-default bg-card">
            <header class="flex max-[780px]:flex-wrap cursor-pointer items-center gap-2.25 px-3.25 py-2.75 hover:bg-accent/20" @click="toggleHost(host)">
              <span class="flex-1 font-bold"><PbIcon :icon="connectionMap[host]?.status === 'connected' ? PhCheckCircle : PhXCircle" /> {{ host }}</span>
              <span v-if="!hideIpMode" :data-ip="host" class="rounded-full bg-border-strong px-1.75 py-0.75 text-[0.73rem]">{{ connectionMap[host]?.ip || '?' }}</span>
              <span class="rounded-full px-1.75 py-0.75 text-[0.73rem]" :class="badgeStatusClass(monitorAgent(host).state)">{{ t('sysmon.monitorAgentLabel', { label: monitorAgentLabel(host) }) }}</span>
              <span class="rounded-full px-1.75 py-0.75 text-[0.73rem]" :class="badgeStatusClass(connectionMap[host]?.status)">{{ serviceLabel(connectionMap[host]?.status) }}</span>
              <PbIcon :icon="collapsedHosts[host] ? PhCaretRight : PhCaretDown" aria-label="Toggle host details" />
            </header>
            <div v-if="!isHostCollapsed(host)" class="border-t border-border-default p-3">
              <div v-if="Object.keys(monitorAgent(host)).length" class="mb-3 grid gap-1.75 rounded-[5px] bg-card p-2.25 text-[0.8rem] text-primary"><div>{{ t('sysmon.collectorHeartbeat') }} {{ formatAge((monitorAgent(host).collector as Record<string, unknown>)?.generated_at || monitorAgent(host).generated_at) }}</div><div class="flex flex-wrap gap-1.5"><span v-for="file in agentFiles(host)" :key="file.name" class="rounded-[3px] px-1.25 py-0.5" :class="agentFileClass(file.state)">{{ file.name }}: {{ file.state }}</span></div></div>
              <div v-if="connectionMap[host]?.status !== 'connected'" class="pt-3.5 whitespace-pre-wrap break-words text-primary">{{ serviceLabel(connectionMap[host]?.status) }}<span v-if="connectionMap[host]?.error">: {{ connectionMap[host]?.error }}</span></div>
              <div v-else-if="!state?.system?.[host]" class="pt-3.5 whitespace-pre-wrap break-words text-primary">{{ t('sysmon.waitingSystemMetrics') }}</div>
              <div v-else class="grid grid-cols-[repeat(auto-fit,minmax(165px,1fr))] gap-2.25">
                <div v-for="metric in (['cpu', 'memory', 'disk', 'swap'] as const)" v-show="metric !== 'swap' || numberValue(state?.system?.[host]?.swap_total) > 0" :key="metric" class="cursor-pointer rounded-md border border-border-default bg-card p-2.5 hover:border-accent" :data-history-host="host" :data-history-metric="metric" @click="openHistory(host, metric)">
                  <div class="text-[0.76rem] text-secondary">{{ metricLabel(metric) }}</div><div class="mt-0.75 text-[1.2rem] font-bold" :style="{ color: pctColor(metricValue(state?.system?.[host], metric)) }">{{ metric === 'cpu' ? cpuDisplay(state?.system?.[host]).value : formatBytes(metric === 'memory' ? state?.system?.[host]?.mem_used : metric === 'disk' ? state?.system?.[host]?.disk_used : state?.system?.[host]?.swap_used) }}</div><div class="text-[0.72rem] text-secondary">{{ metric === 'cpu' ? cpuDisplay(state?.system?.[host]).sub : `${metricValue(state?.system?.[host], metric).toFixed(1)}%` }}</div><div class="mt-1.75 h-1.25 overflow-hidden rounded-full bg-border-strong"><div class="h-full" :style="{ width: `${Math.min(100, metricValue(state?.system?.[host], metric))}%`, background: pctColor(metricValue(state?.system?.[host], metric)) }"></div></div>
                </div>
              </div>
            </div>
          </article>
          <EmptyState
            v-if="!hosts.length"
            class="pt-3.5 whitespace-pre-wrap break-words text-primary"
            :title="t('sysmon.noVpsConfigured')"
          />
        </div>

        <div v-else-if="activeTab === 'instances'" class="min-h-0 flex-1 overflow-auto">
          <div class="mb-3.5 flex flex-wrap gap-3.75 text-[0.85rem] text-primary"><label>Server <select v-model="instanceServerFilter"><option>All</option><option v-for="host in hosts" :key="host">{{ host }}</option></select></label><label>{{ t('sysmon.version') }} <select v-model="instanceVersionFilter"><option>All</option><option>7</option><option>8</option><option>V7</option><option>V8</option></select></label><label><input v-model="instanceErrorsOnly" type="checkbox"> {{ t('sysmon.onlyWithErrors') }}</label><label><input v-model="instanceShowOther" type="checkbox"> {{ t('sysmon.showOther') }}</label></div>
          <table class="w-full max-[780px]:min-w-[850px] border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">Host</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.name') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.version') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.cpu') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.totalPnl') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.totalFills') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.status') }}</th><th class="sticky top-0 z-[1] border-b border-border-default bg-card px-1.75 py-2 text-left align-middle text-primary">{{ t('sysmon.action') }}</th></tr></thead><tbody><tr class="group" v-for="entry in visibleInstanceRows" :key="`${entry.host}:${instanceName(entry.row)}`"><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8">{{ entry.host }}</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8">{{ instanceName(entry.row) }}</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8">{{ instanceVersion(entry.row) }}</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8" :data-history-host="entry.host" :data-history-bot="instanceName(entry.row)" data-history-metric="cpu" @click="openHistory(entry.host, 'cpu', instanceName(entry.row))">{{ numberValue(entry.row.c || entry.row.cpu).toFixed(1) }}%</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8" :data-history-host="entry.host" :data-history-bot="instanceName(entry.row)" data-history-metric="pnl" @click="openHistory(entry.host, 'pnl', instanceName(entry.row))">{{ numberValue(entry.row.pt || entry.row.pnlToday || entry.row.pnl_hist_total).toFixed(2) }}</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8">{{ numberValue(entry.row.ct || entry.row.fillsToday).toLocaleString() }}</td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8"><span class="rounded-full px-1.75 py-0.75 text-[0.73rem]" :class="badgeStatusClass(entry.row.status || 'running')">{{ entry.row.status || t('sysmon.running') }}</span></td><td class="border-b border-border-default px-1.75 py-2 group-hover:bg-accent/8"><button data-action="view-instance-log" class="inline-flex cursor-pointer items-center gap-1.25 rounded-sm border-0 bg-secondary px-2 py-1.25 text-primary" @click="viewInstanceLog(entry.host, entry.row)">{{ t('sysmon.viewLog') }}</button> <button data-action="kill-instance" class="inline-flex cursor-pointer items-center gap-1.25 rounded-sm border-0 bg-danger-deep px-2 py-1.25 text-primary" @click="killInstance(entry.host, entry.row)"><PbIcon :icon="PhStop" /> {{ t('sysmon.restartKill') }}</button></td></tr></tbody></table><EmptyState v-if="!visibleInstanceRows.length" class="pt-3.5 whitespace-pre-wrap break-words text-primary" :title="t('sysmon.noInstances')" />
        </div>

        <div v-else-if="activeTab === 'services'" class="min-h-0 flex-1 overflow-auto"><div class="grid gap-2.5"><section v-for="host in serviceHosts" :key="host" class="overflow-hidden rounded-[7px] border border-border-default"><header class="flex cursor-pointer justify-between bg-card px-3 py-2.5 text-primary" @click="toggleServices(host)"><span>{{ host }}</span><PbIcon :icon="isServiceCollapsed(host) ? PhCaretRight : PhCaretDown" aria-label="Toggle service details" /></header><div v-if="!isServiceCollapsed(host)" class="grid gap-1.5 p-2.5"><div v-for="(check, service) in services[host]" :key="service" class="flex items-center justify-between gap-2.5 rounded-[5px] bg-card p-2"><div><div class="font-semibold">{{ service }}</div><div class="text-[0.78rem]" :class="serviceStatusClass(check.status)">{{ serviceLabel(check.status) }}<span v-if="check.pid"> (PID: {{ check.pid }})</span></div><div v-if="check.reason" class="text-[0.78rem] text-secondary">{{ check.reason }}</div><div v-if="check.error" class="text-[0.78rem] text-danger-soft">{{ check.error }}</div></div><button v-if="check.expected !== false && check.status !== 'disabled'" data-action="restart-service" class="inline-flex cursor-pointer items-center gap-1.25 rounded-sm border-0 bg-accent-deep px-2 py-1.25 text-primary" @click="restartService(host, String(service))"><PbIcon :icon="PhGear" /> {{ t('sysmon.restart') }}</button></div></div></section></div><EmptyState v-if="!serviceHosts.length" class="pt-3.5 whitespace-pre-wrap break-words text-primary" :title="t('sysmon.noServices')" /></div>

        <div v-else class="min-h-0 flex-1 overflow-auto"><div id="vps-log-viewer" class="h-full min-h-[420px]"></div></div>
      </section>
    </div>

    <div v-if="historyModal" data-modal="history" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true"><div class="flex max-h-[calc(100dvh-40px)] w-[min(1000px,calc(100vw-40px))] flex-col overflow-hidden rounded-lg bg-card p-4.5"><div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5"><h2 class="m-0 text-[1.05rem]">{{ metricTitle(historyModal.metric) }} — {{ historyModal.host }}</h2><button data-close="history" class="inline-flex cursor-pointer items-center gap-1.25 rounded-sm border-0 bg-accent-deep px-2 py-1.25 text-primary" @click="historyModal = null"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><div class="overflow-auto pt-3"><ErrorState v-if="historyModal.error" class="pt-3.5 whitespace-pre-wrap break-words text-primary" :title="t('common.error')" :message="historyModal.error" :retry-label="t('common.refresh')" @retry="openHistory(historyModal!.host, historyModal!.metric, historyModal!.bot)" /><LoadingSkeleton v-else-if="!historyModal.data" class="pt-3.5 whitespace-pre-wrap break-words text-primary" :label="t('common.loading')" /><template v-else><div class="w-full min-h-[120px] rounded-[5px] bg-page p-2"><svg viewBox="0 0 600 180" preserveAspectRatio="none" width="100%" height="180" role="img"><polyline v-if="currentHistoryValues.length" :points="currentHistoryPolyline" fill="none" stroke="#72a0ee" stroke-width="2" /></svg></div><div class="mt-2.5 flex flex-wrap gap-2 text-[0.78rem] text-primary"><span v-for="point in currentHistoryValues" :key="`${point.ts}:${point.value}`">{{ point.ts }}: {{ point.value }}</span></div></template></div></div></div>
    <div v-if="resultModal" data-modal="result" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true"><div class="flex max-h-[calc(100dvh-40px)] w-[min(1000px,calc(100vw-40px))] flex-col overflow-hidden rounded-lg bg-card p-4.5"><div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5"><h2 class="m-0 text-[1.05rem]">{{ resultModal.title }}</h2><button data-close="result" class="inline-flex cursor-pointer items-center gap-1.25 rounded-sm border-0 bg-accent-deep px-2 py-1.25 text-primary" @click="closeResult"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><div class="pt-3.5 whitespace-pre-wrap break-words text-primary">{{ resultModal.message }}</div></div></div>
  </div>
  </AppShell>
</template>

<style scoped>
/* Page-level AppShell overrides for the fixed-height workbench layout —
   ported from styles/vps-monitor.css at the Tailwind migration. These
   target AppShell internals (the classes live on elements the shared
   component renders), so they stay as CSS instead of utilities. */
.operations-shell--vps-monitor :deep(.app-shell__workspace) {
  display: flex;
  height: 100dvh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.operations-shell--vps-monitor :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  flex: 1;
  padding: 0;
}

.operations-shell--vps-monitor :deep(.app-shell__primary) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
</style>
