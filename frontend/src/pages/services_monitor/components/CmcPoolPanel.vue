<script setup lang="ts">
/*
 * CMC pool panel, ported 1:1 from the legacy frontend/services_monitor.html
 * pbcoindata pool tab: renderCmcPool (summary cards, warnings, 20-column key
 * table, 11-column lease table), selectedCmcKey/updateCmcButtons (row
 * selection + toolbar gating), cmcMessage, openCmcKeyModal/submitCmcKey,
 * openCmcAuthorityModal/submitCmcAuthorityTransfer, toggleSelectedCmcKey and
 * deleteSelectedCmcKey. Loads stay in App (legacy loadCmcPool; the status bar
 * lives in CmcStatusBar above the tab bar) - this panel owns the mutation
 * engine (legacy _cmcMutation* state) and emits refresh.
 */
import { computed, ref, watch } from 'vue';
import { PhArrowClockwise } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { cmcDuration, cmcNumber, cmcTimestamp, createCmcMutationControl, newCmcOperationId, type CmcMutationCandidate } from '../cmc';
import type { CmcDomain, CmcKey, CmcKeyUsage, CmcLeasesResponse, CmcPool } from '../types';
import CmcAuthorityModal, { type CmcAuthorityOption } from './CmcAuthorityModal.vue';
import CmcKeyModal, { type CmcKeyPayload } from './CmcKeyModal.vue';

defineOptions({ name: 'CmcPoolPanel' });

interface Props {
  /** GET /cmc-pool payload (legacy _cmcPool; also the usage source). */
  pool?: CmcPool;
  /** GET /cmc-pool/leases payload (legacy _cmcLeases). */
  leases?: CmcLeasesResponse;
  /** True after the first successful load (legacy initial tbody placeholders). */
  loaded?: boolean;
  /** cmcMessage mirror of the latest load (legacy #cmc-pool-message). */
  loadNotice?: { text: string; error: boolean } | null;
}

const props = withDefaults(defineProps<Props>(), {
  pool: () => ({}),
  leases: () => ({}),
  loaded: false,
  loadNotice: null,
});

const emit = defineEmits<{ refresh: [] }>();

const { t } = useI18n();

const keys = computed(() => props.pool.keys ?? []);

/** Legacy cmcMessage: one inline message area shared by loads and mutations. */
const message = ref<{ text: string; error: boolean } | null>(null);

function cmcMessage(text: string, error: boolean): void {
  message.value = { text, error };
}

watch(
  () => props.loadNotice,
  (notice) => {
    if (notice) message.value = { ...notice };
  },
  { immediate: true }
);

/* ── Selection (legacy selectedCmcKey/selectCmcKey) ── */

const selectedKeyId = ref('');
const selectedKey = computed(() => keys.value.find((item) => item.id === selectedKeyId.value) ?? null);

/** Legacy renderCmcPool: drop the selection when the key leaves the payload. */
watch(keys, (list) => {
  if (selectedKeyId.value && !list.some((item) => item.id === selectedKeyId.value)) {
    selectedKeyId.value = '';
  }
});

function selectKey(keyId: string): void {
  selectedKeyId.value = String(keyId || '');
}

/* ── Joins (legacy keyUsage/domains maps in renderCmcPool) ── */

const keyUsageMap = computed<Record<string, CmcKeyUsage>>(() => {
  const map: Record<string, CmcKeyUsage> = {};
  for (const item of props.leases.key_usage ?? []) map[item.credential_id] = item;
  return map;
});

const domainMap = computed<Record<string, CmcDomain>>(() => {
  const map: Record<string, CmcDomain> = {};
  for (const item of props.leases.domains ?? []) map[item.quota_domain_id] = item;
  return map;
});

/** Key row joined with usage + domain state (legacy renderCmcPool closure). */
interface KeyRow {
  key: CmcKey;
  state: string;
  usage: CmcKeyUsage;
  domain: CmcDomain;
}

