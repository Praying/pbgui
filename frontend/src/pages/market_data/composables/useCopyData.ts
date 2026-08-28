/*
 * M-data-7 — the copy-data store: the SSH form, the dry-run flow and the
 * schedule editor (legacy market_data_main.html :5023-5254, :7742-7811):
 *
 *   setCopyDataFeedback          :5023-5036
 *   collect/validate             :5038-5060 (lib/copySchedules)
 *   fetchCopyDataScheduleJson    :5069-5087 (detail||error||HTTP extraction)
 *   schedules CRUD               :5127-5254 (load via useSchedulePolling,
 *                                          save/run/delete/edit/reset)
 *   queue dry-run/copy           :7742-7779 (dry-run starts the summary poll
 *                                          + force-remounts the monitor)
 *   test connection              :7781-7811 (no exchange requirement)
 *   job monitor mount            :4224-4232
 *
 * Deviation (documented): legacy wrote the editor into the DOM inputs
 * (:5158-5181); the port holds the editor in refs with the same defaults
 * (interval 24, enabled) and the same reset semantics (:5155-5163) — the
 * form fields stay as typed, only the editor resets.
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import {
  COPY_DATA_EXCHANGES,
  buildCopyDataRequest,
  buildScheduleSaveRequest,
  computeScheduleRowView,
  isInvalidScheduleInterval,
  validateCopyDataRequest,
  type CopyDataRequest,
  type CopyScheduleRow,
  type ScheduleRowView,
} from '../lib/copySchedules';
import { buildCopyDataJobMonitorUrl, resolveJobMonitorSrc } from '../lib/best1mUrls';
import type { DryRunSummaryData } from '../lib/dryRunLog';
import { useDryRunPoll } from './useDryRunPoll';
import { useSchedulePolling } from './useSchedulePolling';
import type { ShowToastFn, TranslateFn } from './useSettings';

export type CopyDataFeedback = { message: string; level: 'info' | 'error' | 'warning' } | null;

export interface CopyDataApi {
  fetchJson<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  fetchJobsJson<T = unknown>(path: string, init?: RequestInit): Promise<T>;
}

export interface UseCopyDataOptions {
  api: CopyDataApi;
  /** Raw fetch for the schedule endpoints (legacy fetchCopyDataScheduleJson :5069-5087). */
  fetchImpl: typeof fetch;
  /** apiUrl(path)-bound builder (:5076). */
  marketDataUrl(path: string): string;
  t: TranslateFn;
  showToast: ShowToastFn;
  /** Legacy `!panel.hidden` check for the 15 s chain (:5146-5147). */
  isPanelActive(): boolean;
  /** PBGUI_SERIAL via boot (:4216). */
  serial(): string;
}

export interface UseCopyData {
  /* form */
  target: Ref<string>;
  sshCommand: Ref<string>;
  destinationRoot: Ref<string>;
  isExchangeSelected(key: string): boolean;
  setExchangeSelected(key: string, checked: boolean): void;
  setTarget(value: string): void;
  setSshCommand(value: string): void;
  setDestinationRoot(value: string): void;
  collectRequest(): CopyDataRequest;
  feedback: Ref<CopyDataFeedback>;
  isQueueDisabled: ComputedRef<boolean>;
  /** True while a copy/dry-run job request is in flight. */
  isQueueing: ComputedRef<boolean>;
  /** True while the SSH connection test is in flight. */
  isTesting: ComputedRef<boolean>;
  /** True while a schedules load (initial or post-CRUD) is in flight. */
  isLoadingSchedules: Ref<boolean>;
  /* job monitor */
  jobMonitorSrc: Ref<string>;
  mountJobMonitor(forceReload: boolean): void;
  /* dry run */
  dryRunSummary: Ref<DryRunSummaryData | null>;
  resetDryRunSummary(): void;
  /* schedules */
  schedules: Ref<CopyScheduleRow[]>;
  scheduleRows: ComputedRef<ScheduleRowView[]>;
  scheduleName: Ref<string>;
  scheduleInterval: Ref<string>;
  scheduleEnabled: Ref<boolean>;
  editingId: Ref<string>;
  isEditing: ComputedRef<boolean>;
  isSaveBusy: ComputedRef<boolean>;
  setScheduleName(value: string): void;
  setScheduleInterval(value: string): void;
  setScheduleEnabled(value: boolean): void;
  loadSchedules(showErrors?: boolean): Promise<void>;
  stopSchedulePoll(): void;
  saveSchedule(): Promise<void>;
  runSchedule(scheduleId: string): Promise<void>;
  deleteSchedule(scheduleId: string): Promise<void>;
  editSchedule(scheduleId: string): void;
  resetEditor(): void;
  /* actions */
  queueJob(dryRun: boolean): Promise<void>;
  testConnection(): Promise<void>;
  setFeedback(message: string, level: 'info' | 'error' | 'warning'): void;
}

