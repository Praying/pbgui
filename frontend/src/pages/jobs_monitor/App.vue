<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { PhCaretDown, PhCaretRight, PhPlay, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { Button } from '@/shared/components/ui/button';
import { jobsApiBase, jobsWsUrl } from './config';
import type { DownloaderRow, JobRecord, JobsTab } from './types';

const { t } = useI18n();

const params = new URLSearchParams(window.location.search);
const embedMode = params.get('embed') === '1';
const exchangeFilter = (params.get('exchange') || '').trim().toLowerCase();
const jobTypeFilter = (params.get('job_type') || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
const apiBase = jobsApiBase();

const activeJobs = ref<JobRecord[]>([]);
const historyJobs = ref<Record<Exclude<JobsTab, 'running'>, JobRecord[]>>({ done: [], failed: [] });
const currentTab = ref<JobsTab>('running');
const expandedJobs = ref<Set<string>>(new Set());
const downloaderLogCache = ref<Record<string, string[]>>({});
const downloaderLogFetches = new Set<string>();
const connection = ref<'connecting' | 'connected' | 'error' | 'polling'>('connecting');
const workerRunning = ref<boolean | null>(null);
const historyLoading = ref(false);
const historyError = ref('');
const socket = ref<WebSocket | null>(null);
const generation = ref(0);
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pollingTimer: ReturnType<typeof setInterval> | null = null;
let reconnectAttempts = 0;

const logModal = ref<{ jobId: string; text: string } | null>(null);
const detailsModal = ref<{ jobId: string; job: JobRecord | null; error: string } | null>(null);
const confirmModal = ref<{
  title: string;
  message: string;
  action: () => Promise<void>;
} | null>(null);

function numberValue(value: unknown): number {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatBytes(value: unknown): string {
  const bytes = numberValue(value);
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(2)} ${sizes[index]}`;
}

function formatCount(value: unknown): string {
  return Math.round(numberValue(value)).toLocaleString();
}

function formatDaysFromMinutes(value: unknown): string {
  const days = numberValue(value) / 1440;
  if (days >= 100) return Math.round(days).toLocaleString();
  if (days >= 10) return days.toFixed(1);
  return days.toFixed(2);
}

function formatTimestamp(value: unknown): string {
  if (!value) return '';
  const date = new Date(numberValue(value) * 1000);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDay(value: unknown): string {
  const day = String(value || '');
  return day.length === 8 ? `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}` : day;
}

function formatDurationSeconds(duration: number): string {
  const seconds = Math.max(0, Math.round(duration));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes) return `${minutes}m ${String(remainder).padStart(2, '0')}s`;
  return `${remainder}s`;
}

function formatJobDuration(job: JobRecord): string {
  const progress = job.progress || {};
  const lastResult = progress.last_result || {};
  const recorded = numberValue(lastResult.duration_s);
  if ((job.status === 'done' || job.status === 'failed') && recorded > 0) return formatDurationSeconds(recorded);
  const start = numberValue(job.run_started_ts) || numberValue(job.created_ts);
  let end = numberValue(job.finished_ts) || numberValue(job.updated_ts);
  if (job.status === 'running' && numberValue(job.run_started_ts)) end = Date.now() / 1000;
  return start > 0 && end >= start ? formatDurationSeconds(end - start) : '';
}

function calculateProgress(progress: JobRecord['progress']): number {
  if (!progress?.total) return 0;
  const step = numberValue(progress.step);
  const chunkDone = numberValue(progress.chunk_done);
  const chunkTotal = numberValue(progress.chunk_total) || 1;
  return Math.min(100, Math.max(0, Math.round(((step - 1 + chunkDone / chunkTotal) / numberValue(progress.total)) * 100)));
}

function inferExchange(job: JobRecord): string {
  const explicit = String(job.exchange || '').trim().toLowerCase();
  if (explicit) return explicit;
  const type = String(job.type || '').toLowerCase();
  if (type.startsWith('hl_') || type.includes('hyperliquid')) return 'hyperliquid';
  if (type.startsWith('binance_') || type.includes('binance')) return 'binanceusdm';
  if (type.startsWith('bybit_') || type.includes('bybit')) return 'bybit';
  if (type.startsWith('bitget_') || type.includes('bitget')) return 'bitget';
  return '';
}

function matchesFilters(job: JobRecord): boolean {
  if (jobTypeFilter.length && !jobTypeFilter.includes(String(job.type || '').toLowerCase())) return false;
  if (!exchangeFilter) return true;
  const exchange = inferExchange(job);
  return !exchange || exchange === exchangeFilter;
}

function compareActive(a: JobRecord, b: JobRecord): number {
  const aRunning = a.status === 'running';
  const bRunning = b.status === 'running';
  if (aRunning !== bRunning) return aRunning ? -1 : 1;
  const created = numberValue(a.created_ts) - numberValue(b.created_ts);
  return created || String(a.id || '').localeCompare(String(b.id || ''));
}

function filteredActive(jobs: JobRecord[]): JobRecord[] {
  return jobs.filter(matchesFilters).filter((job) => job.status === 'pending' || job.status === 'running').sort(compareActive);
}

function setActiveJobs(jobs: JobRecord[], worker?: boolean): void {
  activeJobs.value = filteredActive(Array.isArray(jobs) ? jobs : []);
  if (worker !== undefined) workerRunning.value = worker;
  else if (workerRunning.value === null && activeJobs.value.some((job) => job.status === 'running')) workerRunning.value = true;
  ensureDownloaderLogFallbacks(activeJobs.value);
}

function apiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.detail}`;
  return error instanceof Error ? error.message : String(error);
}

async function refreshActive(): Promise<void> {
  const data = await apiFetch<{ jobs?: JobRecord[]; worker_running?: boolean }>(`${apiBase}/?states=pending,running&limit=50${jobTypeFilter.length ? `&job_type=${encodeURIComponent(jobTypeFilter.join(','))}` : ''}`);
  setActiveJobs(data.jobs || [], data.worker_running);
}

function stopPolling(): void {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = null;
}

function startPolling(): void {
  if (pollingTimer) return;
  connection.value = 'polling';
  void refreshActive().catch(() => undefined);
  pollingTimer = setInterval(() => void refreshActive().catch(() => undefined), 2000);
}

function disconnectSocket(): void {
  generation.value += 1;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  stopPolling();
  const current = socket.value;
  socket.value = null;
  if (current) {
    current.onopen = null;
    current.onmessage = null;
    current.onerror = null;
    current.onclose = null;
    current.close();
  }
}

function connectSocket(): void {
  const currentGeneration = ++generation.value;
  connection.value = 'connecting';
  const ws = new WebSocket(jobsWsUrl());
  socket.value = ws;
  ws.onopen = () => {
    if (currentGeneration !== generation.value) return;
    connection.value = 'connected';
    reconnectAttempts = 0;
    stopPolling();
  };
  ws.onmessage = (event) => {
    if (currentGeneration !== generation.value) return;
    try {
      const message = JSON.parse(event.data) as { type?: string; data?: JobRecord[] };
      if (message.type === 'jobs') setActiveJobs(message.data || []);
    } catch {
      connection.value = 'error';
    }
  };
  ws.onerror = () => {
    if (currentGeneration === generation.value) connection.value = 'error';
  };
  ws.onclose = () => {
    if (currentGeneration !== generation.value) return;
    socket.value = null;
    connection.value = 'error';
    reconnectAttempts += 1;
    if (reconnectAttempts >= 5) {
      startPolling();
    } else if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
      }, 3000);
    }
  };
}