const rows = computed<KeyRow[]>(() =>
  keys.value.map((key) => ({
    key,
    state: key.local_state || (key.active === false ? 'disabled' : key.status || 'active'),
    usage: keyUsageMap.value[key.id] ?? ({} as CmcKeyUsage),
    domain: domainMap.value[key.quota_domain_id ?? ''] ?? ({} as CmcDomain),
  }))
);

function reachableText(value: boolean | undefined): string {
  return value === true ? 'yes' : value === false ? 'no' : 'unknown';
}

const leaseRows = computed(() => props.leases.leases ?? []);

const summaryCards = computed(() => {
  const authority = props.leases.authority ?? {};
  const domains = props.leases.domains ?? [];
  return [
    { label: 'Active Keys', value: `${props.pool.active_credentials || 0} / ${props.pool.total_credentials || keys.value.length}` },
    { label: 'Health', value: props.pool.health || 'unknown' },
    { label: 'Usage Day', value: String(props.pool.day || '-') },
    { label: 'Soft Limit', value: cmcNumber(props.pool.soft_credit_limit) },
    {
      label: 'Assigned Authorities',
      value:
        domains
          .map((item) => `${item.authority_node || item.authority_node_id || 'unassigned'} (epoch ${cmcNumber(item.authority_epoch)})`)
          .join(', ') || (authority.available === false ? 'Unavailable' : 'Unassigned'),
    },
    { label: 'Active Leases', value: cmcNumber(authority.active_leases || 0) },
    {
      label: 'Uncertain Spend',
      value: cmcNumber(domains.reduce((total, item) => total + Number(item.uncertain_credits || 0), 0)),
    },
  ];
});

const warnings = computed(() => [...(props.pool.warnings ?? []), ...(props.leases.warnings ?? [])]);

/* ── Toolbar gating (legacy updateCmcButtons) ── */

const disableLabel = computed(() => (selectedKey.value && selectedKey.value.active === false ? 'Re-enable' : 'Disable'));

const authorityTargets = computed(() => {
  const selected = selectedKey.value;
  const selectedDomain = selected ? (props.leases.domains ?? []).find((item) => item.quota_domain_id === selected.quota_domain_id) : undefined;
  return (props.pool.eligible_authority_nodes ?? []).filter((node) => !selectedDomain || node.node_id !== selectedDomain.authority_node_id);
});

/* ── Mutation engine (legacy _cmcMutation* state + cmcMutationFetch) ── */

const busy = ref(false);
/** Legacy _cmcOperationId: stable across key-modal retries, cleared on completion. */
const keyOperationId = ref('');
/** Legacy _cmcAuthorityOperationId. */
const authorityOperationId = ref('');

const keyModal = ref<InstanceType<typeof CmcKeyModal> | null>(null);

function isAbort(error: unknown): boolean {
  return (error as Error)?.name === 'AbortError';
}

function errorMessage(error: unknown): string {
  return (error as Error)?.message ?? '';
}

const control = createCmcMutationControl({
  onBusyChange(value) {
    busy.value = value;
  },
  clearSecret(context) {
    if (context.modal === 'key') keyModal.value?.clearSecretIfUnchanged(context.secretValue ?? '');
  },
  onContextCleared(context) {
    if (context.modal === 'key' && keyOperationId.value === context.operationId) keyOperationId.value = '';
    if (context.modal === 'authority' && authorityOperationId.value === context.operationId) authorityOperationId.value = '';
  },
  onRefresh() {
    emit('refresh');
  },
});

/* ── Key modal (legacy openCmcKeyModal/submitCmcKey/closeCmcKeyModal) ── */

const keyModalOpen = ref(false);
const keyModalMode = ref<'add' | 'rotate' | 'edit'>('add');
const keyModalError = ref('');

function openKeyModal(mode: 'add' | 'rotate' | 'edit'): void {
  if ((mode === 'rotate' || mode === 'edit') && !selectedKey.value) return;
  keyModalMode.value = mode === 'rotate' || mode === 'edit' ? mode : 'add';
  if (!keyOperationId.value) keyOperationId.value = newCmcOperationId('cmc');
  keyModalError.value = '';
  keyModalOpen.value = true;
}

