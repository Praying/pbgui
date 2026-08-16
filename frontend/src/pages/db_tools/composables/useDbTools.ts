/*
 * The DB Tools store — the reactive port of db_tools.html :308-1237: targets
 * (:497-510), user/backup/dashboard loads with staleness keys (:511-543,
 * :1183-1201), backup sorting (:413-438), the sync-job editor + safety merge
 * (:544-745), the shared confirm modal (:880-900), operation polling
 * (:922-951) and the boot fan-out (:1218-1236).
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { apiUrl } from '../config';
import { backupCreatedSort, cutoffMs, shortSyncTime } from '../lib/format';

export interface DbTarget {
  id: string;
  label: string;
}

export interface UserRow {
  user: string;
  total?: number;
}

export interface BackupItem {
  name: string;
  label?: string;
  db_name?: string;
  size?: number;
  mtime?: string;
}

export interface SyncJob {
  id: string;
  name?: string;
  source?: string;
  targets?: string[];
  users?: string[];
  interval_seconds?: number;
  enabled?: boolean;
  last_run?: string;
  next_run?: string;
  last_error?: string;
  log_file?: string;
}

export interface Operation {
  id?: string;
  kind?: string;
  status?: string;
  percent?: number;
  completed?: number;
  total?: number;
  current?: string;
  steps?: Array<{ label?: string }>;
  result?: unknown;
  error?: string;
}

export interface SyncSafety {
  ok: boolean;
  job?: Record<string, unknown>;
  targets: Record<string, { running?: boolean }>;
  blocked: Record<string, string[]>;
  conflicts: Array<{ job_id?: string; job_name?: string; source?: string; users?: string[] }>;
}

export type StatusKind = '' | 'ok' | 'err';

/** One panel's status box + progress card (setStatus/renderProgress). */
export interface PanelStatus {
  text: string;
  kind: StatusKind;
  isHtml: boolean;
}

export interface ProgressState extends Operation {
  visible: boolean;
}

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

function emptyStatus(text: string): PanelStatus {
  return { text, kind: '', isHtml: false };
}