async function loadHistory(tab: Exclude<JobsTab, 'running'>): Promise<void> {
  historyLoading.value = true;
  historyError.value = '';
  try {
    const data = await apiFetch<{ jobs?: JobRecord[] }>(`${apiBase}/?states=${tab}&limit=50${jobTypeFilter.length ? `&job_type=${encodeURIComponent(jobTypeFilter.join(','))}` : ''}`);
    historyJobs.value[tab] = (data.jobs || []).filter(matchesFilters).sort((a, b) => numberValue(b.updated_ts) - numberValue(a.updated_ts));
  } catch (error) {
    historyError.value = apiError(error);
  } finally {
    historyLoading.value = false;
  }
}

function toggleExpanded(id: string): void {
  const next = new Set(expandedJobs.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedJobs.value = next;
}

function openConfirm(title: string, message: string, action: () => Promise<void>): void {
  confirmModal.value = { title, message, action };
}

function closeConfirm(): void {
  confirmModal.value = null;
}

async function acceptConfirm(): Promise<void> {
  const pending = confirmModal.value;
  confirmModal.value = null;
  if (pending) await pending.action();
}

function refreshCurrentHistory(): void {
  if (currentTab.value !== 'running') void loadHistory(currentTab.value);
}

function actionError(title: string, error: unknown): void {
  confirmModal.value = { title, message: apiError(error), action: async () => undefined };
}

function runJob(job: JobRecord): void {
  openConfirm(t('sysmon.run'), t('sysmon.runJobMsg', { id: job.id }), async () => {
    try { await apiFetch(`${apiBase}/${encodeURIComponent(job.id)}/run`, { method: 'POST' }); }
    catch (error) { actionError(t('sysmon.runFailed'), error); }
  });
}

function cancelJob(job: JobRecord): void {
  openConfirm(t('sysmon.cancelJob'), t('sysmon.cancelJobMsg', { id: job.id }), async () => {
    try { await apiFetch(`${apiBase}/cancel`, { method: 'POST', body: JSON.stringify({ job_id: job.id, reason: 'user cancel' }) }); }
    catch (error) { actionError(t('sysmon.cancelFailed'), error); }
  });
}

function deleteJob(job: JobRecord): void {
  openConfirm(t('sysmon.deleteJob'), t('sysmon.deleteJobMsg', { id: job.id }), async () => {
    try {
      const state = job.status === 'done' || job.status === 'failed' ? `?states=${encodeURIComponent(job.status)}` : '';
      await apiFetch(`${apiBase}/${encodeURIComponent(job.id)}${state}`, { method: 'DELETE' });
      refreshCurrentHistory();
    } catch (error) { actionError(t('sysmon.deleteFailed'), error); }
  });
}

function retryJob(job: JobRecord): void {
  openConfirm(t('sysmon.retryFailedJob'), t('sysmon.retryFailedJobMsg', { id: job.id }), async () => {
    try { await apiFetch(`${apiBase}/${encodeURIComponent(job.id)}/retry`, { method: 'POST' }); refreshCurrentHistory(); }
    catch (error) { actionError(t('sysmon.retryFailed'), error); }
  });
}

function requeueJob(job: JobRecord): void {
  openConfirm(t('sysmon.requeueJob'), t('sysmon.requeueJobMsg', { id: job.id }), async () => {
    try { await apiFetch(`${apiBase}/${encodeURIComponent(job.id)}/requeue`, { method: 'POST' }); refreshCurrentHistory(); }
    catch (error) { actionError(t('sysmon.requeueFailed'), error); }
  });
}

function deleteAll(tab: Exclude<JobsTab, 'running'>): void {
  const exchange = exchangeFilter;
  openConfirm(t('sysmon.deleteAllJobsTitle', { state: tab }), t('sysmon.deleteAllJobsMsg', { state: tab, exchange: exchange ? ` ${exchange}` : '' }), async () => {
    try {
      await apiFetch(`${apiBase}/bulk-delete`, { method: 'POST', body: JSON.stringify({ delete_all: true, state: tab, ...(exchange ? { exchange } : {}) }) });
      await loadHistory(tab);
    } catch (error) { actionError(t('sysmon.deleteFailed'), error); }
  });
}

async function showLog(job: JobRecord): Promise<void> {
  logModal.value = { jobId: job.id, text: t('common.loading') };
  try {
    const data = await apiFetch<{ log?: string[] }>(`${apiBase}/${encodeURIComponent(job.id)}/log?lines=500`);
    logModal.value.text = (data.log || []).join('\n') || t('sysmon.noLogFileFound');
  } catch (error) {
    logModal.value.text = `${t('sysmon.failedLoadLog')} ${apiError(error)}`;
  }
}

async function showDetails(job: JobRecord): Promise<void> {
  detailsModal.value = { jobId: job.id, job: null, error: '' };
  try {
    const data = await apiFetch<JobRecord>(`${apiBase}/${encodeURIComponent(job.id)}`);
    detailsModal.value.job = data;
    if (data.type === 'bitget_best_1m_distributed') {
      try {
        const logData = await apiFetch<{ log?: string[] }>(`${apiBase}/${encodeURIComponent(job.id)}/log?lines=0`);
        (data as JobRecord & { _logLines?: string[] })._logLines = logData.log || [];
      } catch { /* The job response remains useful without the optional log fallback. */ }
    }
  } catch (error) {
    detailsModal.value.error = `${t('sysmon.failedLoadJobDetailsMsg', { detail: apiError(error) })}`;
  }
}

function parsedHumanBytes(value: unknown): number {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/i);
  if (!match) return 0;
  const powers: Record<string, number> = { B: 0, KIB: 1, KB: 1, MIB: 2, MB: 2, GIB: 3, GB: 3, TIB: 4, TB: 4 };
  return Math.round(numberValue(match[1]) * 1024 ** (powers[match[2]!.toUpperCase()] || 0));
}