function closeKeyModal(): void {
  if (busy.value) return;
  control.cancel('key');
  keyOperationId.value = '';
  keyModalError.value = '';
  keyModalOpen.value = false;
}

function submitKey(payload: CmcKeyPayload): void {
  const selected = selectedKey.value;
  const mode = keyModalMode.value;
  if (mode === 'rotate' || mode === 'edit') {
    if (!selected) return;
  }
  if (!keyOperationId.value) keyOperationId.value = newCmcOperationId('cmc');
  let path = '/cmc-pool/keys';
  let body: Record<string, unknown> = {
    api_key: payload.secret,
    label: payload.label,
    imported: payload.imported,
    shared: payload.shared,
    active: payload.active,
  };
  let action = 'cmc_create';
  let target = '';
  let method = 'POST';
  if (mode === 'rotate') {
    path += `/${encodeURIComponent(selected!.id)}/rotate`;
    action = 'cmc_rotate';
    target = selected!.id;
    body = { api_key: payload.secret };
  } else if (mode === 'edit') {
    path += `/${encodeURIComponent(selected!.id)}`;
    action = 'cmc_patch';
    target = selected!.id;
    method = 'PATCH';
    body = { label: payload.label, imported: payload.imported, shared: payload.shared, active: payload.active };
  }
  keyModalError.value = '';
  void control
    .run({
      operationId: keyOperationId.value,
      action,
      target,
      path,
      method,
      transport: 'body',
      body,
      modal: 'key',
      secretValue: mode === 'edit' ? '' : payload.secret,
    } satisfies CmcMutationCandidate)
    .then(() => {
      keyModalOpen.value = false;
      keyOperationId.value = '';
      emit('refresh');
    })
    .catch((error: unknown) => {
      if (isAbort(error)) return;
      keyModalError.value = errorMessage(error);
    });
}

/* ── Authority modal (legacy openCmcAuthorityModal/submit/close) ── */

const authorityModalOpen = ref(false);
const authorityModalError = ref('');
const authorityDomain = ref('');
const authorityCurrentText = ref('');
const authorityOptions = ref<CmcAuthorityOption[]>([]);

function openAuthorityModal(): void {
  if (busy.value) return;
  const selected = selectedKey.value;
  if (!selected || !selected.quota_domain_id) return;
  const domain = domainMap.value[selected.quota_domain_id] ?? ({} as CmcDomain);
  const options = (props.pool.eligible_authority_nodes ?? [])
    .filter((node) => node.node_id !== domain.authority_node_id)
    .map((node) => ({ nodeId: node.node_id, text: `${node.name || node.node_id} (${node.node_id})` }));
  authorityDomain.value = selected.quota_domain_id;
  authorityCurrentText.value =
    `${domain.authority_node || domain.authority_node_id || t('sysmon.unassigned')} · ` +
    `${t('sysmon.epochLabel', { v: cmcNumber(domain.authority_epoch) })} · ` +
    `${t('sysmon.reachableLabel', { v: domain.authority_reachable === true ? t('sysmon.yes') : domain.authority_reachable === false ? t('sysmon.no') : t('sysmon.unknownState') })}`;
  if (!options.length) {
    authorityModalError.value = t('sysmon.noAlternateMaster');
    return;
  }
  authorityModalError.value = '';
  authorityOptions.value = options;
  if (!authorityOperationId.value) authorityOperationId.value = newCmcOperationId('cmc-authority');
  authorityModalOpen.value = true;
}

function closeAuthorityModal(): void {
  if (busy.value) return;
  control.cancel('authority');
  authorityOperationId.value = '';
  authorityModalError.value = '';
  authorityModalOpen.value = false;
}

type DialogsGlobal = Window & { PBGuiDialogs?: { confirm: (opts: Record<string, string>) => Promise<boolean> } };