export function useCopyData(options: UseCopyDataOptions): UseCopyData {
  const t = options.t;

  /* ── form state (DOM defaults :3429, :3443-3447) ── */
  const target = ref('');
  const sshCommand = ref('ssh');
  const destinationRoot = ref('');
  const selectedExchanges = ref<Set<string>>(
    new Set(COPY_DATA_EXCHANGES.filter((item) => item.checked).map((item) => item.key))
  );
  const feedback = ref<CopyDataFeedback>(null);
  const jobMonitorSrc = ref('');
  const dryRunSummary = ref<DryRunSummaryData | null>(null);
  const schedules = ref<CopyScheduleRow[]>([]);
  const scheduleName = ref('');
  const scheduleInterval = ref('24');
  const scheduleEnabled = ref(true);
  const editingId = ref('');
  const editingUpdatedAt = ref(''); // copyDataScheduleState.editingUpdatedAt :3809
  /* Busy flags as refs — SshForm/ScheduleEditor drive their buttons'
   * loading spinners per action (test vs queue vs save) instead of the
   * shared isQueueDisabled dim. */
  const queueing = ref(false);
  const testing = ref(false);
  const saving = ref(false);
  const isLoadingSchedules = ref(false);

  function setFeedback(message: string, level: 'info' | 'error' | 'warning'): void {
    const text = String(message ?? '').trim();
    feedback.value = text ? { message: text, level } : null; // :5026-5035
  }

  function isExchangeSelected(key: string): boolean {
    return selectedExchanges.value.has(key);
  }

  function setExchangeSelected(key: string, checked: boolean): void {
    const next = new Set(selectedExchanges.value);
    if (checked) next.add(key);
    else next.delete(key);
    selectedExchanges.value = next;
  }

  function setTarget(value: string): void {
    target.value = String(value ?? '');
  }

  function setSshCommand(value: string): void {
    sshCommand.value = String(value ?? '');
  }

  function setDestinationRoot(value: string): void {
    destinationRoot.value = String(value ?? '');
  }

  /** collectCopyDataRequest (:5046-5053) over the refs. */
  function collectRequest(): CopyDataRequest {
    return buildCopyDataRequest({
      target: target.value,
      sshCommand: sshCommand.value,
      destinationRoot: destinationRoot.value,
      selectedExchanges: [...selectedExchanges.value],
    });
  }

  const isQueueDisabled = computed(() => queueing.value || testing.value);
  const isQueueing = computed(() => queueing.value);
  const isTesting = computed(() => testing.value);

  /* ── job monitor (:4215-4232) ── */

  function mountJobMonitor(forceReload: boolean): void {
    const next = buildCopyDataJobMonitorUrl({
      serial: options.serial(),
      forceReload: forceReload === true,
    });
    const resolved = resolveJobMonitorSrc(jobMonitorSrc.value, next, forceReload === true);
    if (resolved !== null) jobMonitorSrc.value = resolved; // :4228-4231
  }

  /* ── dry-run poll (:5478-5523) ── */

  const dryRunPoll = useDryRunPoll({
    fetchJob: (jobId) => options.api.fetchJobsJson(`/jobs/${encodeURIComponent(jobId)}`),
    fetchLog: (jobId) =>
      options.api.fetchJobsJson(`/jobs/${encodeURIComponent(jobId)}/log?lines=500`), // :5495
    render: (view) => {
      dryRunSummary.value = view; // renderCopyDataDryRunSummary data layer
    },
    onFinished: () => mountJobMonitor(true), // :5499
    translate: t,
    serverMessage: (message) => serverMsg(message),
  });

  /** resetCopyDataDryRunSummary (:5256-5267). */
  function resetDryRunSummary(): void {
    dryRunPoll.reset();
    dryRunSummary.value = null; // box.hidden = true (:5263-5265)
  }

  /* ── schedule poll + CRUD (:5062-5254) ── */

  /** Legacy fetchCopyDataScheduleJson (:5069-5087). */
  async function fetchScheduleJson<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const body = init?.body;
    if (body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json'); // :5073-5075
    const response = await options.fetchImpl(options.marketDataUrl(path), {
      ...init,
      cache: init?.cache ?? 'no-store', // :5071
      headers,
    });
    let result: { detail?: unknown; error?: unknown } | null = null;
    try {
      result = (await response.json()) as { detail?: unknown; error?: unknown };
    } catch {
      /* :5078-5082 */
    }
    if (!response.ok) {
      throw new Error(
        String(result?.detail || result?.error || `HTTP ${response.status}`)
      ); // :5083-5085
    }
    return (result ?? {}) as T; // :5086
  }

  const schedulePoll = useSchedulePolling({
    fetchSchedules: () => fetchScheduleJson('/copy-data/schedules'),
    onSchedules: (rows) => {
      schedules.value = rows; // :5137-5138
    },
    onError: (message) => setFeedback(message, 'error'), // :5143
    isPanelActive: options.isPanelActive,
    failureMessage: () => t('market.failedLoadCopySchedules'),
    serverMessage: (message) => serverMsg(message),
  });

  function loadSchedules(showErrors = true): Promise<void> {
    const pending = schedulePoll.load(showErrors); // :5127
    // Loading flag for the list's loading-vs-empty state split.
    isLoadingSchedules.value = true;
    return pending.finally(() => {
      isLoadingSchedules.value = false;
    });
  }

  function stopSchedulePoll(): void {
    schedulePoll.stop(); // :5062-5067 — App's onLeave hook
  }

  /** Legacy schedule list rows (:5103-5123) via the pure view model. */
  const scheduleRows = computed(() =>
    schedules.value.map((schedule) => computeScheduleRowView(schedule, { t }))
  );

  const isEditing = computed(() => editingId.value !== '');

  const isSaveBusy = computed(() => saving.value);

  /** resetCopyDataScheduleEditor (:5155-5163) — editor only, form stays. */
  function resetEditor(): void {
    editingId.value = '';
    editingUpdatedAt.value = '';
    scheduleName.value = '';
    scheduleInterval.value = '24';
    scheduleEnabled.value = true;
  }

  /** editCopyDataSchedule (:5165-5182) — copies the row into form + editor. */
  function editSchedule(scheduleId: string): void {
    const schedule = schedules.value.find((item) => item.id === scheduleId); // :5166
    if (!schedule) return; // :5167
    editingId.value = scheduleId;
    editingUpdatedAt.value = String(schedule.updated_at ?? '');
    target.value = String(schedule.target ?? ''); // :5170
    sshCommand.value = String(schedule.ssh_command || 'ssh'); // :5171
    destinationRoot.value = String(schedule.destination_root ?? ''); // :5172
    const selected = new Set(
      Array.isArray(schedule.exchanges) ? schedule.exchanges.map(String) : []
    ); // :5173
    selectedExchanges.value = selected; // :5174-5176
    scheduleName.value = String(schedule.name ?? ''); // :5177
    scheduleInterval.value = String(schedule.interval_hours || 24); // :5178
    scheduleEnabled.value = Boolean(schedule.enabled); // :5179
  }

  function setScheduleName(value: string): void {
    scheduleName.value = String(value ?? '');
  }

  function setScheduleInterval(value: string): void {
    scheduleInterval.value = String(value ?? '');
  }

  function setScheduleEnabled(value: boolean): void {
    scheduleEnabled.value = Boolean(value);
  }

  /** saveCopyDataSchedule (:5184-5223). */
  async function saveSchedule(): Promise<void> {
    const request = collectRequest(); // :5186
    let validationError = validateCopyDataRequest(request, { t }); // :5187
    const intervalHours = Number(scheduleInterval.value); // :5188
    if (!validationError && isInvalidScheduleInterval(intervalHours)) {
      validationError = t('market.scheduleIntervalError'); // :5189-5191
    }
    if (validationError) {
      setFeedback(validationError, 'error');
      options.showToast(validationError, 'error'); // :5193-5195
      return;
    }
    const payload = buildScheduleSaveRequest(request, {
      id: editingId.value, // :5197
      expectedUpdatedAt: editingUpdatedAt.value, // :5198
      name: scheduleName.value, // :5199
      intervalHours, // :5200
      enabled: scheduleEnabled.value, // :5201
    });
    saving.value = true; // :5202
    try {
      const result = await fetchScheduleJson<{
        success?: boolean;
        error?: string;
        schedule?: { name?: unknown };
      }>('/copy-data/schedules', { method: 'POST', body: JSON.stringify(payload) }); // :5204-5207
      if (!result || result.success === false) {
        throw new Error(result?.error || t('market.failedSaveCopySchedule')); // :5208-5209
      }
      const message = t('market.savedCopySchedule', {
        name: result.schedule?.name ? String(result.schedule.name) : '',
      }); // :5211
      setFeedback(message, 'info');
      options.showToast(message, 'success');
      resetEditor(); // :5214
      await loadSchedules(false); // :5215
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedSaveCopySchedule'); // :5217
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    } finally {
      saving.value = false; // :5221
    }
  }

  /** runCopyDataSchedule (:5225-5241). */
  async function runSchedule(scheduleId: string): Promise<void> {
    try {
      const result = await fetchScheduleJson<{
        success?: boolean;
        error?: string;
        message?: string;
        job_id?: unknown;
      }>(`/copy-data/schedules/${encodeURIComponent(scheduleId)}/run`, { method: 'POST' }); // :5227
      if (!result || result.success === false) {
        throw new Error(result?.error || t('market.failedRunCopySchedule')); // :5228-5229
      }
      const message =
        result.message || t('market.queuedCopyJob', { id: result.job_id }); // :5231
      setFeedback(message, 'info');
      options.showToast(message, 'success');
      mountJobMonitor(true); // :5234
      await loadSchedules(false); // :5235
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedRunCopySchedule'); // :5237
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    }
  }

  /** deleteCopyDataSchedule (:5243-5254). */
  async function deleteSchedule(scheduleId: string): Promise<void> {
    try {
      await fetchScheduleJson(`/copy-data/schedules/${encodeURIComponent(scheduleId)}`, {
        method: 'DELETE',
      }); // :5245
      if (editingId.value === scheduleId) resetEditor(); // :5246
      options.showToast(t('market.copyScheduleDeleted'), 'success'); // :5247
      await loadSchedules(false); // :5248
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.failedDeleteCopySchedule'); // :5250
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    }
  }

  /* ── queue + test (:7742-7811) ── */

  /** queueCopyDataJob (:7742-7779). */
  async function queueJob(dryRun: boolean): Promise<void> {
    const request = collectRequest(); // :7746
    const validationError = validateCopyDataRequest(request, { t }); // :7747
    if (validationError) {
      setFeedback(validationError, 'error');
      options.showToast(validationError, 'error'); // :7748-7751
      return;
    }
    queueing.value = true; // :7754-7755
    if (dryRun) resetDryRunSummary(); // :7756
    setFeedback(dryRun ? t('market.queueingDryRun') : t('market.queueingCopyJob'), 'info'); // :7757
    try {
      const result = (await options.api.fetchJson(
        dryRun ? '/copy-data/dry-run/queue' : '/copy-data/queue',
        { method: 'POST', body: JSON.stringify(request) }
      )) as { success?: boolean; error?: string; message?: string; job_id?: unknown } | null; // :7759-7762
      if (!result || result.success === false) {
        throw new Error(
          result?.error ||
            (dryRun ? t('market.failedQueueDryRun') : t('market.failedQueueCopyJob'))
        ); // :7763-7764
      }
      const message =
        result.message ||
        (dryRun
          ? t('market.queuedDryRun', { id: result.job_id })
          : t('market.queuedCopyJob', { id: result.job_id })); // :7766
      setFeedback(message, 'info');
      options.showToast(message, 'success');
      mountJobMonitor(true); // :7769
      if (dryRun) dryRunPoll.start(result); // :7770
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : dryRun
            ? t('market.failedQueueDryRun')
            : t('market.failedQueueCopyJob'); // :7772
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    } finally {
      queueing.value = false; // :7776-7777
    }
  }

  /** testCopyDataConnection (:7781-7811) — exchanges not required. */
  async function testConnection(): Promise<void> {
    const request = collectRequest(); // :7783
    const validationError = validateCopyDataRequest(request, {
      t,
      requireExchanges: false,
    }); // :7784
    if (validationError) {
      setFeedback(validationError, 'error');
      options.showToast(validationError, 'error'); // :7785-7789
      return;
    }
    testing.value = true; // :7791
    setFeedback(t('market.testingSsh'), 'info'); // :7792
    try {
      const result = (await options.api.fetchJson('/copy-data/test', {
        method: 'POST',
        body: JSON.stringify(request),
      })) as
        | { success?: boolean; error?: string; detail?: string; message?: string }
        | null; // :7794-7797
      if (!result || result.success === false) {
        throw new Error(
          (result && (result.error || result.detail || result.message)) ||
            t('market.copyTestFailed')
        ); // :7798-7799
      }
      const message = result.message || t('market.sshTestPassed'); // :7801
      setFeedback(message, 'info');
      options.showToast(message, 'success');
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? serverMsg(error.message)
          : t('market.copyTestFailed'); // :7805
      setFeedback(message, 'error');
      options.showToast(message, 'error');
    } finally {
      testing.value = false; // :7809
    }
  }

  return {
    target,
    sshCommand,
    destinationRoot,
    isExchangeSelected,
    setExchangeSelected,
    setTarget,
    setSshCommand,
    setDestinationRoot,
    collectRequest,
    feedback,
    isQueueDisabled,
    isQueueing,
    isTesting,
    isLoadingSchedules,
    jobMonitorSrc,
    mountJobMonitor,
    dryRunSummary,
    resetDryRunSummary,
    schedules,
    scheduleRows,
    scheduleName,
    scheduleInterval,
    scheduleEnabled,
    editingId,
    isEditing,
    isSaveBusy,
    setScheduleName,
    setScheduleInterval,
    setScheduleEnabled,
    loadSchedules,
    stopSchedulePoll,
    saveSchedule,
    runSchedule,
    deleteSchedule,
    editSchedule,
    resetEditor,
    queueJob,
    testConnection,
    setFeedback,
  };
}