function parseDownloaderRowsFromLog(lines: string[]): DownloaderRow[] {
  const stats = new Map<string, DownloaderRow>();
  const active = new Map<string, { coin: string; range: string }>();
  for (const line of lines) {
    const text = String(line || '');
    const start = text.match(/^\S+\s+\S+\s+(.+?)\s+segment\s+coin=(\S+)\s+symbol=\S+\s+range=(\S+)/);
    if (start) { active.set(start[1]!.trim(), { coin: start[2]!, range: start[3]! }); continue; }
    const done = text.match(/^\S+\s+\S+\s+(.+?)\s+segment done\s+coin=\S+\s+pages=(\d+)\s+rows=(\d+)(?:\s+payload=([^\s]+(?:\s+[A-Za-z]+)?))?.*?minutes_written=(\d+)/);
    if (!done) continue;
    const host = done[1]!.trim();
    const current = stats.get(host) || { host, mode: '', status: 'from log', segments: 0, pages: 0, rows: 0, payloadBytes: 0, minutesWritten: 0, currentCoin: '', currentRange: '' };
    current.segments += 1; current.pages += numberValue(done[2]); current.rows += numberValue(done[3]); current.payloadBytes += parsedHumanBytes(done[4]); current.minutesWritten += numberValue(done[5]); stats.set(host, current); active.delete(host);
  }
  for (const [host, work] of active) stats.set(host, stats.get(host) || { host, mode: '', status: 'running', segments: 0, pages: 0, rows: 0, payloadBytes: 0, minutesWritten: 0, currentCoin: work.coin, currentRange: work.range });
  return [...stats.values()];
}