async function submitAuthorityTransfer(targetNodeId: string): Promise<void> {
  const selected = selectedKey.value;
  if (!selected || !selected.quota_domain_id || !targetNodeId || busy.value) return;
  const domain = domainMap.value[selected.quota_domain_id] ?? ({} as CmcDomain);
  const targetNode = (props.pool.eligible_authority_nodes ?? []).find((node) => node.node_id === targetNodeId);
  const confirmed = await (window as DialogsGlobal).PBGuiDialogs!.confirm({
    title: t('sysmon.transferCmcAuthority'),
    message: t('sysmon.transferCmcAuthorityMsg', { domain: selected.quota_domain_id, node: targetNode?.name || targetNodeId }),
    detail: t('sysmon.transferCmcAuthorityDetail'),
    confirmText: t('sysmon.transferAuthority'),
  });
  if (!confirmed) {
    authorityOperationId.value = '';
    return;
  }
  if (!authorityOperationId.value) authorityOperationId.value = newCmcOperationId('cmc-authority');
  const operationId = authorityOperationId.value;
  void control
    .run({
      operationId,
      action: 'cmc_authority_transfer',
      target: `${selected.quota_domain_id}:${targetNodeId}`,
      path: '/cmc-pool/authority/transfer',
      method: 'POST',
      transport: 'body',
      identifierField: 'request_id',
      body: {
        quota_domain_id: selected.quota_domain_id,
        authority_node_id: targetNodeId,
        expected_epoch: domain.authority_epoch == null ? null : Number(domain.authority_epoch),
      },
      modal: 'authority',
    } satisfies CmcMutationCandidate)
    .then((payload) => {
      authorityModalOpen.value = false;
      authorityOperationId.value = '';
      cmcMessage(t('sysmon.authorityTransferred', { id: (payload as { operation_id?: string } | null)?.operation_id || operationId }), false);
      emit('refresh');
    })
    .catch((error: unknown) => {
      authorityModalError.value = errorMessage(error);
    });
}

/* ── Enable/disable/delete (legacy toggleSelectedCmcKey/deleteSelectedCmcKey) ── */

function toggleSelectedCmcKey(): void {
  const selected = selectedKey.value;
  if (!selected) return;
  const enable = selected.active === false;
  cmcMessage(t(enable ? 'sysmon.cmcReEnabling' : 'sysmon.cmcDisabling', { label: selected.label || selected.id }), false);
  void control
    .run({
      operationId: newCmcOperationId(enable ? 'cmc-enable' : 'cmc-disable'),
      action: enable ? 'cmc_patch' : 'cmc_disable',
      target: selected.id,
      path: `/cmc-pool/keys/${encodeURIComponent(selected.id)}${enable ? '' : '/disable'}`,
      method: enable ? 'PATCH' : 'POST',
      transport: enable ? 'body' : 'query',
      body: enable ? { active: true } : {},
      modal: '',
    } satisfies CmcMutationCandidate)
    .then(() => {
      emit('refresh');
    })
    .catch((error: unknown) => {
      if (isAbort(error)) return;
      cmcMessage(errorMessage(error), true);
    });
}

async function deleteSelectedCmcKey(): Promise<void> {
  const selected = selectedKey.value;
  if (!selected) return;
  const confirmed = await (window as DialogsGlobal).PBGuiDialogs!.confirm({
    title: t('sysmon.deleteCmcKey'),
    message: t('sysmon.deleteCmcKeyMsg', { label: selected.label || selected.id }),
    detail: t('sysmon.deleteCmcKeyDetail'),
    confirmText: t('common.delete'),
  });
  if (!confirmed) return;
  void control
    .run({
      operationId: newCmcOperationId('cmc-delete'),
      action: 'cmc_delete',
      target: selected.id,
      path: `/cmc-pool/keys/${encodeURIComponent(selected.id)}`,
      method: 'DELETE',
      transport: 'query',
      body: {},
      modal: '',
    } satisfies CmcMutationCandidate)
    .then(() => {
      selectedKeyId.value = '';
      emit('refresh');
    })
    .catch((error: unknown) => {
      if (isAbort(error)) return;
      cmcMessage(errorMessage(error), true);
    });
}

