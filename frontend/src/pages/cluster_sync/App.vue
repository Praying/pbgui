<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { PhArrowClockwise, PhWrench, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { apiFetch, ApiError } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import type { PageSection } from '@/shared/navigation';
import { clusterApiBase } from './config';

const { t } = useI18n();
const apiBase = clusterApiBase();
type Section = 'overview' | 'setup' | 'nodes' | 'instances' | 'tombstones' | 'operations' | 'credentials' | 'retention';
const section = ref<Section>('overview');

/* Page sections live in the workbench rail (accordion under this page's
   entry) — the legacy in-page cluster-sidebar column is retired. */
const SECTION_LABEL_KEYS: Record<Section, string> = {
  overview: 'sysmon.overview',
  setup: 'sysmon.setup',
  nodes: 'sysmon.clusterNodes',
  instances: 'sysmon.v7State',
  tombstones: 'sysmon.tombstones',
  operations: 'sysmon.oplog',
  credentials: 'sysmon.credentials',
  retention: 'sysmon.retention',
};
const sections = computed<PageSection[]>(() =>
  (Object.keys(SECTION_LABEL_KEYS) as Section[]).map((key) => ({
    key,
    label: t(SECTION_LABEL_KEYS[key]),
  })),
);

function onSectionSelect(sectionKey: string): void {
  section.value = sectionKey as Section;
}

const loading = ref(true);
const status = ref<Record<string, any>>({});
const nodes = ref<Record<string, any>[]>([]);
const localClusterSsh = ref<Record<string, any>>({});
const desired = ref<Record<string, any>>({ instances: [], tombstones: [] });
const oplog = ref<Record<string, any>[]>([]);
const retentionReport = ref<Record<string, any>>({});
const bootstrap = ref<Record<string, any>>({ items: [], counts: {} });
const remoteStatus = ref<Record<string, any>>({ nodes: [] });
const notice = ref<{ text: string; kind: 'ok' | 'err' | 'warn' } | null>(null);
const removeNode = ref<Record<string, any> | null>(null);
const settingsNode = ref<Record<string, any> | null>(null);
const settingsForm = ref({ remote_pbgui_dir: '', sync_mode: 'reachable', ssh_host: '', ssh_user: '', ssh_port: 22, sync_peers: [] as string[] });
const retentionDays = ref(7);
const retentionMode = ref('report_only');
const selfJoinForm = ref({ hostname: '', remote_pbgui_dir: '', ssh_host: '', ssh_user: '', ssh_port: 22, reset: false });

const counts = computed(() => status.value.counts || {});
const identity = computed(() => status.value.identity || {});
const credentials = computed(() => status.value.credentials || desired.value.credentials || {});
const localNodeId = computed(() => String(identity.value.node_id || ''));
const nodeIds = computed(() => nodes.value.map((node) => String(node.node_id || '')).filter(Boolean));
const warnings = computed(() => Array.isArray(status.value.warnings) ? status.value.warnings : []);

function safeText(value: unknown): string { return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(); }
function display(value: unknown): string { return safeText(value) || '—'; }
function apiMessage(error: unknown): string { return error instanceof ApiError ? `${error.status}: ${error.detail}` : error instanceof Error ? error.message : String(error); }
function showNotice(text: unknown, kind: 'ok' | 'err' | 'warn' = 'ok'): void { notice.value = { text: safeText(text), kind }; }
function jsonText(value: unknown): string { return JSON.stringify(value || {}, null, 2); }
function timeText(value: unknown): string { if (!value) return '—'; const date = new Date(Number(value) * 1000); return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().replace('T', ' ').slice(0, 19); }
function nodeLabel(node: Record<string, any>): string { return String(node.pbname || node.hostname || node.node_id || '—'); }
function statusClass(value: unknown): string { const state = String(value || '').toLowerCase(); return ['ready', 'ok', 'healthy', 'reachable', 'current', 'synced'].includes(state) ? 'good' : ['conflict', 'error', 'failed', 'disabled'].includes(state) ? 'bad' : 'warn'; }

async function loadAll(): Promise<void> {
  loading.value = true;
  try {
    const [statusData, nodesData, desiredData, oplogData, retentionData, bootstrapData, remoteData] = await Promise.all([
      apiFetch<Record<string, any>>(`${apiBase}/status`), apiFetch<Record<string, any>>(`${apiBase}/nodes`), apiFetch<Record<string, any>>(`${apiBase}/desired-state`),
      apiFetch<Record<string, any>>(`${apiBase}/oplog?limit=100`), apiFetch<Record<string, any>>(`${apiBase}/retention/report`), apiFetch<Record<string, any>>(`${apiBase}/bootstrap-preview`), apiFetch<Record<string, any>>(`${apiBase}/remote-status`),
    ]);
    status.value = statusData || {};
    nodes.value = Array.isArray(nodesData.nodes) ? nodesData.nodes : [];
    localClusterSsh.value = nodesData.local_cluster_ssh || {};
    desired.value = desiredData || {};
    oplog.value = Array.isArray(oplogData.operations) ? oplogData.operations : [];
    retentionReport.value = retentionData || {};
    bootstrap.value = bootstrapData || {};
    remoteStatus.value = remoteData || {};
    retentionDays.value = Number(status.value.retention_policy?.history_days || 7);
    retentionMode.value = String(status.value.retention_policy?.mode || 'report_only');
  } catch (error) { showNotice(apiMessage(error), 'err'); }
  finally { loading.value = false; }
}

async function post(path: string, options: RequestInit = {}): Promise<Record<string, any>> {
  try {
    const result = await apiFetch<Record<string, any>>(`${apiBase}${path}`, { ...options, headers: { ...(options.headers || {}), 'Content-Type': 'application/json' } });
    showNotice(result.message || t('sysmon.actionCompleted', { svc: path }), 'ok');
    await loadAll();
    return result;
  } catch (error) { showNotice(apiMessage(error), 'err'); return {}; }
}

async function toggleSync(node: Record<string, any>): Promise<void> {
  const enabled = node.sync_enabled !== false;
  await post(`/nodes/${encodeURIComponent(String(node.node_id))}/sync?sync_enabled=${!enabled}`, { method: 'POST' });
}

function openSettings(node: Record<string, any>): void {
  settingsNode.value = node;
  settingsForm.value = { remote_pbgui_dir: String(node.remote_pbgui_dir || ''), sync_mode: String(node.sync_mode || 'reachable'), ssh_host: String(node.ssh_host || ''), ssh_user: String(node.ssh_user || ''), ssh_port: Number(node.ssh_port || 22), sync_peers: Array.isArray(node.sync_peers) ? [...node.sync_peers] : [] };
}
function closeSettings(): void { settingsNode.value = null; }
async function saveSettings(): Promise<void> {
  if (!settingsNode.value) return;
  await post(`/nodes/${encodeURIComponent(String(settingsNode.value.node_id))}/settings`, { method: 'POST', body: JSON.stringify(settingsForm.value) });
  closeSettings();
}
function openRemove(node: Record<string, any>): void { removeNode.value = node; }
function closeRemove(): void { removeNode.value = null; }
async function confirmRemove(): Promise<void> { if (!removeNode.value) return; await post(`/nodes/${encodeURIComponent(String(removeNode.value.node_id))}/remove`, { method: 'POST' }); closeRemove(); }
async function saveRetention(): Promise<void> { await post('/retention/settings', { method: 'POST', body: JSON.stringify({ mode: retentionMode.value, history_days: Number(retentionDays.value), expected_generation: Number(status.value.generation || 0) }) }); }
async function applyBootstrap(): Promise<void> { await post('/bootstrap', { method: 'POST' }); }
async function bootstrapNode(hostname: string): Promise<void> { await post(`/bootstrap/nodes/${encodeURIComponent(hostname)}`, { method: 'POST' }); }
async function joinRemote(node: Record<string, any>): Promise<void> { await post(`/remote-join/${encodeURIComponent(String(node.node_id))}`, { method: 'POST' }); }
async function repairNode(node: Record<string, any>): Promise<void> { await post(`/nodes/${encodeURIComponent(String(node.node_id))}/cluster-ssh/repair`, { method: 'POST', body: JSON.stringify({}) }); }
async function rewrapCredentials(): Promise<void> { await post('/credentials/rewrap', { method: 'POST', body: JSON.stringify({}) }); }
async function rotateCredentialKey(): Promise<void> { await post('/credentials/rotate-local-key', { method: 'POST' }); }
async function startSelfJoin(): Promise<void> { await post('/self-join/start', { method: 'POST', body: JSON.stringify({ hostname: selfJoinForm.value.hostname, remote_pbgui_dir: selfJoinForm.value.remote_pbgui_dir, ssh_host: selfJoinForm.value.ssh_host, ssh_user: selfJoinForm.value.ssh_user, ssh_port: Number(selfJoinForm.value.ssh_port), reset_existing: selfJoinForm.value.reset }) }); }

onMounted(() => { document.title = t('sysmon.clusterSyncTitle'); void loadAll(); });
</script>

<template>
  <AppShell
    class="operations-shell operations-shell--cluster"
    page-key="system_cluster"
    :page-title="t('sysmon.clusterSync')"
    :page-description="t('sysmon.clusterSyncSubtitle')"
    :sections="sections"
    :active-section="section"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('sysmon.status')"
        :value="loading ? t('common.loading') : notice ? notice.text : t('common.ok')"
        :tone="loading ? 'warning' : notice?.kind === 'err' ? 'danger' : notice?.kind === 'warn' ? 'warning' : 'success'"
      />
    </template>

    <template #header-actions>
      <button class="cluster-btn primary" @click="loadAll"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</button>
      <button class="cluster-btn warn" @click="section = 'setup'"><PbIcon :icon="PhWrench" /> {{ t('sysmon.setup') }}</button>
    </template>

  <div class="cluster-sync">
    <div class="cluster-layout">
      <section class="cluster-main">
        <div
          v-if="notice"
          class="cluster-status visible"
          :class="notice.kind"
          :role="notice.kind === 'err' ? 'alert' : 'status'"
          :aria-live="notice.kind === 'err' ? 'assertive' : 'polite'"
        >{{ notice.text }}</div>
        <LoadingSkeleton v-if="loading" class="cluster-empty" :label="t('common.loading')" />
        <ErrorState
          v-else-if="notice?.kind === 'err' && !Object.keys(status).length"
          class="cluster-error"
          :title="t('common.error')"
          :message="notice.text"
          :retry-label="t('common.refresh')"
          @retry="loadAll"
        />

        <section v-else-if="section === 'overview'" data-section="overview" class="cluster-grid">
          <div class="cluster-grid two"><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.localIdentity') }}</span><span class="cluster-pill good">{{ display(identity.role) }}</span></div><div class="cluster-panel-body"><div class="cluster-counts"><div class="cluster-count"><div class="cluster-count-label">Cluster ID</div><div class="cluster-count-value" data-field="cluster-id">{{ display(identity.cluster_id) }}</div></div><div class="cluster-count"><div class="cluster-count-label">Node ID</div><div class="cluster-count-value">{{ display(identity.node_id) }}</div></div><div class="cluster-count"><div class="cluster-count-label">Generation</div><div class="cluster-count-value">{{ counts.oplog || 0 }}</div></div></div></div></article><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.summary') }}</span></div><div class="cluster-panel-body"><div class="cluster-counts"><div class="cluster-count"><div class="cluster-count-label">Nodes</div><div class="cluster-count-value" data-count="nodes">{{ counts.nodes || 0 }}</div></div><div class="cluster-count"><div class="cluster-count-label">V7</div><div class="cluster-count-value">{{ counts.instances || 0 }}</div></div><div class="cluster-count"><div class="cluster-count-label">Conflicts</div><div class="cluster-count-value">{{ counts.conflicts || 0 }}</div></div></div><div v-for="warning in warnings" :key="warning" class="cluster-note">{{ warning }}</div></div></article></div>
          <article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ 'Checkpoint' }}</span></div><div class="cluster-panel-body"><span class="cluster-pill" :class="statusClass(status.checkpoint?.status)">{{ display(status.checkpoint?.status) }}</span><span class="cluster-note"> {{ display(status.sync_status?.healthy ? t('common.ok') : t('sysmon.unknownState')) }}</span></div></article>
        </section>

        <section v-else-if="section === 'setup'" data-section="setup" class="cluster-grid two"><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.bootstrapClusterState') }}</span><button class="cluster-btn warn" :disabled="!bootstrap.items?.length" @click="applyBootstrap">{{ t('sysmon.applyBootstrap') }}</button></div><div class="cluster-panel-body"><div class="cluster-note">{{ t('sysmon.bootstrapClusterStateNote') }}</div><div v-if="bootstrap.items?.length" class="cluster-table-wrap"><table class="cluster-table"><thead><tr><th>Type</th><th>Name</th><th>Action</th><th></th></tr></thead><tbody><tr v-for="item in bootstrap.items" :key="`${item.type}:${item.name || item.hostname}`"><td>{{ item.type }}</td><td>{{ display(item.name || item.hostname) }}</td><td>{{ item.action }}</td><td><button v-if="item.type === 'node'" class="cluster-btn small" @click="bootstrapNode(String(item.hostname || item.name))">{{ t('sysmon.bootstrap') }}</button></td></tr></tbody></table></div><div v-else class="cluster-empty">{{ t('sysmon.noData') }}</div></div></article><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.selfJoin') }}</span><button class="cluster-btn warn" @click="startSelfJoin">{{ t('sysmon.joinExistingCluster') }}</button></div><div class="cluster-panel-body cluster-form"><label>Hostname<input v-model="selfJoinForm.hostname" class="cluster-input"></label><label>SSH Host<input v-model="selfJoinForm.ssh_host" class="cluster-input"></label><label>SSH User<input v-model="selfJoinForm.ssh_user" class="cluster-input"></label><label>SSH Port<input v-model.number="selfJoinForm.ssh_port" type="number" class="cluster-input"></label><label><input v-model="selfJoinForm.reset" type="checkbox"> {{ t('sysmon.recovery') }}</label></div></article></section>

        <section v-else-if="section === 'nodes'" data-section="nodes" class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.clusterNodes') }}</span><span class="cluster-note">{{ nodes.length }} nodes</span></div><div class="cluster-panel-body cluster-table-wrap"><table class="cluster-table"><thead><tr><th>Node</th><th>Role</th><th>Sync</th><th>SSH</th><th>Actions</th></tr></thead><tbody><tr v-for="node in nodes" :key="node.node_id"><td><strong>{{ nodeLabel(node) }}</strong><div class="cluster-note">{{ node.node_id }}</div></td><td>{{ display(node.role) }}</td><td><span class="cluster-pill" :class="statusClass(node.sync_enabled === false ? 'disabled' : 'synced')">{{ node.sync_enabled === false ? t('sysmon.disabled') : t('common.enabled') }}</span></td><td>{{ display(node.ssh_host) }}:{{ node.ssh_port || 22 }}</td><td class="cluster-actions"><button data-action="toggle-sync" :data-node-id="node.node_id" class="cluster-btn small" :disabled="node.node_id === localNodeId" @click="toggleSync(node)">{{ node.sync_enabled === false ? t('sysmon.enable') : t('sysmon.disable') }}</button><button class="cluster-btn small" @click="openSettings(node)">{{ t('sysmon.editClusterNode') }}</button><button class="cluster-btn small" @click="joinRemote(node)">{{ t('sysmon.joinRemoteClusterNode') }}</button><button class="cluster-btn small" @click="repairNode(node)">{{ t('sysmon.repairAllSsh') }}</button><button data-action="remove-node" :data-node-id="node.node_id" class="cluster-btn small danger" :disabled="node.node_id === localNodeId" @click="openRemove(node)">{{ t('sysmon.removeNode') }}</button></td></tr></tbody></table><div v-if="!nodes.length" class="cluster-empty">{{ t('sysmon.noClusterNodes') }}</div></div></section>

        <section v-else-if="section === 'instances'" data-section="instances" class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.v7State') }}</span></div><div class="cluster-panel-body cluster-table-wrap"><table class="cluster-table"><thead><tr><th>Instance</th><th>Current</th><th>Desired</th><th>Status</th></tr></thead><tbody><tr v-for="item in desired.instances || []" :key="item.instance || item.name"><td>{{ display(item.instance || item.name) }}</td><td>{{ display(item.current_version) }}</td><td>{{ display(item.desired_version) }}</td><td><span class="cluster-pill" :class="statusClass(item.conflicted ? 'conflict' : 'synced')">{{ item.conflicted ? t('sysmon.conflict') : t('sysmon.synced') }}</span></td></tr></tbody></table></div></section>
        <section v-else-if="section === 'tombstones'" data-section="tombstones" class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.tombstones') }}</span></div><div class="cluster-panel-body cluster-table-wrap"><table class="cluster-table"><thead><tr><th>Instance</th><th>Created</th><th>Reason</th></tr></thead><tbody><tr v-for="item in desired.tombstones || []" :key="item.instance"><td>{{ display(item.instance || item.name) }}</td><td>{{ timeText(item.created_at) }}</td><td>{{ display(item.reason) }}</td></tr></tbody></table></div></section>
        <section v-else-if="section === 'operations'" data-section="operations" class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.oplog') }}</span></div><div class="cluster-panel-body cluster-table-wrap"><table class="cluster-table"><thead><tr><th>Created</th><th>Operation</th><th>Target</th><th>Seq</th></tr></thead><tbody><tr v-for="op in oplog" :key="op.op_id || `${op.seq}:${op.created_at}`"><td>{{ timeText(op.created_at) }}</td><td><span class="cluster-pill">{{ display(op.op) }}</span></td><td>{{ display(op.instance || op.node_id || (op.api_serial ? 'api-keys' : 'cluster')) }}</td><td>{{ display(op.seq) }}</td></tr></tbody></table><div v-if="!oplog.length" class="cluster-empty">{{ t('sysmon.noOplog') }}</div></div></section>
        <section v-else-if="section === 'credentials'" data-section="credentials" class="cluster-grid two"><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.credentials') }}</span><div class="cluster-actions"><button class="cluster-btn primary" @click="rewrapCredentials">{{ t('sysmon.clusterCredentialRewrap') }}</button><button class="cluster-btn warn" @click="rotateCredentialKey">{{ t('sysmon.rotateLocalClusterKey') }}</button></div></div><div class="cluster-panel-body"><div class="cluster-counts"><div class="cluster-count"><div class="cluster-count-label">Active</div><div class="cluster-count-value">{{ credentials.active || 0 }}</div></div><div class="cluster-count"><div class="cluster-count-label">Conflicts</div><div class="cluster-count-value">{{ (credentials.conflicts || []).length }}</div></div></div><pre class="cluster-json">{{ jsonText(credentials.nodes) }}</pre></div></article><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.localClusterSsh') }}</span></div><div class="cluster-panel-body"><div class="cluster-note">Fingerprint</div><div>{{ display(localClusterSsh.fingerprint) }}</div></div></article></section>
        <section v-else data-section="retention" class="cluster-grid two"><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.clusterHistoryRetention') }}</span><button data-action="save-retention" class="cluster-btn primary" @click="saveRetention">{{ t('common.save') }}</button></div><div class="cluster-panel-body cluster-form"><label>Mode<select v-model="retentionMode" class="cluster-input"><option value="report_only">Report only</option><option value="automatic">Automatic retention</option></select></label><label>History days<input data-field="history-days" v-model.number="retentionDays" type="number" min="1" max="3650" class="cluster-input"></label><div class="cluster-note">{{ t('sysmon.clusterHistoryRetentionNote') }}</div></div></article><article class="cluster-panel"><div class="cluster-panel-head"><span class="cluster-panel-title">{{ t('sysmon.retentionReport') }}</span></div><div class="cluster-panel-body"><pre class="cluster-json">{{ jsonText(retentionReport) }}</pre></div></article></section>
      </section>
    </div>

    <div v-if="removeNode" data-modal="remove" class="cluster-modal" role="dialog" aria-modal="true" @click.stop><div class="cluster-modal-card"><div class="cluster-modal-head"><h2>{{ t('sysmon.removeNode') }}</h2><button data-close="remove" class="cluster-btn" @click="closeRemove"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><p>{{ t('sysmon.removeNodeMsg', { node: `${nodeLabel(removeNode)} (${removeNode.node_id})` }) }}</p><div class="cluster-modal-actions"><button class="cluster-btn" @click="closeRemove">{{ t('common.cancel') }}</button><button class="cluster-btn danger" @click="confirmRemove">{{ t('sysmon.removeNode') }}</button></div></div></div>
    <div v-if="settingsNode" class="cluster-modal" role="dialog" aria-modal="true" @click.stop><div class="cluster-modal-card"><div class="cluster-modal-head"><h2>{{ t('sysmon.editClusterNode') }}</h2><button class="cluster-btn" @click="closeSettings"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><div class="cluster-form"><label>Remote PBGui Dir<input v-model="settingsForm.remote_pbgui_dir" class="cluster-input"></label><label>Sync mode<select v-model="settingsForm.sync_mode" class="cluster-input"><option value="reachable">Reachable</option><option value="outbound_only">Outbound only</option><option value="disabled">Disabled</option></select></label><label>SSH Host<input v-model="settingsForm.ssh_host" class="cluster-input"></label><label>SSH User<input v-model="settingsForm.ssh_user" class="cluster-input"></label><label>SSH Port<input v-model.number="settingsForm.ssh_port" type="number" class="cluster-input"></label></div><div class="cluster-modal-actions"><button class="cluster-btn" @click="closeSettings">{{ t('common.cancel') }}</button><button class="cluster-btn primary" @click="saveSettings">{{ t('common.save') }}</button></div></div></div>
  </div>
  </AppShell>
</template>