function downloaderRows(job: JobRecord): DownloaderRow[] {
  const result = (job.progress?.last_result || {}) as Record<string, unknown>;
  const raw = (Array.isArray(result.host_results) && result.host_results.length ? result.host_results : result.downloaders) as Record<string, unknown>[] | undefined;
  if (raw?.length) return raw.map((row) => ({
    host: String(row.host || row.hostname || 'Downloader'), mode: String(row.mode || ''), status: String(row.status || 'active'),
    segments: numberValue(row.segments), pages: numberValue(row.pages), rows: numberValue(row.rows), payloadBytes: numberValue(row.payload_bytes || row.payloadBytes), minutesWritten: numberValue(row.minutes_written || row.minutesWritten), currentCoin: String(row.current_coin || row.currentCoin || ''), currentRange: String(row.current_range || row.currentRange || ''),
  }));
  return parseDownloaderRowsFromLog(((job as JobRecord & { _logLines?: string[] })._logLines) || downloaderLogCache.value[job.id] || []);
}

function ensureDownloaderLogFallbacks(jobs: JobRecord[]): void {
  for (const job of jobs) {
    const result = (job.progress?.last_result || {}) as Record<string, unknown>;
    const hasRows = (Array.isArray(result.host_results) && result.host_results.length > 0) || (Array.isArray(result.downloaders) && result.downloaders.length > 0);
    if (job.type !== 'bitget_best_1m_distributed' || hasRows || downloaderLogFetches.has(job.id) || downloaderLogCache.value[job.id]) continue;
    downloaderLogFetches.add(job.id);
    void apiFetch<{ log?: string[] }>(`${apiBase}/${encodeURIComponent(job.id)}/log?lines=0`)
      .then((data) => { downloaderLogCache.value = { ...downloaderLogCache.value, [job.id]: data.log || [] }; })
      .catch(() => undefined)
      .finally(() => downloaderLogFetches.delete(job.id));
  }
}

/* Status → Tailwind utility mapping (the former jobs-monitor.css carried the
   same connected/running · connecting/pending · error/failed badge tints).
   Returns the FULL colour set so the static pbgui-badge base never fights
   a dynamic class. */
function statusClass(job: JobRecord): string {
  if (job.status === 'running') return 'border-success/28 bg-success/13 text-success-soft';
  if (job.status === 'failed') return 'border-danger/28 bg-danger/13 text-danger-soft';
  return 'border-warning/28 bg-warning/14 text-warning-soft';
}