export function useDbTools(options: { t: TranslateFn }) {
  const t = options.t;

  /* ── shared state ── */

  const targets = ref<DbTarget[]>([]);
  const statuses = ref<Record<string, PanelStatus>>({});
  const progress = ref<Record<string, ProgressState>>({});
  const confirmState = ref<{
    active: boolean;
    title: string;
    message: string;
    detail: string;
    danger: boolean;
  }>({ active: false, title: '', message: '', detail: '', danger: false });

  /* ── cleanup panel ── */

  const cleanupTarget = ref('');
  const cleanupMode = ref('all');
  const cleanupDate = ref('');
  const cleanupUsers = ref<string[]>([]);
  const cleanupUserRows = ref<UserRow[]>([]);
  const cleanupPreview = ref<{ target: string; users: string[]; cutoff_ms: number | null } | null>(null);

  /* ── copy-users panel ── */

  const usersSource = ref('');
  const usersTarget = ref('');
  const usersMode = ref('add_missing');
  const copyUserRows = ref<UserRow[]>([]);
  const copyUsers = ref<string[]>([]);
  const usersPreview = ref<{ source: string; target: string; users: string[]; mode: string } | null>(null);

  /* ── copy-db panel ── */

  const dbSource = ref('');
  const dbTarget = ref('');
  const dbPreview = ref<{ source: string; target: string } | null>(null);

  /* ── sync panel ── */

  const syncJobs = ref<SyncJob[]>([]);
  const syncJobId = ref('');
  const syncEditorVisible = ref(false);
  const syncEditorTitle = ref('');
  const syncName = ref('');
  const syncSource = ref('');
  const syncInterval = ref('300');
  const syncEnabled = ref(false);
  const syncTargets = ref<string[]>([]);
  const syncUsers = ref<string[]>([]);
  const syncUserRows = ref<UserRow[]>([]);
  const syncSafety = ref<SyncSafety | null>(null);

  /* ── backups panel ── */

  const backupTarget = ref('');
  const backups = ref<BackupItem[]>([]);
  const backupSelected = ref<string[]>([]);
  const backupSort = ref<{ key: string; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' });

  /* ── dashboards panel ── */

  const dashSource = ref('');
  const dashTarget = ref('');
  const dashMode = ref('add_missing');
  const dashboards = ref<string[]>([]);
  const templates = ref<string[]>([]);
  const dashSelected = ref<string[]>([]);
  const templateSelected = ref<string[]>([]);
  const dashPreview = ref<{
    source: string;
    target: string;
    dashboards: string[];
    templates: string[];
    mode: string;
  } | null>(null);

  const activePanel = ref('cleanup');
  const listLoads = ref<Record<string, string>>({});
  let pollTimers: Array<ReturnType<typeof setTimeout>> = [];
  let syncPollTimer: ReturnType<typeof setInterval> | null = null;

  /* ── helpers ── */

  function setStatus(id: string, data: unknown, kind: StatusKind = '', isHtml = false): void {
    statuses.value[id] = {
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2), // setStatus :325-329
      kind,
      isHtml,
    };
  }

  function resetProgress(progressId: string): void {
    progress.value[progressId] = { visible: false };
  }

  function renderProgress(progressId: string, operation: Operation): void {
    const percent = Math.max(0, Math.min(100, Number(operation.percent || 0)));
    progress.value[progressId] = {
      ...operation,
      percent,
      visible: true,
    };
  }

  function errorMessage(error: unknown): string {
    const raw = error instanceof ApiError ? error.detail : error instanceof Error ? error.message : String(error);
    return serverMsg(serverMsg(raw)); // legacy double-wrapped m(m(...)) :523
  }

  /* ── targets (:497-510) ── */

  const targetOptions = computed(() =>
    targets.value.map((target) => ({
      id: target.id,
      text: `${target.label} (${target.id === 'local' ? t('misc.dbtools.local') : target.id})`, // targetOption :439-441
    }))
  );

  function firstDifferentTargetId(blockedId: string): string {
    const match = targets.value.find((target) => target.id !== blockedId);
    return match ? match.id : '';
  }

  /** syncTargetPair (:468-481) — source and target must differ. */
  function syncTargetPair(
    source: Ref<string>,
    target: Ref<string>,
    changedSide: 'source' | 'target'
  ): void {
    if (changedSide === 'target' && target.value === source.value) {
      source.value = firstDifferentTargetId(target.value);
    } else if (changedSide === 'source' && source.value === target.value) {
      target.value = firstDifferentTargetId(source.value);
    }
  }

  async function loadTargets(): Promise<void> {
    const data = (await apiFetch<{ targets: DbTarget[] }>(apiUrl('/targets'))) as { targets?: DbTarget[] };
    targets.value = data.targets || [];
    cleanupTarget.value = targets.value[0]?.id || '';
    backupTarget.value = cleanupTarget.value;
    usersSource.value = cleanupTarget.value;
    dbSource.value = cleanupTarget.value;
    dashSource.value = cleanupTarget.value;
    syncSource.value = cleanupTarget.value;
    usersTarget.value = targets.value[1]?.id || cleanupTarget.value;
    dbTarget.value = usersTarget.value;
    dashTarget.value = usersTarget.value;
    if (!targets.value.some((target) => target.id === usersTarget.value)) {
      usersTarget.value = firstDifferentTargetId(usersSource.value);
      dbTarget.value = usersTarget.value;
      dashTarget.value = usersTarget.value;
    }
  }

  /* ── user lists (:511-525) ── */

  async function loadUsers(target: string, scope: 'cleanup' | 'copy' | 'sync'): Promise<void> {
    const loadKey = `${Date.now()}:${Math.random()}`;
    listLoads.value[scope] = loadKey;
    const rowsRef = scope === 'cleanup' ? cleanupUserRows : scope === 'copy' ? copyUserRows : syncUserRows;
    const statusId = scope === 'cleanup' ? 'cleanup' : scope === 'copy' ? 'users' : 'sync';
    rowsRef.value = [];
    setStatus(statusId, t('misc.dbtools.loadingUsers'));
    try {
      const data = (await apiFetch<{ users: UserRow[] }>(
        apiUrl('/users?target=' + encodeURIComponent(target))
      )) as { users?: UserRow[] };
      if (listLoads.value[scope] !== loadKey) return;
      rowsRef.value = data.users || [];
      setStatus(statusId, t('misc.dbtools.loadedUsers', { count: (data.users || []).length }), 'ok');
    } catch (error) {
      if (listLoads.value[scope] !== loadKey) return;
      rowsRef.value = [];
      setStatus(statusId, errorMessage(error), 'err');
    }
  }

  /* ── backups (:526-543) + sorting (:413-438) ── */

  async function loadBackups(): Promise<void> {
    const loadKey = `${Date.now()}:${Math.random()}`;
    listLoads.value.backups = loadKey;
    setStatus('backup', t('misc.dbtools.loadingBackups'));
    resetProgress('backup');
    try {
      const data = (await apiFetch<{ backups: BackupItem[] }>(
        apiUrl('/backups?target=' + encodeURIComponent(backupTarget.value))
      )) as { backups?: BackupItem[] };
      if (listLoads.value.backups !== loadKey) return;
      backups.value = data.backups || [];
      backupSelected.value = backupSelected.value.filter((name) =>
        backups.value.some((item) => item.name === name)
      );
      setStatus('backup', t('misc.dbtools.loadedBackupFiles', { count: (data.backups || []).length }), 'ok');
    } catch (error) {
      if (listLoads.value.backups !== loadKey) return;
      backups.value = [];
      setStatus('backup', errorMessage(error), 'err');
    }
  }

  function toggleBackupSort(key: string): void {
    if (backupSort.value.key === key) {
      backupSort.value.dir = backupSort.value.dir === 'asc' ? 'desc' : 'asc'; // :1029
    } else {
      backupSort.value = { key, dir: key === 'created' ? 'desc' : 'asc' }; // :1032
    }
  }

  function backupSortValue(item: BackupItem, key: string): string | number {
    if (key === 'created') return backupCreatedSort(item.name, item.mtime);
    if (key === 'label') return String(item.label || '').toLowerCase();
    if (key === 'db') return String(item.db_name || '').toLowerCase();
    if (key === 'size') return Number(item.size || 0);
    return String(item.name || '').toLowerCase();
  }

  const sortedBackups = computed(() =>
    backups.value.slice().sort((a, b) => {
      const av = backupSortValue(a, backupSort.value.key);
      const bv = backupSortValue(b, backupSort.value.key);
      const dir = backupSort.value.dir === 'asc' ? 1 : -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return String(a.name || '').localeCompare(String(b.name || ''));
    })
  );

  /* ── sync jobs (:544-745) ── */

  const syncTargetIds = computed(() =>
    targets.value.filter((target) => target.id !== syncSource.value).map((target) => target.id)
  );

  function syncPayload(): Record<string, unknown> {
    return {
      id: syncJobId.value || null,
      name: syncName.value,
      source: syncSource.value,
      targets: syncTargets.value,
      users: syncUsers.value,
      interval_seconds: Number(syncInterval.value || 300),
      enabled: syncEnabled.value,
    }; // syncPayload :551-561
  }

  function resetSyncForm(): void {
    syncJobId.value = '';
    syncName.value = '';
    syncInterval.value = '300';
    syncEnabled.value = false;
    syncTargets.value = [];
    syncUsers.value = [];
    resetProgress('sync');
    setStatus('sync', t('misc.dbtools.createOrSelectSyncJob'));
  }

  function openSyncEditor(title: string): void {
    syncEditorVisible.value = true;
    syncEditorTitle.value = title || t('misc.dbtools.syncJobEditor');
  }

  function closeSyncEditor(): void {
    syncJobId.value = '';
    syncEditorVisible.value = false;
    resetProgress('sync');
    setStatus('sync', t('misc.dbtools.selectSyncJobToEdit'));
  }

  function newSyncJob(): void {
    resetSyncForm();
    openSyncEditor(t('misc.dbtools.newSyncJob'));
    void loadUsers(syncSource.value, 'sync');
  }

  async function loadSyncJobs(quiet = false): Promise<void> {
    try {
      const data = (await apiFetch<{ jobs: SyncJob[] }>(apiUrl('/sync/jobs'))) as { jobs?: SyncJob[] };
      syncJobs.value = data.jobs || [];
      if (quiet) return;
      if (syncJobId.value) {
        const job = syncJobs.value.find((item) => item.id === syncJobId.value);
        if (job) selectSyncJob(job.id);
      } else {
        setStatus('sync', t('misc.dbtools.loadedSyncJobs', { count: syncJobs.value.length }), 'ok');
      }
    } catch (error) {
      setStatus('sync', errorMessage(error), 'err');
    }
  }

  function syncJobStatusText(job: SyncJob): string {
    const lines = [
      t('misc.dbtools.selectedJob', { name: job.name || job.id }),
      t('misc.dbtools.statusLabel', {
        status: job.last_error ? t('misc.dbtools.error') : job.enabled ? t('misc.dbtools.enabled') : t('misc.dbtools.disabled'),
      }),
      t('misc.dbtools.sourceLabel', { source: job.source || '-' }),
      t('misc.dbtools.targetsLabel', { targets: (job.targets || []).join(', ') || '-' }),
      t('misc.dbtools.usersLabel', { users: (job.users || []).join(', ') || '-' }),
      t('misc.dbtools.lastRunLabel', { time: shortSyncTime(job.last_run) }),
      t('misc.dbtools.nextRunLabel', { time: shortSyncTime(job.next_run) }),
    ];
    if (job.last_error) lines.push(t('misc.dbtools.lastErrorLabel', { error: job.last_error }));
    return lines.join('\n');
  }

  function selectSyncJob(jobId: string): void {
    const job = syncJobs.value.find((item) => item.id === jobId);
    if (!job) {
      resetSyncForm();
      return;
    }
    syncJobId.value = job.id;
    openSyncEditor(t('misc.dbtools.editSyncJob'));
    syncName.value = job.name || '';
    syncSource.value = job.source || 'local';
    syncInterval.value = String(job.interval_seconds || 300);
    syncEnabled.value = Boolean(job.enabled);
    syncTargets.value = (job.targets || []).filter((id) => id !== syncSource.value);
    void loadUsers(syncSource.value, 'sync').then(() => {
      const known = new Set(syncUserRows.value.map((row) => row.user));
      syncUsers.value = (job.users || []).filter((user) => known.has(user));
      setStatus('sync', syncJobStatusText(job), job.last_error ? 'err' : 'ok');
    });
  }

  /** mergeSyncSafetyResults (:604-621). */
  function mergeSyncSafetyResults(results: SyncSafety[], basePayload: Record<string, unknown>): SyncSafety {
    const merged: SyncSafety = {
      ok: true,
      job: { ...basePayload },
      targets: {},
      blocked: {},
      conflicts: [],
    };
    const seenConflicts = new Set<string>();
    results.forEach((data) => {
      merged.ok = merged.ok && Boolean(data.ok);
      Object.assign(merged.targets, data.targets || {});
      Object.keys(data.blocked || {}).forEach((target) => {
        merged.blocked[target] = data.blocked[target]!;
      });
      (data.conflicts || []).forEach((item) => {
        const key = String(item.job_id || '') + ':' + String((item.users || []).join(','));
        if (!seenConflicts.has(key)) {
          seenConflicts.add(key);
          merged.conflicts.push(item);
        }
      });
    });
    if (Object.keys(merged.blocked).length || merged.conflicts.length) merged.ok = false;
    return merged;
  }

  /** checkSyncSafetyWithProgress (:622-649) — one POST per target, chained. */
  async function checkSyncSafety(): Promise<void> {
    const payload = syncPayload();
    const checkTargets = syncTargets.value.slice();
    const checks = checkTargets.length ? checkTargets : [''];
    const results: SyncSafety[] = [];
    renderProgress('sync', {
      kind: 'safety-check',
      status: 'running',
      completed: 0,
      total: checks.length,
      percent: 0,
      current: t('misc.dbtools.startingSafetyCheck'),
      steps: [],
    });
    setStatus('sync', t('misc.dbtools.checkingSafety'));
    try {
      for (let index = 0; index < checks.length; index += 1) {
        const target = checks[index]!;
        const label = target || t('misc.dbtools.configuration');
        renderProgress('sync', {
          kind: 'safety-check',
          status: 'running',
          completed: index,
          total: checks.length,
          percent: Math.round((index / checks.length) * 100),
          current: t('misc.dbtools.checkingLabel', { label }),
          steps: results.map((_item, stepIndex) => ({
            label: t('misc.dbtools.checkedLabel', { label: checks[stepIndex] || t('misc.dbtools.configuration') }),
          })),
        });
        const data = (await apiFetch<SyncSafety>(apiUrl('/sync/safety'), {
          method: 'POST',
          body: JSON.stringify({ ...payload, targets: target ? [target] : [] }),
        })) as SyncSafety;
        results.push(data);
        renderProgress('sync', {
          kind: 'safety-check',
          status: 'running',
          completed: index + 1,
          total: checks.length,
          percent: Math.round(((index + 1) / checks.length) * 100),
          current: t('misc.dbtools.checkedLabel', { label }),
          steps: results.map((_item, stepIndex) => ({
            label: t('misc.dbtools.checkedLabel', { label: checks[stepIndex] || t('misc.dbtools.configuration') }),
          })),
        });
      }
      const merged = mergeSyncSafetyResults(results, payload);
      renderProgress('sync', {
        kind: 'safety-check',
        status: 'done',
        completed: checks.length,
        total: checks.length,
        percent: 100,
        current: t('misc.dbtools.completed'),
        steps: checks.map((target) => ({
          label: t('misc.dbtools.checkedLabel', { label: target || t('misc.dbtools.configuration') }),
        })),
      });
      syncSafety.value = merged;
      setStatus('sync', '', merged.ok ? 'ok' : 'err', true);
    } catch (error) {
      renderProgress('sync', {
        kind: 'safety-check',
        status: 'error',
        completed: results.length,
        total: checks.length,
        percent: Math.round((results.length / checks.length) * 100),
        current: t('misc.dbtools.failed'),
        steps: results.map((_item, stepIndex) => ({
          label: t('misc.dbtools.checkedLabel', { label: checks[stepIndex] || t('misc.dbtools.configuration') }),
        })),
      });
      setStatus('sync', errorMessage(error), 'err');
    }
  }

  async function saveSyncJob(): Promise<void> {
    resetProgress('sync');
    try {
      const data = (await apiFetch<{ job?: SyncJob }>(apiUrl('/sync/jobs'), {
        method: 'POST',
        body: JSON.stringify(syncPayload()),
      })) as { job?: SyncJob };
      syncJobId.value = data.job?.id || '';
      setStatus('sync', data.job || data, 'ok');
      await loadSyncJobs();
    } catch (error) {
      setStatus('sync', errorMessage(error), 'err');
    }
  }

  async function deleteSyncJob(): Promise<void> {
    if (!syncJobId.value) {
      setStatus('sync', t('misc.dbtools.selectSyncJobToDelete'), 'err');
      return;
    }
    const ok = await confirmAction(
      t('misc.dbtools.deleteSyncJobTitle'),
      t('misc.dbtools.deleteSyncJobMsg'),
      t('misc.dbtools.deleteSyncJobDetail'),
      true
    );
    if (!ok) return;
    try {
      const data = (await apiFetch(apiUrl('/sync/jobs/' + encodeURIComponent(syncJobId.value)), {
        method: 'DELETE',
      })) as unknown;
      syncJobId.value = '';
      closeSyncEditor();
      await loadSyncJobs();
      setStatus('sync', data, 'ok');
    } catch (error) {
      setStatus('sync', errorMessage(error), 'err');
    }
  }

  /* ── confirm modal (:880-900) ── */

  let confirmResolve: ((ok: boolean) => void) | null = null;

  function confirmAction(title: string, message: string, detail: string, danger: boolean): Promise<boolean> {
    confirmState.value = { active: true, title, message, detail, danger };
    return new Promise((resolve) => {
      confirmResolve = resolve;
    });
  }

  function resolveConfirm(ok: boolean): void {
    confirmState.value = { ...confirmState.value, active: false };
    confirmResolve?.(ok);
    confirmResolve = null;
  }

  /* ── operations (:922-951) ── */

  async function pollOperation(
    operationId: string,
    statusId: string,
    progressId: string,
    doneCallback?: (result: unknown) => void
  ): Promise<void> {
    try {
      const data = (await apiFetch<{ operation: Operation }>(
        apiUrl('/operations/' + encodeURIComponent(operationId))
      )) as { operation?: Operation };
      const operation = data.operation || {};
      renderProgress(progressId, operation);
      if (operation.status === 'done') {
        setStatus(statusId, operation.result || {}, 'ok');
        doneCallback?.(operation.result || {});
        return;
      }
      if (operation.status === 'error') {
        setStatus(statusId, serverMsg(operation.error || '') || t('misc.dbtools.operationFailed'), 'err');
        return;
      }
      const timer = setTimeout(() => {
        void pollOperation(operationId, statusId, progressId, doneCallback);
      }, 700); // :935
      pollTimers.push(timer);
    } catch (error) {
      setStatus(statusId, errorMessage(error), 'err');
    }
  }

  async function startOperation(
    path: string,
    payload: Record<string, unknown>,
    statusId: string,
    progressId: string,
    doneCallback?: (result: unknown) => void
  ): Promise<void> {
    setStatus(statusId, t('misc.dbtools.startingOperation'));
    resetProgress(progressId);
    try {
      const data = (await apiFetch<{ operation?: Operation }>(apiUrl(path), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as { operation?: Operation };
      const operation = data.operation;
      if (!operation || !operation.id) {
        setStatus(statusId, data, 'ok');
        doneCallback?.(data);
        return;
      }
      renderProgress(progressId, operation);
      await pollOperation(operation.id, statusId, progressId, doneCallback);
    } catch (error) {
      setStatus(statusId, errorMessage(error), 'err');
    }
  }

  /* ── cleanup panel actions (:1038-1056) ── */

  async function previewCleanup(): Promise<void> {
    const payload = {
      target: cleanupTarget.value,
      users: cleanupUsers.value,
      cutoff_ms: cleanupMode.value === 'older' ? cutoffMs(cleanupDate.value) : null,
    };
    if (cleanupMode.value === 'older' && payload.cutoff_ms == null) {
      setStatus('cleanup', t('misc.dbtools.selectCutoffDate'), 'err');
      return;
    }
    resetProgress('cleanup');
    try {
      const data = (await apiFetch(apiUrl('/cleanup/preview'), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as unknown;
      cleanupPreview.value = payload;
      setStatus('cleanup', data, 'ok');
    } catch (error) {
      setStatus('cleanup', errorMessage(error), 'err');
    }
  }

  async function runCleanup(): Promise<void> {
    const payload = { ...(cleanupPreview.value || {}), mode: cleanupMode.value };
    const ok = await confirmAction(
      t('misc.dbtools.runCleanupTitle'),
      t('misc.dbtools.deleteUserDataMsg'),
      t('misc.dbtools.backupCreatedDetail'),
      true
    );
    if (!ok) return;
    cleanupPreview.value = null;
    await startOperation('/cleanup/run', payload, 'cleanup', 'cleanup', async () => {
      await loadUsers(cleanupTarget.value, 'cleanup');
    });
  }

  /* ── copy-users actions (:1058-1073) ── */

  async function previewCopyUsers(): Promise<void> {
    const payload = {
      source: usersSource.value,
      target: usersTarget.value,
      users: copyUsers.value,
      mode: usersMode.value,
    };
    resetProgress('users');
    try {
      const data = (await apiFetch(apiUrl('/users/copy/preview'), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as unknown;
      usersPreview.value = payload;
      setStatus('users', data, 'ok');
    } catch (error) {
      setStatus('users', errorMessage(error), 'err');
    }
  }

  async function runCopyUsers(): Promise<void> {
    const payload = usersPreview.value;
    if (!payload) return;
    const ok = await confirmAction(
      t('misc.dbtools.copyUsersTitle'),
      t('misc.dbtools.copyUsersMsg'),
      t('misc.dbtools.targetBackupDetail'),
      payload.mode === 'replace'
    );
    if (!ok) return;
    usersPreview.value = null;
    await startOperation('/users/copy/run', payload as Record<string, unknown>, 'users', 'users');
  }

  /* ── copy-db actions (:1075-1088) ── */

  async function previewCopyDb(): Promise<void> {
    const payload = { source: dbSource.value, target: dbTarget.value };
    resetProgress('db');
    try {
      const data = (await apiFetch(apiUrl('/database/copy/preview'), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as unknown;
      dbPreview.value = payload;
      setStatus('db', data, 'ok');
    } catch (error) {
      setStatus('db', errorMessage(error), 'err');
    }
  }

  async function runCopyDb(): Promise<void> {
    const payload = dbPreview.value;
    if (!payload) return;
    const ok = await confirmAction(
      t('misc.dbtools.copyDatabaseTitle'),
      t('misc.dbtools.replaceTargetDbMsg'),
      t('misc.dbtools.targetBackupBeforeReplaceDetail'),
      true
    );
    if (!ok) return;
    dbPreview.value = null;
    await startOperation('/database/copy/run', payload as Record<string, unknown>, 'db', 'db');
  }

  /* ── backup actions (:1153-1181) ── */

  async function runBackupRestore(): Promise<void> {
    const payload = { target: backupTarget.value, backups: backupSelected.value };
    if (!payload.backups.length) {
      setStatus('backup', t('misc.dbtools.selectAtLeastOneBackup'), 'err');
      return;
    }
    const ok = await confirmAction(
      t('misc.dbtools.restoreBackupTitle'),
      t('misc.dbtools.restoreBackupMsg'),
      t('misc.dbtools.restoreBackupDetail'),
      true
    );
    if (!ok) return;
    await startOperation('/backups/restore/run', payload, 'backup', 'backup', async () => {
      await loadBackups();
    });
  }

  async function runBackupDelete(): Promise<void> {
    const payload = { target: backupTarget.value, backups: backupSelected.value };
    if (!payload.backups.length) {
      setStatus('backup', t('misc.dbtools.selectAtLeastOneBackup'), 'err');
      return;
    }
    const ok = await confirmAction(
      t('misc.dbtools.deleteBackupsTitle'),
      t('misc.dbtools.deleteBackupsMsg'),
      t('misc.dbtools.deleteBackupsDetail'),
      true
    );
    if (!ok) return;
    try {
      const data = (await apiFetch(apiUrl('/backups/delete'), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as unknown;
      await loadBackups();
      setStatus('backup', data, 'ok');
    } catch (error) {
      setStatus('backup', errorMessage(error), 'err');
    }
  }

  /* ── dashboards (:1183-1216) ── */

  async function loadDashboards(): Promise<void> {
    const loadKey = `${Date.now()}:${Math.random()}`;
    listLoads.value.dashboards = loadKey;
    setStatus('dash', t('misc.dbtools.loadingDashboardsAndTemplates'));
    dashboards.value = [];
    templates.value = [];
    dashPreview.value = null;
    try {
      const data = (await apiFetch<{ dashboards: string[]; templates: string[] }>(
        apiUrl('/dashboards?target=' + encodeURIComponent(dashSource.value))
      )) as { dashboards?: string[]; templates?: string[] };
      if (listLoads.value.dashboards !== loadKey) return;
      dashboards.value = data.dashboards || [];
      templates.value = data.templates || [];
      setStatus(
        'dash',
        t('misc.dbtools.loadedDashboardsAndTemplates', {
          dashboards: dashboards.value.length,
          templates: templates.value.length,
        }),
        'ok'
      );
    } catch (error) {
      if (listLoads.value.dashboards !== loadKey) return;
      setStatus('dash', errorMessage(error), 'err');
    }
  }

  async function previewCopyDashboards(): Promise<void> {
    const payload = {
      source: dashSource.value,
      target: dashTarget.value,
      dashboards: dashSelected.value,
      templates: templateSelected.value,
      mode: dashMode.value,
    };
    resetProgress('dash');
    try {
      const data = (await apiFetch(apiUrl('/dashboards/copy/preview'), {
        method: 'POST',
        body: JSON.stringify(payload),
      })) as unknown;
      dashPreview.value = payload;
      setStatus('dash', data, 'ok');
    } catch (error) {
      setStatus('dash', errorMessage(error), 'err');
    }
  }

  async function runCopyDashboards(): Promise<void> {
    const payload = dashPreview.value;
    if (!payload) return;
    const ok = await confirmAction(
      t('misc.dbtools.copyDashboardsTitle'),
      t('misc.dbtools.copyDashboardsMsg'),
      t('misc.dbtools.copyDashboardsDetail'),
      false
    );
    if (!ok) return;
    dashPreview.value = null;
    await startOperation('/dashboards/copy/run', payload as Record<string, unknown>, 'dash', 'dash');
  }

  /* ── run-now + log (:1132-1140, :763-795) ── */

  async function runSyncJobNow(): Promise<void> {
    if (!syncJobId.value) {
      setStatus('sync', t('misc.dbtools.saveBeforeRun'), 'err');
      return;
    }
    const ok = await confirmAction(
      t('misc.dbtools.runSyncJobTitle'),
      t('misc.dbtools.runSyncJobMsg'),
      t('misc.dbtools.targetBackupsBeforeImportDetail'),
      false
    );
    if (!ok) return;
    await startOperation('/sync/jobs/' + encodeURIComponent(syncJobId.value) + '/run', {}, 'sync', 'sync', async () => {
      await loadSyncJobs();
    });
  }

  function syncJobLogFallbackName(job: SyncJob | Record<string, unknown>): string {
    const raw = String((job as SyncJob).name || 'sync-job').trim();
    const slug =
      raw.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^[_-]+|[_-]+$/g, '').slice(0, 80) || 'sync-job';
    return 'jobs/db-tools-sync-' + slug + '.log'; // :763-767
  }

  function logFileForJob(jobId: string): { file: string; title: string } {
    const job = syncJobs.value.find((item) => item.id === jobId) || ({} as SyncJob);
    return {
      file: job.log_file || syncJobLogFallbackName(job),
      title: t('misc.dbtools.syncJobLog', { name: job.name || jobId || t('misc.dbtools.syncJobs') }),
    };
  }

  /* ── bootstrap (:1218-1236) ── */

  async function bootstrap(): Promise<void> {
    try {
      await loadTargets();
      await Promise.all([
        loadUsers(cleanupTarget.value, 'cleanup'),
        loadUsers(usersSource.value, 'copy'),
        loadSyncJobs(),
        loadBackups(),
        loadDashboards(),
      ]);
    } catch (error) {
      const message = errorMessage(error);
      for (const id of ['cleanup', 'users', 'db', 'sync', 'backup', 'dash']) {
        setStatus(id, message, 'err');
      }
    }
    // quiet sync refresh while the panel is visible (:1232-1236)
    syncPollTimer = setInterval(() => {
      if (activePanel.value === 'sync-jobs') void loadSyncJobs(true);
    }, 10000);
  }

  function teardown(): void {
    pollTimers.forEach((timer) => clearTimeout(timer));
    pollTimers = [];
    if (syncPollTimer) clearInterval(syncPollTimer);
    syncPollTimer = null;
  }

  return {
    // shared
    targets,
    targetOptions,
    statuses,
    progress,
    confirmState,
    confirmAction,
    resolveConfirm,
    syncTargetPair,
    activePanel,
    // cleanup
    cleanupTarget,
    cleanupMode,
    cleanupDate,
    cleanupUsers,
    cleanupUserRows,
    cleanupPreview,
    loadUsers,
    previewCleanup,
    runCleanup,
    // copy users
    usersSource,
    usersTarget,
    usersMode,
    copyUserRows,
    copyUsers,
    usersPreview,
    previewCopyUsers,
    runCopyUsers,
    // copy db
    dbSource,
    dbTarget,
    dbPreview,
    previewCopyDb,
    runCopyDb,
    // sync
    syncJobs,
    syncJobId,
    syncEditorVisible,
    syncEditorTitle,
    syncName,
    syncSource,
    syncInterval,
    syncEnabled,
    syncTargets,
    syncUsers,
    syncUserRows,
    syncTargetIds,
    syncSafety,
    syncJobStatusText,
    selectSyncJob,
    newSyncJob,
    closeSyncEditor,
    loadSyncJobs,
    saveSyncJob,
    deleteSyncJob,
    runSyncJobNow,
    checkSyncSafety,
    mergeSyncSafetyResults,
    syncPayload,
    logFileForJob,
    // backups
    backupTarget,
    backups,
    sortedBackups,
    backupSelected,
    backupSort,
    toggleBackupSort,
    loadBackups,
    runBackupRestore,
    runBackupDelete,
    // dashboards
    dashSource,
    dashTarget,
    dashMode,
    dashboards,
    templates,
    dashSelected,
    templateSelected,
    dashPreview,
    loadDashboards,
    previewCopyDashboards,
    runCopyDashboards,
    // operations + lifecycle
    startOperation,
    bootstrap,
    teardown,
  };
}

export type DbToolsStore = ReturnType<typeof useDbTools>;
