/*
 * The backup/restore panel store — the reactive port of the legacy backup
 * flow (v7_run.html):
 *
 *  - openBackups (:1122-1213)  panel state + first fetches;
 *  - fetchRetention / stepRetention / markRetentionDirty / saveRetention
 *    (:1215-1271)  the retention stepper with its green/orange dirty color;
 *  - fetchBackups (:1273-1343)  list + client-side filter over names,
 *    backup ids and created_at values;
 *  - loadBackupInEditor (:1345-1365)  POST /backups/{name}/{ts}/draft →
 *    navigate to the returned edit_url;
 *  - doDeleteBackup (:1367-1386)  PBGuiDialogs.confirm → DELETE → toast +
 *    refresh;
 *  - openBackupConfirm (:1089-1119)  the rollback confirm overlay incl. the
 *    running-hosts warning.
 */

import { computed, ref, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import type { RunAdapter } from '../config';
import { apiUrl } from '../config';
import { dialogsConfirm } from '../lib/dialogs';
import type { ToastHandle } from '../lib/toast';

export interface BackupItem {
  id: string;
  created_at?: string;
}

export interface BackupEntry {
  name: string;
  timestamps?: string[];
  backup_items?: BackupItem[];
  can_restore?: boolean;
  currently_exists?: boolean;
  running_on?: string[];
}

/** One rendered instance group after the filter pass (:1282-1302). */
export interface BackupGroup {
  backup: BackupEntry;
  items: BackupItem[];
}

export interface BackupDraftResponse {
  edit_url?: string;
}

export interface UseBackups {
  panelOpen: Ref<boolean>;
  retention: Ref<number>;
  retentionSaved: Ref<number>;
  retentionMsg: Ref<{ text: string; color: string } | null>;
  backups: Ref<BackupEntry[]>;
  filterText: Ref<string>;
  groups: Ref<BackupGroup[]>;
  loading: Ref<boolean>;
  loadError: Ref<string>;
  confirm: Ref<{ name: string; ts: string; runningHosts: string } | null>;
  open(): void;
  close(): void;
  stepRetention(dir: number): void;
  saveRetention(): Promise<void>;
  loadBackups(): Promise<void>;
  requestRestore(name: string, ts: string): void;
  cancelRestore(): void;
  confirmRestore(): void;
  loadBackupInEditor(name: string, ts: string): Promise<void>;
  deleteBackup(name: string, ts: string): Promise<void>;
}

/** The list filter (:1286-1302) — name match keeps all items, else item matches. */
export function filterBackupGroups(backups: readonly BackupEntry[], filterText: string): BackupGroup[] {
  const filter = filterText.trim().toLowerCase();
  const groups: BackupGroup[] = [];
  for (const b of backups) {
    const items = b.backup_items || (b.timestamps || []).map((ts) => ({ id: ts, created_at: ts }));
    if (!filter) {
      groups.push({ backup: b, items });
      continue;
    }
    const nameMatches = String(b.name || '').toLowerCase().includes(filter);
    const filteredItems = items.filter(
      (item) =>
        String(item.id || '').toLowerCase().includes(filter) ||
        String(item.created_at || '').toLowerCase().includes(filter)
    );
    if (!nameMatches && !filteredItems.length) continue;
    groups.push({ backup: b, items: nameMatches ? items : filteredItems });
  }
  return groups;
}

export function useBackups(options: {
  t: (key: string, params?: Record<string, unknown>) => string;
  adapter: RunAdapter;
  toast: ToastHandle;
  /** Injectable for tests; defaults to window.location.href assignment. */
  navigate?: (url: string) => void;
}): UseBackups {
  const { t, adapter, toast } = options;
  const navigate = options.navigate ?? ((url: string) => void (window.location.href = url));

  const panelOpen = ref(false);
  const retention = ref(50);
  const retentionSaved = ref(50); // _retSavedVal :1215
  const retentionMsg = ref<{ text: string; color: string } | null>(null);
  const backups = ref<BackupEntry[]>([]);
  const filterText = ref('');
  const loading = ref(false);
  const loadError = ref('');
  const confirm = ref<{ name: string; ts: string; runningHosts: string } | null>(null);

  const groups = computed(() => filterBackupGroups(backups.value, filterText.value));

  /* ── panel lifecycle (:1122-1213) ── */

  function open(): void {
    panelOpen.value = true;
    void fetchRetention();
    void loadBackups();
  }

  function close(): void {
    panelOpen.value = false;
    confirm.value = null;
  }

  /* ── retention (:1215-1271) ── */

  async function fetchRetention(): Promise<void> {
    try {
      const data = (await apiFetch<{ max_versions?: number }>(apiUrl(adapter, '/backup-settings'), {
        credentials: 'same-origin',
      })) as { max_versions?: number };
      retentionSaved.value = data.max_versions || 50; // :1223-1224
      retention.value = retentionSaved.value;
    } catch {
      retentionSaved.value = 50; // :1228-1229
      retention.value = 50;
    }
  }

  function stepRetention(dir: number): void {
    retention.value = Math.max(1, (parseInt(String(retention.value), 10) || 1) + dir); // :1233-1240
  }

  async function saveRetention(): Promise<void> {
    let val = parseInt(String(retention.value), 10);
    if (isNaN(val) || val < 1) val = 1; // :1253-1254
    retention.value = val;
    try {
      const data = (await apiFetch<{ max_versions?: number }>(apiUrl(adapter, '/backup-settings'), {
        method: 'PUT',
        credentials: 'same-origin',
        body: JSON.stringify({ max_versions: val }), // :1258-1259
      })) as { max_versions?: number };
      retentionSaved.value = data.max_versions ?? val; // :1263
      retention.value = retentionSaved.value;
      retentionMsg.value = { text: t('v7run.saved'), color: 'var(--success)' }; // :1266
      setTimeout(() => {
        retentionMsg.value = null;
      }, 2000); // :1267
    } catch (error) {
      retentionMsg.value = { text: t('common.error') + ': ' + String(error), color: 'var(--danger)' }; // :1269
    }
  }

  /* ── list (:1273-1343) ── */

  async function loadBackups(): Promise<void> {
    loading.value = true;
    loadError.value = '';
    try {
      const data = (await apiFetch<{ backups?: BackupEntry[] }>(apiUrl(adapter, '/backups'), {
        credentials: 'same-origin',
      })) as { backups?: BackupEntry[] };
      backups.value = data.backups || [];
    } catch (error) {
      loadError.value = t('common.error') + ': ' + (error instanceof ApiError ? serverMsg(error.detail) : String(error)); // :1341
    } finally {
      loading.value = false;
    }
  }

  /* ── rollback confirm (:1084-1119) ── */

  function requestRestore(name: string, ts: string): void {
    const entry = backups.value.find((b) => b.name === name);
    const runningHosts = entry?.running_on?.length ? entry.running_on.join(', ') : ''; // :1093
    confirm.value = { name, ts, runningHosts };
  }

  function cancelRestore(): void {
    confirm.value = null;
  }

  function confirmRestore(): void {
    const pending = confirm.value;
    confirm.value = null;
    if (pending) void loadBackupInEditor(pending.name, pending.ts); // :1115-1118
  }

  /* ── editor draft (:1345-1365) ── */

  async function loadBackupInEditor(name: string, ts: string): Promise<void> {
    try {
      const data = (await apiFetch<BackupDraftResponse>(
        apiUrl(adapter, '/backups/' + encodeURIComponent(name) + '/' + encodeURIComponent(ts) + '/draft'),
        { method: 'POST', credentials: 'same-origin' }
      )) as BackupDraftResponse;
      if (!data.edit_url) throw new Error(t('v7run.missingEditorUrl')); // :1360
      navigate(data.edit_url); // :1361
    } catch (error) {
      const message = error instanceof ApiError ? serverMsg(error.detail) : String(error);
      toast.show(t('v7run.loadBackupFailed') + ': ' + message, 'err'); // :1363
    }
  }

  /* ── delete backup (:1367-1386) ── */

  async function deleteBackup(name: string, ts: string): Promise<void> {
    const confirmed = await dialogsConfirm({
      title: t('v7run.deleteBackupTitle'), // :1369-1373
      message: t('v7run.deleteBackupConfirm', { name, ts }),
      detail: t('v7run.cannotUndone'),
      confirmText: t('common.delete'),
    });
    if (!confirmed) return;
    try {
      await apiFetch(
        apiUrl(adapter, '/backups/' + encodeURIComponent(name) + '/' + encodeURIComponent(ts)),
        { method: 'DELETE', credentials: 'same-origin' }
      );
      toast.show(t('v7run.backupDeleted', { name, ts }), 'ok'); // :1381
      void loadBackups(); // :1382
    } catch (error) {
      const message = error instanceof ApiError ? serverMsg(error.detail) : String(error);
      toast.show(t('v7run.deleteBackupFailed') + ': ' + message, 'err'); // // :1384
    }
  }

  return {
    panelOpen,
    retention,
    retentionSaved,
    retentionMsg,
    backups,
    filterText,
    groups,
    loading,
    loadError,
    confirm,
    open,
    close,
    stepRetention,
    saveRetention,
    loadBackups,
    requestRestore,
    cancelRestore,
    confirmRestore,
    loadBackupInEditor,
    deleteBackup,
  };
}