const visibleHistory = computed(() => currentTab.value === 'running' ? [] : historyJobs.value[currentTab.value]);
const workerLabel = computed(() => workerRunning.value === true ? t('sysmon.running') : workerRunning.value === false ? t('sysmon.stopped') : t('sysmon.workerUnknown'));
const workerTitle = computed(() => t('sysmon.workerUnknown').replace(/[:：].*$/, ''));
const connectionLabel = computed(() => connection.value === 'connected' ? t('sysmon.connected') : connection.value === 'polling' ? t('sysmon.polling') : connection.value === 'connecting' ? t('sysmon.connecting') : t('sysmon.disconnected'));

function switchTab(tab: JobsTab): void {
  currentTab.value = tab;
  if (tab !== 'running' && !historyJobs.value[tab].length) void loadHistory(tab);
}

function detailRows(job: JobRecord): Array<{ label: string; value: string }> {
  const payload = job.payload || {};
  const progress = job.progress || {};
  const range = payload.start_day || payload.end_day ? `${formatDay(payload.start_day || '')} → ${formatDay(payload.end_day || '')}` : '';
  return [
    { label: t('sysmon.status'), value: String(job.status || '') }, { label: t('sysmon.type'), value: String(job.type || '') }, { label: t('sysmon.exchange'), value: String(job.exchange || '') },
    { label: t('sysmon.created'), value: formatTimestamp(job.created_ts) }, { label: t('sysmon.updated'), value: formatTimestamp(job.updated_ts) }, { label: t('sysmon.duration'), value: formatJobDuration(job) },
    { label: t('sysmon.coins'), value: Array.isArray(payload.coins) ? payload.coins.join(', ') : '' }, { label: t('sysmon.rangeLabel'), value: range }, { label: t('sysmon.currentCoin'), value: String(progress.coin || '') },
    { label: t('sysmon.currentChunk'), value: progress.chunk_start ? `${progress.chunk_start} → ${progress.chunk_end || ''}` : '' }, { label: t('sysmon.stageLabel'), value: String(progress.stage || '') },
    { label: t('sysmon.stepLabel'), value: progress.total ? `${progress.step || 0}/${progress.total}` : '' }, { label: t('sysmon.chunkProgressLabel'), value: progress.chunk_total ? `${progress.chunk_done || 0}/${progress.chunk_total}` : '' },
    { label: t('common.error'), value: String(job.error || '') },
  ].filter((row) => row.value !== '');
}

function jsonText(value: unknown): string {
  return JSON.stringify(value || {}, null, 2);
}

function payloadCoins(job: JobRecord): string {
  return Array.isArray(job.payload?.coins) ? job.payload.coins.map(String).join(', ') : '';
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (confirmModal.value) closeConfirm();
  else if (logModal.value) logModal.value = null;
  else if (detailsModal.value) detailsModal.value = null;
}

onMounted(() => {
  document.title = t('sysmon.jobMonitorTitle');
  if (embedMode) {
    document.documentElement.classList.add('is-embedded');
    document.body.classList.add('is-embedded');
  }
  window.addEventListener('keydown', handleKeydown);
  connectSocket();
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (embedMode) {
    document.documentElement.classList.remove('is-embedded');
    document.body.classList.remove('is-embedded');
  }
  disconnectSocket();
});
</script>

