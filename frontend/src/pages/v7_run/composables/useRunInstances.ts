/*
 * The run-list store — the reactive port of the legacy page state and API
 * actions (v7_run.html):
 *
 *  - loadInstances (:593-609)  REST snapshot with a loadGeneration guard;
 *  - the row actions: editInstance :899-902, addInstance :904-908,
 *    convertInstanceToV8 :910-941, confirmDelete/executeDelete :943-1001,
 *    openBalanceCalculator :1003-1028, confirmForcedMode/executeForcedMode
 *    :1030-1077.
 *
 * The WS updates arrive through setInstancesFromWs (useRunWs onInstances),
 * which bumps loadGeneration so an older REST snapshot cannot resurrect
 * itself (:634). Rendering (render :790-891) becomes the `rows` computed.
 *
 * Deviation (documented, same as balance_calc): fetches carry the boot
 * Bearer token in addition to the cookie — legacy apiFetch was cookie-only
 * (:585-591); the shared apiFetch adds the header the same session accepts.
 */

import { computed, ref, type Ref } from 'vue';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { getBoot } from '@/shared/boot';
import type { RunAdapter } from '../config';
import {
  apiUrl,
  backtestV8PageUrl,
  balanceCalcPageUrl,
  editPageUrl,
  migrateV7Url,
  convertTargetName,
} from '../config';
import {
  deleteHostsSummary,
  filterAndSortInstances,
  nextSort,
  pb8WarningHosts,
  type DeleteHosts,
  type RunInstance,
  type SortState,
} from '../lib/table';
import { dialogsAlert } from '../lib/dialogs';
import type { ToastHandle } from '../lib/toast';

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export type ForcedMode = 'panic' | 'graceful_stop' | 'tp_only';

export interface ForcedModeInfo {
  titleKey: string;
  textKey: string;
  cssClass: string;
  value: ForcedMode;
}

/** The legacy forced-mode modal table (:1031-1035). */
export const FORCED_MODES: Record<ForcedMode, ForcedModeInfo> = {
  panic: { titleKey: 'v7run.panicTitle', textKey: 'v7run.panic', cssClass: 'bg-danger text-[#f2f5fb] border-danger hover:opacity-85', value: 'panic' },
  graceful_stop: { titleKey: 'v7run.gracefulStopTitle', textKey: 'v7run.gracefulStop', cssClass: 'bg-warning text-accent-contrast border-warning hover:opacity-85', value: 'graceful_stop' },
  tp_only: { titleKey: 'v7run.takeProfitOnlyTitle', textKey: 'v7run.takeProfitOnly', cssClass: 'bg-success text-accent-contrast border-success hover:opacity-85', value: 'tp_only' },
};

export interface UseRunInstances {
  instances: Ref<RunInstance[]>;
  rows: Ref<RunInstance[]>;
  filterSearch: Ref<string>;
  filterStatus: Ref<string>;
  sort: Ref<SortState>;
  banner: Ref<'ok' | 'lost' | 'waiting'>;
  pb8Hosts: Ref<string[]>;
  /** 'N/M' sidebar count (:831-832). */
  countText: Ref<string>;
  pendingDeleteName: Ref<string | null>;
  deleteBusy: Ref<boolean>;
  pendingForced: Ref<{ name: string; mode: ForcedMode } | null>;
  forcedBusy: Ref<boolean>;
  loadInstances(): Promise<void>;
  setInstancesFromWs(data: unknown[]): void;
  setBanner(state: 'ok' | 'lost' | 'waiting'): void;
  setSort(col: string): void;
  editInstance(name: string): void;
  addInstance(): void;
  requestDelete(name: string): void;
  executeDelete(): Promise<void>;
  cancelDelete(): void;
  requestForcedMode(name: string, mode: ForcedMode): void;
  executeForcedMode(): Promise<void>;
  cancelForcedMode(): void;
  convertInstanceToV8(name: string): Promise<void>;
  openBalanceCalculator(name: string): Promise<void>;
}

