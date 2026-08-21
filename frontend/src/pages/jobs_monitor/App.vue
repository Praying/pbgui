<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
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

function statusClass(job: JobRecord): string {
  return job.status === 'running' ? 'running' : job.status === 'failed' ? 'failed' : 'pending';
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
  <main class="jobs-monitor" :class="{ 'is-embedded': embedMode }">
    <div class="jobs-shell">
      <header class="jobs-header">
        <h1>{{ t('sysmon.jobMonitor') }}</h1>
        <div class="jobs-status">
          <span data-status="connection" class="jobs-badge pbgui-badge" :class="connection">{{ connectionLabel }}</span>
          <span data-status="worker" class="jobs-badge pbgui-badge" :class="workerRunning === true ? 'running' : workerRunning === false ? 'error' : 'pending'">{{ workerTitle }}: {{ workerLabel }}</span>
        </div>
      </header>

      <nav class="jobs-tabs pbgui-tab-bar" aria-label="Job tabs">
        <button v-for="tab in (['running', 'done', 'failed'] as JobsTab[])" :key="tab" class="jobs-tab pbgui-tab" :class="{ active: currentTab === tab }" :data-tab="tab" @click="switchTab(tab)">
          {{ tab === 'running' ? t('sysmon.active') : tab === 'done' ? t('sysmon.done') : t('sysmon.failedTab') }}
        </button>
      </nav>

      <section v-for="tab in (['running', 'done', 'failed'] as JobsTab[])" v-show="currentTab === tab" :key="tab" class="jobs-tab-panel" :class="{ active: currentTab === tab }">
        <div v-if="tab !== 'running'" class="jobs-tab-actions"><button data-action="delete-all" class="job-btn danger" @click="deleteAll(tab)">{{ tab === 'done' ? t('sysmon.deleteAllDoneJobs') : t('sysmon.deleteAllFailedJobs') }}</button></div>
        <div v-if="tab !== 'running' && historyLoading" class="jobs-empty">{{ t('common.loading') }}</div>
        <div v-else-if="tab !== 'running' && historyError" class="jobs-error">{{ t('sysmon.failedLoadJobs', { state: tab }) }} {{ historyError }}</div>
        <div v-else-if="!((tab === 'running' ? activeJobs : historyJobs[tab]).length)" class="jobs-empty">{{ t('sysmon.noJobs', { state: tab === 'running' ? t('sysmon.active') : tab }) }}</div>
        <div v-else class="jobs-list">
          <article v-for="job in (tab === 'running' ? activeJobs : historyJobs[tab])" :key="job.id" class="job-card">
            <div class="job-header">
              <div class="job-info">
                <strong class="job-id">{{ job.id }}</strong>
                <span class="jobs-badge pbgui-badge" :class="statusClass(job)">{{ job.status }}</span>
                <span class="job-type">{{ job.type }}</span>
                <span v-if="formatJobDuration(job)" class="job-detail">{{ formatJobDuration(job) }}</span>
              </div>
              <div class="job-actions">
                <button v-if="tab === 'running' && job.status === 'pending'" data-action="run" class="job-btn run" @click="runJob(job)">{{ t('sysmon.run') }}</button>
                <button v-if="tab === 'running' && job.status === 'running'" data-action="cancel" class="job-btn danger" @click="cancelJob(job)">{{ t('sysmon.cancelJob') }}</button>
                <button data-action="details" class="job-btn view" @click="showDetails(job)">{{ t('sysmon.view') }}</button>
                <button data-action="log" class="job-btn" @click="showLog(job)">{{ t('sysmon.log') }}</button>
                <button v-if="tab === 'failed'" data-action="retry" class="job-btn secondary" @click="retryJob(job)">{{ t('sysmon.retry') }}</button>
                <button v-if="tab === 'done'" data-action="requeue" class="job-btn secondary" @click="requeueJob(job)">{{ t('sysmon.requeue') }}</button>
                <button data-action="delete" class="job-btn danger" @click="deleteJob(job)">{{ t('common.delete') }}</button>
              </div>
            </div>
            <div class="job-meta"><span>{{ formatTimestamp(job.updated_ts) }}</span><span v-if="job.exchange">{{ job.exchange }}</span></div>
            <div v-if="job.error" class="job-error">{{ job.error }}</div>
            <div v-if="job.progress?.total" class="job-progress">
              <div class="job-progress-track"><div class="job-progress-fill" :style="{ width: `${calculateProgress(job.progress)}%` }"></div></div>
              <div class="job-progress-label">{{ t('sysmon.progress') }}: {{ calculateProgress(job.progress) }}% <span v-if="job.progress.stage">· {{ job.progress.stage }}</span><span v-if="job.progress.coin">· {{ job.progress.coin }}</span></div>
            </div>
            <div v-if="job.payload || job.progress" class="job-expander">
              <button @click="toggleExpanded(job.id)">{{ expandedJobs.has(job.id) ? '▼' : '▶' }} {{ t('sysmon.details') }}</button>
              <div class="job-expander-body" :class="{ open: expandedJobs.has(job.id) }">
                <div v-if="payloadCoins(job)">{{ t('sysmon.coinsLabel') }} {{ payloadCoins(job) }}</div>
                <div v-if="job.progress?.chunk_start">{{ t('sysmon.chunk') }} {{ job.progress.chunk_start }} → {{ job.progress.chunk_end }}</div>
                <div>{{ t('sysmon.downloadsLabel') }} {{ formatCount(job.progress?.downloaded_total) }} · {{ formatBytes(job.progress?.downloaded_bytes_total) }}</div>
                <div>{{ t('sysmon.skippedLabel') }} {{ formatCount(job.progress?.skipped_existing_total) }} · {{ formatBytes(job.progress?.skipped_existing_bytes_total) }}</div>
                <div>{{ t('sysmon.failedLabel') }} {{ formatCount(job.progress?.failed_total) }} · {{ formatBytes(job.progress?.failed_bytes_total) }}</div>
                <div v-if="downloaderRows(job).length" class="downloader-list"><div v-for="row in downloaderRows(job)" :key="row.host" class="downloader-card"><div class="downloader-head"><span class="downloader-name">{{ row.host }}</span><span class="downloader-badge">{{ row.status || row.mode }}</span></div><div class="downloader-meter"><div class="downloader-meter-fill" :style="{ width: `${Math.max(3, Math.min(100, row.payloadBytes || row.rows || row.pages || row.segments))}%` }"></div></div><div class="downloader-stats"><span><span class="downloader-stat-label">{{ t('sysmon.payload') }}</span> {{ formatBytes(row.payloadBytes) }}</span><span><span class="downloader-stat-label">{{ t('sysmon.rows') }}</span> {{ formatCount(row.rows) }}</span><span><span class="downloader-stat-label">{{ t('sysmon.pages') }}</span> {{ formatCount(row.pages) }}</span><span><span class="downloader-stat-label">{{ t('sysmon.segments') }}</span> {{ formatCount(row.segments) }}</span><span><span class="downloader-stat-label">{{ t('sysmon.written') }}</span> {{ formatDaysFromMinutes(row.minutesWritten) }} {{ t('sysmon.days') }}</span><span v-if="row.currentCoin" class="downloader-current">{{ t('sysmon.currentLabel', { v: `${row.currentCoin} ${row.currentRange}` }) }}</span></div></div></div>
              </div>
            </div>
          </article>
        </div>
      </section>
    </div>

    <div v-if="logModal" data-modal="log" class="modal" role="dialog" aria-modal="true">
      <div class="modal-card"><div class="modal-header"><h2>{{ t('sysmon.jobLog') }} {{ logModal.jobId }}</h2><button data-close="log" class="job-btn danger" @click="logModal = null">{{ t('common.close') }}</button></div><div class="modal-body"><pre class="log-body">{{ logModal.text }}</pre></div></div>
    </div>

    <div v-if="detailsModal" data-modal="details" class="modal" role="dialog" aria-modal="true">
      <div class="modal-card"><div class="modal-header"><h2>{{ t('sysmon.jobDetails') }} {{ detailsModal.jobId }}</h2><button data-close="details" class="job-btn danger" @click="detailsModal = null">{{ t('common.close') }}</button></div><div class="modal-body"><div v-if="detailsModal.error" class="jobs-error">{{ detailsModal.error }}</div><div v-else-if="!detailsModal.job">{{ t('common.loading') }}</div><template v-else><section class="details-section"><h3>{{ t('sysmon.summary') }}</h3><div class="details-kv"><template v-for="row in detailRows(detailsModal.job)" :key="row.label"><span class="details-key">{{ row.label }}</span><span class="details-value">{{ row.value }}</span></template></div></section><section v-if="downloaderRows(detailsModal.job).length" class="details-section"><h3>{{ t('sysmon.downloaderTraffic') }}</h3><div class="downloader-list"><div v-for="row in downloaderRows(detailsModal.job)" :key="row.host" class="downloader-card"><div class="downloader-head"><span class="downloader-name">{{ row.host }}</span><span>{{ row.status }}</span></div><div class="downloader-stats"><span>{{ t('sysmon.payload') }} {{ formatBytes(row.payloadBytes) }}</span><span>{{ t('sysmon.rows') }} {{ formatCount(row.rows) }}</span><span>{{ t('sysmon.pages') }} {{ formatCount(row.pages) }}</span></div></div></div></section><section class="details-section"><h3>{{ t('sysmon.payload') }}</h3><pre class="json-block">{{ jsonText(detailsModal.job.payload) }}</pre></section><section class="details-section"><h3>{{ t('sysmon.progress') }}</h3><pre class="json-block">{{ jsonText(detailsModal.job.progress) }}</pre></section></template></div></div>
    </div>

    <div v-if="confirmModal" data-modal="confirm" class="modal" role="dialog" aria-modal="true" @click.stop>
      <div class="modal-card confirm-card"><div class="modal-header"><h2>{{ confirmModal.title }}</h2><button data-confirm="cancel" class="job-btn secondary" @click="closeConfirm">{{ t('common.cancel') }}</button></div><div class="modal-body"><p>{{ confirmModal.message }}</p><div class="confirm-actions"><button data-confirm="cancel" class="job-btn secondary" @click="closeConfirm">{{ t('common.cancel') }}</button><button data-confirm="accept" class="job-btn" @click="acceptConfirm">{{ t('common.confirm') }}</button></div></div></div>
    </div>
  </main>
</template>