<template>
  <AppShell
    class="operations-shell operations-shell--jobs"
    page-key="system_services"
    :page-title="t('sysmon.jobMonitor')"
  >
    <template #status>
      <div class="flex flex-wrap gap-2">
        <StatusStrip
          data-status="connection"
          :label="t('sysmon.status')"
          :value="connectionLabel"
          :tone="connection === 'connected' ? 'success' : connection === 'error' ? 'danger' : 'warning'"
        />
        <StatusStrip
          data-status="worker"
          :label="workerTitle"
          :value="workerLabel"
          :tone="workerRunning === true ? 'success' : workerRunning === false ? 'danger' : 'warning'"
        />
      </div>
    </template>

  <div class="min-h-0 bg-page text-primary" :class="embedMode ? 'p-3' : ''">
    <div class="mx-auto max-w-[1400px]">
      <nav class="pbgui-tab-bar mb-4 gap-1.5" aria-label="Job tabs">
        <button v-for="tab in (['running', 'done', 'failed'] as JobsTab[])" :key="tab" class="pbgui-tab px-3.5 py-2.5" :class="{ active: currentTab === tab }" :data-tab="tab" @click="switchTab(tab)">
          {{ tab === 'running' ? t('sysmon.active') : tab === 'done' ? t('sysmon.done') : t('sysmon.failedTab') }}
        </button>
      </nav>

      <section v-for="tab in (['running', 'done', 'failed'] as JobsTab[])" v-show="currentTab === tab" :key="tab" class="jobs-tab-panel" :class="{ active: currentTab === tab }">
        <div v-if="tab !== 'running'" class="mb-2.5 flex justify-end"><Button data-action="delete-all" type="button" variant="danger" size="sm" @click="deleteAll(tab)">{{ tab === 'done' ? t('sysmon.deleteAllDoneJobs') : t('sysmon.deleteAllFailedJobs') }}</Button></div>
        <LoadingSkeleton
          v-if="currentTab === tab && tab !== 'running' && historyLoading"
          class="px-6 p-12 text-center text-secondary"
          :label="t('common.loading')"
        />
        <ErrorState
          v-else-if="currentTab === tab && tab !== 'running' && historyError"
          class="px-6 p-12 text-center text-danger-soft"
          :title="t('sysmon.failedLoadJobs', { state: tab })"
          :message="historyError"
          :retry-label="t('common.refresh')"
          @retry="loadHistory(tab)"
        />
        <EmptyState
          v-else-if="currentTab === tab && !((tab === 'running' ? activeJobs : historyJobs[tab]).length)"
          class="px-6 p-12 text-center text-secondary"
          :title="t('sysmon.noJobs', { state: tab === 'running' ? t('sysmon.active') : tab })"
        />
        <div v-else class="grid gap-2.5">
          <article v-for="job in (tab === 'running' ? activeJobs : historyJobs[tab])" :key="job.id" class="rounded-lg border border-border-default bg-card p-3.5 transition-colors duration-[120ms] ease-standard hover:border-border-strong">
            <div class="flex items-start justify-between gap-3 max-[760px]:flex-col">
              <div class="flex min-w-0 flex-wrap items-center gap-2">
                <strong class="break-all font-mono text-sm text-primary">{{ job.id }}</strong>
                <span class="pbgui-badge border-secondary/20 bg-secondary/10 px-2.5 py-0.75 text-secondary" :class="statusClass(job)">{{ job.status }}</span>
                <span class="text-sm text-secondary">{{ job.type }}</span>
                <span v-if="formatJobDuration(job)" class="text-sm text-secondary">{{ formatJobDuration(job) }}</span>
              </div>
              <div class="flex flex-wrap justify-end gap-1.5 max-[760px]:justify-start">
                <Button v-if="tab === 'running' && job.status === 'pending'" data-action="run" type="button" variant="success" size="sm" @click="runJob(job)"><PbIcon :icon="PhPlay" /> {{ t('sysmon.run') }}</Button>
                <Button v-if="tab === 'running' && job.status === 'running'" data-action="cancel" type="button" variant="danger" size="sm" @click="cancelJob(job)">{{ t('sysmon.cancelJob') }}</Button>
                <Button data-action="details" type="button" variant="default" size="sm" @click="showDetails(job)">{{ t('sysmon.view') }}</Button>
                <Button data-action="log" type="button" variant="info" size="sm" @click="showLog(job)">{{ t('sysmon.log') }}</Button>
                <Button v-if="tab === 'failed'" data-action="retry" type="button" variant="default" size="sm" @click="retryJob(job)">{{ t('sysmon.retry') }}</Button>
                <Button v-if="tab === 'done'" data-action="requeue" type="button" variant="default" size="sm" @click="requeueJob(job)">{{ t('sysmon.requeue') }}</Button>
                <Button data-action="delete" type="button" variant="danger" size="sm" @click="deleteJob(job)">{{ t('common.delete') }}</Button>
              </div>
            </div>
            <div class="job-meta"><span>{{ formatTimestamp(job.updated_ts) }}</span><span v-if="job.exchange">{{ job.exchange }}</span></div>
            <div v-if="job.error" class="mt-2 whitespace-pre-wrap break-words text-sm text-danger-soft">{{ job.error }}</div>
            <div v-if="job.progress?.total" class="mt-3">
              <div class="h-1.75 overflow-hidden rounded-full bg-secondary/16"><div class="h-full rounded-full bg-accent transition-[width] duration-[260ms] ease-standard" :style="{ width: `${calculateProgress(job.progress)}%` }"></div></div>
              <div class="mt-1.25 text-xs text-primary">{{ t('sysmon.progress') }}: {{ calculateProgress(job.progress) }}% <span v-if="job.progress.stage">· {{ job.progress.stage }}</span><span v-if="job.progress.coin">· {{ job.progress.coin }}</span></div>
            </div>
            <div v-if="job.payload || job.progress" class="mt-2.5">
              <Button type="button" variant="ghost" size="sm" :aria-expanded="expandedJobs.has(job.id)" @click="toggleExpanded(job.id)"><PbIcon :icon="expandedJobs.has(job.id) ? PhCaretDown : PhCaretRight" /> {{ t('sysmon.details') }}</Button>
              <div class="mt-2 rounded-md border border-border-subtle bg-page p-2.5" :class="expandedJobs.has(job.id) ? 'grid gap-1.25' : 'hidden'">
                <div v-if="payloadCoins(job)">{{ t('sysmon.coinsLabel') }} {{ payloadCoins(job) }}</div>
                <div v-if="job.progress?.chunk_start">{{ t('sysmon.chunk') }} {{ job.progress.chunk_start }} → {{ job.progress.chunk_end }}</div>
                <div>{{ t('sysmon.downloadsLabel') }} {{ formatCount(job.progress?.downloaded_total) }} · {{ formatBytes(job.progress?.downloaded_bytes_total) }}</div>
                <div>{{ t('sysmon.skippedLabel') }} {{ formatCount(job.progress?.skipped_existing_total) }} · {{ formatBytes(job.progress?.skipped_existing_bytes_total) }}</div>
                <div>{{ t('sysmon.failedLabel') }} {{ formatCount(job.progress?.failed_total) }} · {{ formatBytes(job.progress?.failed_bytes_total) }}</div>
                <div v-if="downloaderRows(job).length" class="mt-2.5 grid gap-2"><div v-for="row in downloaderRows(job)" :key="row.host" class="rounded-md border border-border-subtle bg-page p-2.5"><div class="flex justify-between gap-2"><span class="font-semibold">{{ row.host }}</span><span class="text-xs tabular-nums text-primary">{{ row.status || row.mode }}</span></div><div class="h-1.75 overflow-hidden rounded-full bg-secondary/16"><div class="h-full rounded-full bg-accent transition-[width] duration-[260ms] ease-standard" :style="{ width: `${Math.max(3, Math.min(100, row.payloadBytes || row.rows || row.pages || row.segments))}%` }"></div></div><div class="mt-2 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-1.5 text-xs tabular-nums"><span><span class="text-secondary">{{ t('sysmon.payload') }}</span> {{ formatBytes(row.payloadBytes) }}</span><span><span class="text-secondary">{{ t('sysmon.rows') }}</span> {{ formatCount(row.rows) }}</span><span><span class="text-secondary">{{ t('sysmon.pages') }}</span> {{ formatCount(row.pages) }}</span><span><span class="text-secondary">{{ t('sysmon.segments') }}</span> {{ formatCount(row.segments) }}</span><span><span class="text-secondary">{{ t('sysmon.written') }}</span> {{ formatDaysFromMinutes(row.minutesWritten) }} {{ t('sysmon.days') }}</span><span v-if="row.currentCoin" class="col-span-full text-accent-soft">{{ t('sysmon.currentLabel', { v: `${row.currentCoin} ${row.currentRange}` }) }}</span></div></div></div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="logModal" data-modal="log" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true">
      <div class="flex max-h-[calc(100dvh-40px)] flex-col overflow-hidden rounded-lg border border-border-default bg-panel p-5 shadow-modal w-[min(900px,calc(100vw-40px))]"><div class="flex items-center justify-between gap-3 border-b border-border-subtle pb-3"><h2 class="m-0 break-all text-lg">{{ t('sysmon.jobLog') }} {{ logModal.jobId }}</h2><Button data-close="log" type="button" variant="danger" size="sm" @click="logModal = null"><PbIcon :icon="PhX" /> {{ t('common.close') }}</Button></div><div class="overflow-auto pt-3.5"><pre class="min-h-[240px] whitespace-pre-wrap break-words rounded-sm bg-page p-3 font-mono text-[0.82rem] leading-[1.45] text-primary">{{ logModal.text }}</pre></div></div>
    </div>

    <div v-if="detailsModal" data-modal="details" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true">
      <div class="flex max-h-[calc(100dvh-40px)] flex-col overflow-hidden rounded-lg border border-border-default bg-panel p-5 shadow-modal w-[min(900px,calc(100vw-40px))]"><div class="flex items-center justify-between gap-3 border-b border-border-subtle pb-3"><h2 class="m-0 break-all text-lg">{{ t('sysmon.jobDetails') }} {{ detailsModal.jobId }}</h2><Button data-close="details" type="button" variant="danger" size="sm" @click="detailsModal = null"><PbIcon :icon="PhX" /> {{ t('common.close') }}</Button></div><div class="overflow-auto pt-3.5"><ErrorState v-if="detailsModal.error" class="px-6 p-12 text-center text-danger-soft" :title="t('common.error')" :message="detailsModal.error" /><LoadingSkeleton v-else-if="!detailsModal.job" class="px-6 p-12 text-center text-secondary" :label="t('common.loading')" /><template v-else><section class="mb-3 grid gap-2 rounded-md border border-border-subtle bg-card p-3"><h3 class="m-0 text-md">{{ t('sysmon.summary') }}</h3><div class="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-2.5 gap-y-1.25 text-sm"><template v-for="row in detailRows(detailsModal.job)" :key="row.label"><span class="font-semibold text-secondary">{{ row.label }}</span><span class="min-w-0 break-words">{{ row.value }}</span></template></div></section><section v-if="downloaderRows(detailsModal.job).length" class="mb-3 grid gap-2 rounded-md border border-border-subtle bg-card p-3"><h3 class="m-0 text-md">{{ t('sysmon.downloaderTraffic') }}</h3><div class="mt-2.5 grid gap-2"><div v-for="row in downloaderRows(detailsModal.job)" :key="row.host" class="rounded-md border border-border-subtle bg-page p-2.5"><div class="flex justify-between gap-2"><span class="font-semibold">{{ row.host }}</span><span>{{ row.status }}</span></div><div class="mt-2 grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-1.5 text-xs tabular-nums"><span>{{ t('sysmon.payload') }} {{ formatBytes(row.payloadBytes) }}</span><span>{{ t('sysmon.rows') }} {{ formatCount(row.rows) }}</span><span>{{ t('sysmon.pages') }} {{ formatCount(row.pages) }}</span></div></div></div></section><section class="mb-3 grid gap-2 rounded-md border border-border-subtle bg-card p-3"><h3 class="m-0 text-md">{{ t('sysmon.payload') }}</h3><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-page p-2.5 font-mono text-[0.78rem] leading-[1.4] text-primary">{{ jsonText(detailsModal.job.payload) }}</pre></section><section class="mb-3 grid gap-2 rounded-md border border-border-subtle bg-card p-3"><h3 class="m-0 text-md">{{ t('sysmon.progress') }}</h3><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-sm bg-page p-2.5 font-mono text-[0.78rem] leading-[1.4] text-primary">{{ jsonText(detailsModal.job.progress) }}</pre></section></template></div></div>
    </div>

    <div v-if="confirmModal" data-modal="confirm" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true" @click.stop>
      <div class="flex max-h-[calc(100dvh-40px)] flex-col overflow-hidden rounded-lg border border-border-default bg-panel p-5 shadow-modal w-[min(520px,calc(100vw-40px))]"><div class="flex items-center justify-between gap-3 border-b border-border-subtle pb-3"><h2 class="m-0 break-all text-lg">{{ confirmModal.title }}</h2><Button data-confirm="cancel" type="button" variant="default" size="sm" @click="closeConfirm">{{ t('common.cancel') }}</Button></div><div class="overflow-auto pt-3.5"><p>{{ confirmModal.message }}</p><div class="mt-4.5 flex justify-end gap-2"><Button data-confirm="cancel" type="button" variant="default" size="sm" @click="closeConfirm">{{ t('common.cancel') }}</Button><Button data-confirm="accept" type="button" variant="info" size="sm" @click="acceptConfirm">{{ t('common.confirm') }}</Button></div></div></div>
    </div>
  </div>
  </AppShell>
</template>

<style>
/* Embed-mode rules ported from styles/jobs-monitor.css — the is-embedded
   class lands on <html>/<body>, which carry no scope attribute, so these
   must live in an unscoped block. */
html.is-embedded .operations-shell--jobs {
  display: block;
  min-height: 0;
}

html.is-embedded .operations-shell--jobs .workbench-rail,
html.is-embedded .operations-shell--jobs .workspace-header,
html.is-embedded .operations-shell--jobs .pbgui-skip-link {
  display: none;
}

html.is-embedded .operations-shell--jobs .app-shell__main {
  width: 100%;
  max-width: none;
  padding: 0;
}
</style>