export function useRunInstances(options: {
  t: TranslateFn;
  adapter: RunAdapter;
  toast: ToastHandle;
  /** Injectable for tests; defaults to window.location.href assignment. */
  navigate?: (url: string) => void;
}): UseRunInstances {
  const { t, adapter, toast } = options;
  const navigate = options.navigate ?? ((url: string) => void (window.location.href = url));

  const instances = ref<RunInstance[]>([]);
  const filterSearch = ref('');
  const filterStatus = ref('All');
  const sort = ref<SortState>({ col: 'name', asc: true }); // :578
  const banner = ref<'ok' | 'lost' | 'waiting'>('waiting');
  const pendingDeleteName = ref<string | null>(null);
  const deleteBusy = ref(false);
  const pendingForced = ref<{ name: string; mode: ForcedMode } | null>(null);
  const forcedBusy = ref(false);
  let loadGeneration = 0; // :581

  const rows = computed(() => filterAndSortInstances(instances.value, filterSearch.value, filterStatus.value, sort.value));
  const pb8Hosts = computed(() => pb8WarningHosts(instances.value, adapter.isV8)); // :770-788
  const countText = computed(() => `${rows.value.length}/${instances.value.length}`); // :831-832

  function setBanner(state: 'ok' | 'lost' | 'waiting'): void {
    banner.value = state;
  }

  function errorText(error: unknown, fallback409: string): string {
    /* Legacy detail order: body detail (translated) → 409 fallback → 'HTTP n'. */
    if (error instanceof ApiError) {
      if (error.detail) return serverMsg(error.detail);
      return error.status === 409 ? fallback409 : `HTTP ${error.status}`;
    }
    return String(error);
  }

  /* ── REST snapshot (:593-609) ── */

  async function loadInstances(): Promise<void> {
    const generation = ++loadGeneration;
    try {
      const data = (await apiFetch<{ instances?: RunInstance[] }>(apiUrl(adapter, '/instances'), {
        credentials: 'same-origin',
      })) as { instances?: RunInstance[] };
      if (generation !== loadGeneration) return;
      instances.value = data.instances || [];
      setBanner('ok');
    } catch {
      if (generation !== loadGeneration) return;
      setBanner('lost'); // :607-608 (legacy also logged to console.error)
    }
  }

  /** WS handler (:629-639): replace wholesale, invalidate in-flight REST. */
  function setInstancesFromWs(data: unknown[]): void {
    loadGeneration += 1;
    instances.value = data as RunInstance[];
    setBanner('ok');
  }

  function setSort(col: string): void {
    sort.value = nextSort(sort.value, col); // header onclick :759-764
  }

  /* ── navigation (:899-908) ── */

  function editInstance(name: string): void {
    navigate(editPageUrl(adapter, name));
  }

  function addInstance(): void {
    navigate(editPageUrl(adapter, null));
  }

  /* ── delete (:943-1001) ── */

  function requestDelete(name: string): void {
    const inst = instances.value.find((r) => r.name === name);
    if (inst && inst.running_on && inst.running_on.length > 0) {
      toast.show(t('v7run.cannotDeleteRunning', { name, hosts: inst.running_on.join(', ') }), 'err'); // :946-948
      return;
    }
    pendingDeleteName.value = name; // opens the ConfirmModal (:951-962)
  }

  function cancelDelete(): void {
    pendingDeleteName.value = null;
    deleteBusy.value = false;
  }

  async function executeDelete(): Promise<void> {
    const name = pendingDeleteName.value;
    if (!name || deleteBusy.value) return;
    deleteBusy.value = true; // confirm button disabled + 'Deleting…' (:971)
    try {
      const data = (await apiFetch<{ hosts?: DeleteHosts }>(
        apiUrl(adapter, '/instances/' + encodeURIComponent(name)),
        { method: 'DELETE', credentials: 'same-origin' }
      )) as { hosts?: DeleteHosts };
      cancelDelete();
      const summary = deleteHostsSummary(data.hosts);
      const hostInfo = summary ? t(summary.key, summary.params) : '';
      toast.show(t('v7run.instanceDeleted', { name }) + hostInfo, 'ok'); // :992
      instances.value = instances.value.filter((r) => r.name !== name); // :994
    } catch (error) {
      cancelDelete();
      toast.show(t('v7run.deleteFailed') + ': ' + errorText(error, t('v7run.instanceRunning')), 'err'); // :999
    }
  }

  /* ── forced modes (:1030-1077) ── */

  function requestForcedMode(name: string, mode: ForcedMode): void {
    pendingForced.value = { name, mode };
  }

  function cancelForcedMode(): void {
    pendingForced.value = null;
    forcedBusy.value = false;
  }

  async function executeForcedMode(): Promise<void> {
    const pending = pendingForced.value;
    if (!pending || forcedBusy.value) return;
    forcedBusy.value = true; // confirm button disabled + 'Syncing…' (:1059)
    const actionText = t(FORCED_MODES[pending.mode]!.textKey);
    try {
      const data = (await apiFetch<{ version?: number | string }>(
        apiUrl(adapter, '/instances/' + encodeURIComponent(pending.name) + '/forced-mode'),
        {
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({ mode: pending.mode }), // :1060-1063
        }
      )) as { version?: number | string };
      cancelForcedMode();
      toast.show(
        t('v7run.forcedModeSynced', { action: actionText, name: pending.name, version: data.version }),
        'ok'
      ); // :1071
      void loadInstances(); // :1072
    } catch (error) {
      cancelForcedMode();
      toast.show(t('v7run.forcedModeFailed', { action: actionText }) + ': ' + errorText(error, 'HTTP'), 'err'); // :1075
    }
  }

  /* ── V8 conversion (:910-941) ── */

  async function convertInstanceToV8(name: string): Promise<void> {
    const targetName = convertTargetName(name); // :911
    try {
      const payload = (await apiFetch<{ name?: string }>(migrateV7Url(), {
        method: 'POST',
        credentials: 'same-origin',
        body: JSON.stringify({ source_type: 'run_config', source_name: name, target_name: targetName }), // :917
      })) as { name?: string };
      navigate(backtestV8PageUrl(payload.name || targetName)); // :931
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await dialogsAlert({
          title: t('v7run.v8ConfigExists'), // :922-926
          message: error.detail ? serverMsg(error.detail) : t('v7run.configAlreadyExists', { name: targetName }),
          detail: t('v7run.v8ConfigWillOpen'),
          confirmText: t('v7run.open'),
        });
        navigate(backtestV8PageUrl(targetName)); // :927
        return;
      }
      const message = errorText(error, 'HTTP');
      toast.show(t('v7run.v8ConversionFailed') + ': ' + message, 'err'); // :933
      await dialogsAlert({
        title: t('v7run.v8ConversionFailed'), // :934-939
        message,
        detail: t('v7run.v8ConversionFailedDetail'),
        confirmText: t('common.ok'),
      });
    }
  }

  /* ── balance calculator handoff (:1003-1028) ── */

  async function openBalanceCalculator(name: string): Promise<void> {
    const inst = instances.value.find((item) => item.name === name) || ({} as RunInstance);
    if (adapter.isV8) {
      try {
        const configPayload = (await apiFetch<{ config?: unknown }>(
          apiUrl(adapter, '/instances/' + encodeURIComponent(name) + '/config'),
          { credentials: 'same-origin' }
        )) as { config?: unknown };
        const draftPayload = (await apiFetch<{ draft_id?: string }>(`${getBoot().origin}/api/balance-calc/draft`, {
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({ config: configPayload.config || {} }), // :1014
        })) as { draft_id?: string };
        navigate(
          balanceCalcPageUrl({
            draft_id: draftPayload.draft_id || '',
            exchange: String(inst.exchange || '').toLowerCase(),
          })
        ); // :1020-1021
      } catch (error) {
        toast.show(t('v7run.balanceCalculatorFailed') + ': ' + errorText(error, 'HTTP'), 'err'); // :1022
      }
      return;
    }
    const params: Record<string, string> = { instance: name, instance_version: 'v7' }; // :1025
    if (inst.exchange) params.exchange = String(inst.exchange).toLowerCase();
    navigate(balanceCalcPageUrl(params)); // :1027
  }

  return {
    instances,
    rows,
    filterSearch,
    filterStatus,
    sort,
    banner,
    pb8Hosts,
    countText,
    pendingDeleteName,
    deleteBusy,
    pendingForced,
    forcedBusy,
    loadInstances,
    setInstancesFromWs,
    setBanner,
    setSort,
    editInstance,
    addInstance,
    requestDelete,
    executeDelete,
    cancelDelete,
    requestForcedMode,
    executeForcedMode,
    cancelForcedMode,
    convertInstanceToV8,
    openBalanceCalculator,
  };
}
