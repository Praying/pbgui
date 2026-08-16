/*
 * The inline job monitors — the reactive port of hl_data_actions.html
 * connectWS (:1644-1689), the tab/history engine (:1633-1641, :1752-1767),
 * the job actions (:1906-2009) and the modal (:1929-1971). One monitor per
 * section (dl/build), each bound to its JOB_TYPES entry (:1617).
 */

import { ref, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { apiUrl, jobsWsUrl } from '../config';
import { compareActiveJobs } from '../lib/jobsFormat';
import { JOB_TYPES, type JobRecord, type SectionNs } from '../types';

const HISTORY_LIMIT = 20; // :1758
const WS_MAX_RETRIES = 5; // :1680
const WS_RETRY_DELAY_MS = 3000;
export type MonitorTab = 'running' | 'done' | 'failed';
export type WsBadge = 'connecting' | 'connected' | 'disconnected';

export interface ModalState {
  active: boolean;
  title: string;
  kind: 'log' | 'details' | 'error';
  bodyText: string;
  detailsJob: JobRecord | null;
}

export interface UseJobsMonitor {
  badge: Ref<WsBadge>;
  activeJobs: Ref<JobRecord[]>;
  currentTab: Ref<MonitorTab>;
  historyJobs: Ref<JobRecord[]>;
  historyLoading: Ref<boolean>;
  historyError: Ref<string>;
  expandedJobs: Ref<Set<string>>;
  modal: Ref<ModalState>;
  connect(): void;
  disconnect(): void;
  switchTab(tab: MonitorTab): void;
  loadHistory(tab: MonitorTab): Promise<void>;
  reloadCurrentHistory(): void;
  toggleExpanded(jobId: string): void;
  runJob(jobId: string): Promise<void>;
  cancelJob(jobId: string): Promise<void>;
  deleteJob(jobId: string): Promise<void>;
  retryJob(jobId: string): Promise<void>;
  requeueJob(jobId: string): Promise<void>;
  showLog(jobId: string): Promise<void>;
  showJobDetails(jobId: string): Promise<void>;
  closeModal(): void;
  /** Test seam: feed a WS jobs message. */
  ingestJobsMessage(jobs: JobRecord[]): void;
}

export function useJobsMonitor(options: {
  ns: SectionNs;
  t: (key: string, params?: Record<string, unknown>) => string;
  /** Notified after a history-mutating action so sibling monitors reload too
   *  (legacy deleteJob/retryJob/requeueJob iterated both sections :2000-2008). */
  onHistoryMutation?: (tab: MonitorTab) => void;
  wsFactory?: (url: string) => WebSocket | null;
}): UseJobsMonitor {
  const t = options.t;
  const jobType = JOB_TYPES[options.ns];

  const badge = ref<WsBadge>('connecting');
  const activeJobs = ref<JobRecord[]>([]);
  const currentTab = ref<MonitorTab>('running');
  const historyJobs = ref<JobRecord[]>([]);
  const historyLoading = ref(false);
  const historyError = ref('');
  const expandedJobs = ref<Set<string>>(new Set());
  const modal = ref<ModalState>({ active: false, title: '', kind: 'log', bodyText: '', detailsJob: null });

  let ws: WebSocket | null = null;
  let wsRetryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  /* ── WS (:1644-1689) ── */

  function setBadge(state: WsBadge): void {
    badge.value = state;
  }

  function connect(): void {
    const factory = options.wsFactory ?? ((url: string) => new WebSocket(url));
    try {
      ws = factory(jobsWsUrl());
      if (!ws) return;
    } catch {
      setBadge('disconnected'); // catch branch :1683-1688
      return;
    }
    ws.onopen = () => {
      wsRetryCount = 0; // :1650
      setBadge('connected');
    };
    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(String(evt.data)) as { type?: string; data?: JobRecord[] };
        if (msg.type === 'jobs') ingestJobsMessage(msg.data || []);
      } catch {
        /* ignore malformed frames (:1673) */
      }
    };
    ws.onclose = () => {
      setBadge('disconnected'); // :1676-1679
      if (wsRetryCount < WS_MAX_RETRIES) {
        wsRetryCount += 1;
        retryTimer = setTimeout(connect, WS_RETRY_DELAY_MS);
      }
    };
    ws.onerror = () => {
      ws?.close(); // :1682
    };
  }

  function disconnect(): void {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    if (ws) {
      ws.onclose = null; // deviation: unmount must not re-arm the retry chain
      ws.close();
      ws = null;
    }
  }

  /** onmessage jobs filter (:1659-1671) — own job type, pending+running. */
  function ingestJobsMessage(jobs: JobRecord[]): void {
    const filtered = jobs.filter(
      (job) =>
        String(job.type || '').toLowerCase() === jobType &&
        (job.status === 'pending' || job.status === 'running')
    );
    filtered.sort(compareActiveJobs);
    activeJobs.value = filtered;
  }

  /* ── tabs + history (:1633-1641, :1752-1767) ── */

  function switchTab(tab: MonitorTab): void {
    currentTab.value = tab;
    if (tab !== 'running') void loadHistory(tab);
  }

  async function loadHistory(tab: MonitorTab): Promise<void> {
    historyLoading.value = true;
    historyError.value = '';
    historyJobs.value = [];
    try {
      // the API filters by job_type BEFORE the limit (:1758 — the migrated
      // pytest contract) and the client re-filters defensively (:1762)
      const data = (await apiFetch<{ jobs?: JobRecord[] } | JobRecord[]>(
        apiUrl(`/jobs/?states=${tab}&limit=${HISTORY_LIMIT}&job_type=${encodeURIComponent(jobType)}`)
      )) as { jobs?: JobRecord[] } | JobRecord[];
      const jobs = Array.isArray(data) ? data : data.jobs || [];
      const filtered = jobs.filter((job) => String(job.type || '').toLowerCase() === jobType);
      filtered.sort((a, b) => Number(b.updated_ts || 0) - Number(a.updated_ts || 0));
      historyJobs.value = filtered;
    } catch (e) {
      historyError.value = e instanceof Error ? e.message : String(e);
    } finally {
      historyLoading.value = false;
    }
  }

  function reloadCurrentHistory(): void {
    if (currentTab.value !== 'running') void loadHistory(currentTab.value);
  }

  function notifyHistoryMutation(tab: MonitorTab): void {
    options.onHistoryMutation?.(tab);
  }

  function toggleExpanded(jobId: string): void {
    const next = new Set(expandedJobs.value);
    if (next.has(jobId)) next.delete(jobId);
    else next.add(jobId);
    expandedJobs.value = next;
  }

  /* ── modal (:1929-1971) ── */

  function openErrorModal(title: string, text: string): void {
    modal.value = { active: true, title, kind: 'error', bodyText: text, detailsJob: null };
  }

  function closeModal(): void {
    modal.value = { ...modal.value, active: false };
  }

  async function showLog(jobId: string): Promise<void> {
    modal.value = { active: true, title: t('market.logTitle', { id: jobId }), kind: 'log', bodyText: t('market.loading'), detailsJob: null };
    try {
      const d = (await apiFetch<{ log?: string[]; lines?: string[] }>(apiUrl(`/jobs/${encodeURIComponent(jobId)}/log`))) as {
        log?: string[];
        lines?: string[];
      };
      modal.value = {
        ...modal.value,
        bodyText: (d.log || d.lines || []).join('\n') || t('market.noLogEntries'),
      };
    } catch (e) {
      modal.value = { ...modal.value, bodyText: t('market.failedLoadLog', { message: e instanceof Error ? e.message : String(e) }) };
    }
  }

  async function showJobDetails(jobId: string): Promise<void> {
    modal.value = { active: true, title: t('market.jobDetailsTitle', { id: jobId }), kind: 'details', bodyText: '', detailsJob: null };
    try {
      const job = (await apiFetch<JobRecord>(apiUrl(`/jobs/${encodeURIComponent(jobId)}`))) as JobRecord;
      modal.value = { ...modal.value, detailsJob: job || {} };
    } catch (e) {
      modal.value = {
        ...modal.value,
        kind: 'error',
        bodyText: t('market.failedLoadJobDetails', { message: e instanceof Error ? e.message : t('market.unknownError') }),
      };
    }
  }

  /* ── job actions (:1906-2009) ── */

  async function runJob(jobId: string): Promise<void> {
    try {
      await apiFetch(apiUrl(`/jobs/${encodeURIComponent(jobId)}/run`), { method: 'POST' });
    } catch (e) {
      const message = e instanceof ApiError ? `${e.status}: ${e.detail}` : e instanceof Error ? e.message : String(e);
      openErrorModal(t('market.runFailed'), t('market.failedStartJob', { id: jobId, message }));
    }
  }

  async function cancelJob(jobId: string): Promise<void> {
    try {
      await apiFetch(apiUrl('/jobs/cancel'), {
        method: 'POST',
        body: JSON.stringify({ job_id: jobId, reason: 'user cancel' }), // :1978
      });
    } catch (e) {
      const message = e instanceof ApiError ? `${e.status}: ${e.detail}` : e instanceof Error ? e.message : String(e);
      openErrorModal(t('market.cancelFailed'), t('market.failedCancelJob', { id: jobId, message }));
    }
  }

  async function deleteJob(jobId: string): Promise<void> {
    try {
      await apiFetch(apiUrl(`/jobs/${encodeURIComponent(jobId)}`), { method: 'DELETE' });
    } catch {
      /* legacy swallowed (:1999) */
    }
    notifyHistoryMutation(currentTab.value === 'running' ? 'done' : currentTab.value);
    reloadCurrentHistory(); // :2000
  }

  async function retryJob(jobId: string): Promise<void> {
    try {
      await apiFetch(apiUrl(`/jobs/${encodeURIComponent(jobId)}/retry`), { method: 'POST' });
    } catch {
      /* legacy swallowed (:2003) */
    }
    if (currentTab.value === 'failed') void loadHistory('failed'); // :2004
    notifyHistoryMutation('failed');
  }

  async function requeueJob(jobId: string): Promise<void> {
    try {
      await apiFetch(apiUrl(`/jobs/${encodeURIComponent(jobId)}/requeue`), { method: 'POST' });
    } catch {
      /* legacy swallowed (:2007) */
    }
    if (currentTab.value === 'done') void loadHistory('done'); // :2008
    notifyHistoryMutation('done');
  }

  return {
    badge,
    activeJobs,
    currentTab,
    historyJobs,
    historyLoading,
    historyError,
    expandedJobs,
    modal,
    connect,
    disconnect,
    switchTab,
    loadHistory,
    reloadCurrentHistory,
    toggleExpanded,
    runJob,
    cancelJob,
    deleteJob,
    retryJob,
    requeueJob,
    showLog,
    showJobDetails,
    closeModal,
    ingestJobsMessage,
  };
}