</script>

<template>
  <div class="cmc-pool-wrap">
    <div v-if="loaded" class="cmc-summary-grid">
      <div v-for="card in summaryCards" :key="card.label" class="cmc-summary-card">
        <div class="cmc-summary-label">{{ card.label }}</div>
        <div class="cmc-summary-value">{{ card.value }}</div>
      </div>
    </div>

    <div class="cmc-pool-toolbar">
      <button class="form-btn save" id="cmc-add-key-btn" data-cmc-mutation type="button" :disabled="busy" @click="openKeyModal('add')">{{ t('sysmon.addKey') }}</button>
      <button class="form-btn" id="cmc-rotate-btn" type="button" :disabled="busy || !selectedKey" @click="openKeyModal('rotate')">{{ t('sysmon.rotate') }}</button>
      <button class="form-btn" id="cmc-edit-btn" type="button" :disabled="busy || !selectedKey" @click="openKeyModal('edit')">{{ t('sysmon.edit') }}</button>
      <button class="form-btn" id="cmc-disable-btn" type="button" :disabled="busy || !selectedKey" @click="toggleSelectedCmcKey">{{ disableLabel }}</button>
      <button class="form-btn" id="cmc-delete-btn" type="button" :disabled="busy || !selectedKey" @click="deleteSelectedCmcKey">{{ t('common.delete') }}</button>
      <button
        class="form-btn"
        id="cmc-authority-btn"
        type="button"
        :disabled="busy || !selectedKey || !selectedKey.quota_domain_id || !authorityTargets.length"
        @click="openAuthorityModal"
      >{{ t('sysmon.transferAuthority') }}</button>
      <button class="form-btn" id="cmc-refresh-btn" type="button" @click="emit('refresh')"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</button>
      <span class="cmc-pool-message" :class="{ error: message?.error }">{{ message?.text ?? '' }}</span>
    </div>

    <div class="cmc-pool-warnings">
      <div v-for="(warning, index) in warnings" :key="index" class="cmc-pool-warning">{{ warning }}</div>
    </div>

    <div class="cmc-table-wrap">
      <table class="cmc-table">
        <thead>
          <tr>
            <th>{{ t('sysmon.label') }}</th>
            <th>{{ t('sysmon.local') }}</th>
            <th>{{ t('sysmon.desired') }}</th>
            <th>{{ t('sysmon.materializedDesired') }}</th>
            <th>{{ t('sysmon.source') }}</th>
            <th>{{ t('sysmon.shared') }}</th>
            <th>{{ t('sysmon.localUsed') }}</th>
            <th>{{ t('sysmon.reserved') }}</th>
            <th>{{ t('sysmon.uncertain') }}</th>
            <th>{{ t('sysmon.providerUsed') }}</th>
            <th>{{ t('sysmon.providerLimit') }}</th>
            <th>{{ t('sysmon.providerRemaining') }}</th>
            <th>{{ t('sysmon.providerReset') }}</th>
            <th>{{ t('sysmon.providerAge') }}</th>
            <th>{{ t('sysmon.cooldown') }}</th>
            <th>{{ t('sysmon.quotaDomain') }}</th>
            <th>{{ t('sysmon.assignedAuthority') }}</th>
            <th>{{ t('sysmon.epochReachable') }}</th>
            <th>{{ t('sysmon.authorityUpdated') }}</th>
            <th>{{ t('sysmon.authorityAge') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loaded"><td colspan="20">{{ t('sysmon.loadingPool') }}</td></tr>
          <tr v-else-if="!rows.length"><td colspan="20" class="cmc-empty">No CMC keys configured.</td></tr>
          <tr
            v-for="row in rows"
            v-else
            :key="row.key.id"
            :data-key-id="row.key.id"
            :class="{ selected: row.key.id === selectedKeyId }"
            @click="selectKey(row.key.id)"
          >
            <td>{{ row.key.label || row.key.id }}</td>
            <td><span class="cmc-state" :class="row.state">{{ row.state }}</span></td>
            <td>{{ row.key.desired_state || '-' }}</td>
            <td>{{ cmcNumber(row.key.materialized_generation) }} / {{ cmcNumber(row.key.desired_generation) }}</td>
            <td>{{ row.key.source || 'local' }}</td>
            <td>{{ row.key.shared ? 'Yes' : 'No' }}</td>
            <td>{{ cmcNumber(row.key.used_credits) }}</td>
            <td>{{ cmcNumber(row.usage.reserved_credits) }} / {{ cmcNumber(row.usage.reserved_requests) }} req</td>
            <td>{{ cmcNumber(row.domain.uncertain_credits) }}</td>
            <td>{{ cmcNumber(row.key.provider_used) }}</td>
            <td>{{ cmcNumber(row.key.provider_limit) }}</td>
            <td>{{ cmcNumber(row.domain.provider_remaining != null ? row.domain.provider_remaining : row.key.provider_remaining) }}</td>
            <td>{{ cmcTimestamp(row.domain.provider_reset_at != null ? row.domain.provider_reset_at : row.key.provider_reset_at) }}</td>
            <td>{{ cmcDuration(row.domain.provider_stale_age_seconds != null ? row.domain.provider_stale_age_seconds : row.key.provider_stale_age_seconds) }}</td>
            <td>{{ cmcDuration(row.key.cooldown_remaining) }}</td>
            <td>{{ row.key.quota_domain_id || '-' }}</td>
            <td>{{ row.domain.authority_node || row.domain.authority_node_id || '-' }}</td>
            <td>{{ cmcNumber(row.domain.authority_epoch != null ? row.domain.authority_epoch : row.key.authority_epoch) }} / {{ reachableText(row.domain.authority_reachable) }}</td>
            <td>{{ cmcTimestamp(row.domain.authority_updated_at) }}</td>
            <td>{{ cmcDuration(row.domain.authority_state_age_seconds) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="form-section-title cmc-lease-title">{{ t('sysmon.leaseDetails') }}</div>
    <div class="cmc-table-wrap cmc-leases-wrap">
      <table class="cmc-table">
        <thead>
          <tr>
            <th>{{ t('sysmon.lease') }}</th>
            <th>{{ t('sysmon.key') }}</th>
            <th>{{ t('sysmon.generation') }}</th>
            <th>{{ t('sysmon.quotaDomain') }}</th>
            <th>{{ t('sysmon.authorityEpoch') }}</th>
            <th>{{ t('sysmon.recipient') }}</th>
            <th>{{ t('sysmon.reserved') }}</th>
            <th>{{ t('sysmon.requests') }}</th>
            <th>{{ t('sysmon.granted') }}</th>
            <th>{{ t('sysmon.expires') }}</th>
            <th>{{ t('sysmon.outcome') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="!loaded"><td colspan="11">{{ t('sysmon.loadingLeases') }}</td></tr>
          <tr v-else-if="!leaseRows.length"><td colspan="11" class="cmc-empty">No lease records.</td></tr>
          <tr v-for="(lease, index) in leaseRows" v-else :key="lease.lease_id ?? index">
            <td>{{ lease.lease_id || '-' }}</td>
            <td>{{ lease.credential_id || '-' }}</td>
            <td>{{ cmcNumber(lease.generation) }}</td>
            <td>{{ lease.quota_domain_id || '-' }}</td>
            <td>{{ cmcNumber(lease.authority_epoch) }}</td>
            <td>{{ lease.recipient || '-' }}</td>
            <td>{{ cmcNumber(lease.credits) }}</td>
            <td>{{ cmcNumber(lease.request_count) }}</td>
            <td>{{ cmcTimestamp(lease.granted_at) }}</td>
            <td>{{ cmcTimestamp(lease.expires_at) }}</td>
            <td>{{ lease.outcome || (lease.terminal ? 'terminal' : 'active') }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <CmcKeyModal
      ref="keyModal"
      :open="keyModalOpen"
      :mode="keyModalMode"
      :selected="selectedKey"
      :busy="busy"
      :error="keyModalError"
      @submit="submitKey"
      @update:open="(open) => { if (!open) closeKeyModal(); }"
    />
    <CmcAuthorityModal
      :open="authorityModalOpen"
      :busy="busy"
      :error="authorityModalError"
      :quota-domain="authorityDomain"
      :current-text="authorityCurrentText"
      :options="authorityOptions"
      @submit="submitAuthorityTransfer"
      @update:open="(open) => { if (!open) closeAuthorityModal(); }"
    />
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (CMC pool + settings form). -->
<style scoped>
.cmc-pool-wrap { padding: 1rem 1.5rem 1.5rem; overflow-y: auto; flex: 1; }
.cmc-summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.6rem; margin-bottom: 0.8rem; }
.cmc-summary-card { background: #131b2b; border: 1px solid #1e2736; border-radius: 8px; padding: 0.55rem 0.7rem; min-width: 0; }
.cmc-summary-label { color: #64748b; font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.05em; }
.cmc-summary-value { color: #e2e8f0; font-size: var(--fs-md); font-weight: 700; margin-top: 0.2rem; overflow: hidden; text-overflow: ellipsis; }
.cmc-pool-toolbar { display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; margin-bottom: 0.7rem; }
.cmc-pool-message { color: #64748b; font-size: var(--fs-xs); margin-left: auto; }
.cmc-pool-message.error { color: #fca5a5; }
.cmc-pool-warnings { display: grid; gap: 0.35rem; margin-bottom: 0.7rem; }
.cmc-pool-warning { color: #fbbf24; background: #2d220d; border: 1px solid #713f12; border-radius: 6px; padding: 0.45rem 0.6rem; font-size: var(--fs-xs); }
.cmc-table-wrap { overflow: auto; border: 1px solid #1e2736; border-radius: 8px; }
.cmc-table { width: 100%; border-collapse: collapse; font-size: var(--fs-xs); min-width: 1500px; }
.cmc-table th { position: sticky; top: 0; z-index: 1; background: #111827; color: #64748b; padding: 0.45rem 0.6rem; text-align: left; border-bottom: 2px solid #1e2736; white-space: nowrap; }
.cmc-table td { padding: 0.42rem 0.6rem; border-bottom: 1px solid #1e2736; color: #cbd5e1; white-space: nowrap; }
.cmc-table tbody tr { cursor: pointer; }
.cmc-table tbody tr:hover td { background: #131b2b; }
.cmc-table tbody tr.selected td { background: rgba(77, 166, 255, 0.12); }
.cmc-table tbody tr.selected td:first-child { border-left: 3px solid #4da6ff; padding-left: calc(0.6rem - 3px); }
.cmc-empty { color: #64748b; cursor: default; }
.cmc-lease-title { margin-top: 1rem; }
.cmc-leases-wrap .cmc-table { min-width: 1050px; }
.cmc-leases-wrap tbody tr { cursor: default; }
.cmc-state { display: inline-flex; align-items: center; padding: 0.1rem 0.42rem; border-radius: 999px; border: 1px solid #2d3748; color: #94a3b8; font-weight: 700; text-transform: uppercase; }
.cmc-state.active { color: #4ade80; border-color: rgba(33, 195, 84, 0.45); background: #052e16; }
.cmc-state.disabled, .cmc-state.invalid { color: #fca5a5; border-color: #7f1d1d; background: #2d1515; }
.form-section-title { font-size: var(--fs-sm); font-weight: 700; color: #94a3b8; margin: 0 0 0.5rem; }
.form-btn { padding: 0 1rem; height: var(--btn-h); border-radius: 5px; border: 1px solid #2d3748; background: #1a202c; color: #94a3b8; cursor: pointer; font-size: var(--fs-sm); font-family: inherit; transition: all 0.12s; }
.form-btn:hover { border-color: #4a5568; color: #e2e8f0; }
.form-btn.save { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
.form-btn.save:hover { background: #1d4ed8; color: #fff; }
.cmc-pool-toolbar .form-btn:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
