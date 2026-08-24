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
/* Status → Tailwind utility mapping (the former cluster-sync.css carried the
   same good/bad/warn pill tints). Each helper returns the FULL colour set
   including the neutral default so static and dynamic classes never fight. */
function statusClass(value: unknown): string {
  const state = String(value || '').toLowerCase();
  if (['ready', 'ok', 'healthy', 'reachable', 'current', 'synced'].includes(state)) return 'bg-success-deep text-success-soft';
  if (['conflict', 'error', 'failed', 'disabled'].includes(state)) return 'bg-danger-deep text-danger-soft';
  return 'bg-warning-deep text-warning-soft';
}

function noticeKindClass(kind: 'ok' | 'err' | 'warn'): string {
  if (kind === 'ok') return 'border border-success/30 text-success-soft';
  if (kind === 'err') return 'border border-danger/30 text-danger-soft';
  return '';
}

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
      <button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-accent-soft border-accent/42 bg-accent/8" @click="loadAll"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</button>
      <button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-warning-soft border-warning/38 bg-warning/8" @click="section = 'setup'"><PbIcon :icon="PhWrench" /> {{ t('sysmon.setup') }}</button>
    </template>

  <div class="flex min-h-0 flex-1 flex-col bg-page text-primary">
    <div class="flex min-h-0 flex-1">
      <section class="flex min-w-0 flex-1 overflow-auto p-4.5">
        <div
          v-if="notice"
          class="block whitespace-pre-line rounded-[7px] bg-card px-3 py-2.25 mb-3 text-primary"
          :class="noticeKindClass(notice.kind)"
          :role="notice.kind === 'err' ? 'alert' : 'status'"
          :aria-live="notice.kind === 'err' ? 'assertive' : 'polite'"
        >{{ notice.text }}</div>
        <LoadingSkeleton v-if="loading" class="p-4.5 text-center text-secondary" :label="t('common.loading')" />
        <ErrorState
          v-else-if="notice?.kind === 'err' && !Object.keys(status).length"
          class=""
          :title="t('common.error')"
          :message="notice.text"
          :retry-label="t('common.refresh')"
          @retry="loadAll"
        />

        <section v-else-if="section === 'overview'" data-section="overview" class="grid gap-3.5">
          <div class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(310px,1fr))]"><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.localIdentity') }}</span><span class="inline-block rounded-full bg-success-deep px-1.5 py-0.5 text-[0.72rem] text-success-soft">{{ display(identity.role) }}</span></div><div class="p-3.25"><div class="grid grid-cols-[repeat(auto-fit,minmax(115px,1fr))] gap-2"><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Cluster ID</div><div class="mt-0.75 text-[1.2rem] font-bold" data-field="cluster-id">{{ display(identity.cluster_id) }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Node ID</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ display(identity.node_id) }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Generation</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ counts.oplog || 0 }}</div></div></div></div></article><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.summary') }}</span></div><div class="p-3.25"><div class="grid grid-cols-[repeat(auto-fit,minmax(115px,1fr))] gap-2"><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Nodes</div><div class="mt-0.75 text-[1.2rem] font-bold" data-count="nodes">{{ counts.nodes || 0 }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">V7</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ counts.instances || 0 }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Conflicts</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ counts.conflicts || 0 }}</div></div></div><div v-for="warning in warnings" :key="warning" class="text-secondary leading-[1.45]">{{ warning }}</div></div></article></div>
          <article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ 'Checkpoint' }}</span></div><div class="p-3.25"><span class="inline-block rounded-full bg-border-strong px-1.5 py-0.5 text-[0.72rem] text-primary" :class="statusClass(status.checkpoint?.status)">{{ display(status.checkpoint?.status) }}</span><span class="text-secondary leading-[1.45]"> {{ display(status.sync_status?.healthy ? t('common.ok') : t('sysmon.unknownState')) }}</span></div></article>
        </section>

        <section v-else-if="section === 'setup'" data-section="setup" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(310px,1fr))]"><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.bootstrapClusterState') }}</span><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-warning-soft border-warning/38 bg-warning/8" :disabled="!bootstrap.items?.length" @click="applyBootstrap">{{ t('sysmon.applyBootstrap') }}</button></div><div class="p-3.25"><div class="text-secondary leading-[1.45]">{{ t('sysmon.bootstrapClusterStateNote') }}</div><div v-if="bootstrap.items?.length" class="overflow-auto"><table class="w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Type</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Name</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Action</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top"></th></tr></thead><tbody><tr v-for="item in bootstrap.items" :key="`${item.type}:${item.name || item.hostname}`"><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ item.type }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.name || item.hostname) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ item.action }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top"><button v-if="item.type === 'node'" class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="bootstrapNode(String(item.hostname || item.name))">{{ t('sysmon.bootstrap') }}</button></td></tr></tbody></table></div><div v-else class="p-4.5 text-center text-secondary">{{ t('sysmon.noData') }}</div></div></article><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.selfJoin') }}</span><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-warning-soft border-warning/38 bg-warning/8" @click="startSelfJoin">{{ t('sysmon.joinExistingCluster') }}</button></div><div class="p-3.25 grid gap-2.25"><label class="grid gap-1 text-secondary text-[0.8rem]">Hostname<input v-model="selfJoinForm.hostname" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH Host<input v-model="selfJoinForm.ssh_host" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH User<input v-model="selfJoinForm.ssh_user" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH Port<input v-model.number="selfJoinForm.ssh_port" type="number" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]"><input v-model="selfJoinForm.reset" type="checkbox"> {{ t('sysmon.recovery') }}</label></div></article></section>

        <section v-else-if="section === 'nodes'" data-section="nodes" class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.clusterNodes') }}</span><span class="text-secondary leading-[1.45]">{{ nodes.length }} nodes</span></div><div class="p-3.25 overflow-auto"><table class="w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Node</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Role</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Sync</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">SSH</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Actions</th></tr></thead><tbody><tr v-for="node in nodes" :key="node.node_id"><td class="px-1.75 py-2 border-b border-border-default text-left align-top"><strong>{{ nodeLabel(node) }}</strong><div class="text-secondary leading-[1.45]">{{ node.node_id }}</div></td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(node.role) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top"><span class="inline-block rounded-full bg-border-strong px-1.5 py-0.5 text-[0.72rem] text-primary" :class="statusClass(node.sync_enabled === false ? 'disabled' : 'synced')">{{ node.sync_enabled === false ? t('sysmon.disabled') : t('common.enabled') }}</span></td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(node.ssh_host) }}:{{ node.ssh_port || 22 }}</td><td class="flex flex-wrap justify-end gap-1.75 max-[760px]:justify-start"><button data-action="toggle-sync" :data-node-id="node.node_id" class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" :disabled="node.node_id === localNodeId" @click="toggleSync(node)">{{ node.sync_enabled === false ? t('sysmon.enable') : t('sysmon.disable') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="openSettings(node)">{{ t('sysmon.editClusterNode') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="joinRemote(node)">{{ t('sysmon.joinRemoteClusterNode') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="repairNode(node)">{{ t('sysmon.repairAllSsh') }}</button><button data-action="remove-node" :data-node-id="node.node_id" class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-danger-soft border-danger/38 bg-danger/8" :disabled="node.node_id === localNodeId" @click="openRemove(node)">{{ t('sysmon.removeNode') }}</button></td></tr></tbody></table><div v-if="!nodes.length" class="p-4.5 text-center text-secondary">{{ t('sysmon.noClusterNodes') }}</div></div></section>

        <section v-else-if="section === 'instances'" data-section="instances" class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.v7State') }}</span></div><div class="p-3.25 overflow-auto"><table class="w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Instance</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Current</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Desired</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Status</th></tr></thead><tbody><tr v-for="item in desired.instances || []" :key="item.instance || item.name"><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.instance || item.name) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.current_version) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.desired_version) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top"><span class="inline-block rounded-full bg-border-strong px-1.5 py-0.5 text-[0.72rem] text-primary" :class="statusClass(item.conflicted ? 'conflict' : 'synced')">{{ item.conflicted ? t('sysmon.conflict') : t('sysmon.synced') }}</span></td></tr></tbody></table></div></section>
        <section v-else-if="section === 'tombstones'" data-section="tombstones" class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.tombstones') }}</span></div><div class="p-3.25 overflow-auto"><table class="w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Instance</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Created</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Reason</th></tr></thead><tbody><tr v-for="item in desired.tombstones || []" :key="item.instance"><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.instance || item.name) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ timeText(item.created_at) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(item.reason) }}</td></tr></tbody></table></div></section>
        <section v-else-if="section === 'operations'" data-section="operations" class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.oplog') }}</span></div><div class="p-3.25 overflow-auto"><table class="w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Created</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Operation</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Target</th><th class="sticky top-0 z-[1] bg-card text-primary px-1.75 py-2 border-b border-border-default text-left align-top">Seq</th></tr></thead><tbody><tr v-for="op in oplog" :key="op.op_id || `${op.seq}:${op.created_at}`"><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ timeText(op.created_at) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top"><span class="inline-block rounded-full bg-border-strong px-1.5 py-0.5 text-[0.72rem] text-primary">{{ display(op.op) }}</span></td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(op.instance || op.node_id || (op.api_serial ? 'api-keys' : 'cluster')) }}</td><td class="px-1.75 py-2 border-b border-border-default text-left align-top">{{ display(op.seq) }}</td></tr></tbody></table><div v-if="!oplog.length" class="p-4.5 text-center text-secondary">{{ t('sysmon.noOplog') }}</div></div></section>
        <section v-else-if="section === 'credentials'" data-section="credentials" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(310px,1fr))]"><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.credentials') }}</span><div class="flex flex-wrap justify-end gap-1.75 max-[760px]:justify-start"><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-accent-soft border-accent/42 bg-accent/8" @click="rewrapCredentials">{{ t('sysmon.clusterCredentialRewrap') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-warning-soft border-warning/38 bg-warning/8" @click="rotateCredentialKey">{{ t('sysmon.rotateLocalClusterKey') }}</button></div></div><div class="p-3.25"><div class="grid grid-cols-[repeat(auto-fit,minmax(115px,1fr))] gap-2"><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Active</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ credentials.active || 0 }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-secondary text-[0.76rem]">Conflicts</div><div class="mt-0.75 text-[1.2rem] font-bold">{{ (credentials.conflicts || []).length }}</div></div></div><pre class="m-0 overflow-auto whitespace-pre-wrap rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(credentials.nodes) }}</pre></div></article><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.localClusterSsh') }}</span></div><div class="p-3.25"><div class="text-secondary leading-[1.45]">Fingerprint</div><div>{{ display(localClusterSsh.fingerprint) }}</div></div></article></section>
        <section v-else data-section="retention" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(310px,1fr))]"><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.clusterHistoryRetention') }}</span><button data-action="save-retention" class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-accent-soft border-accent/42 bg-accent/8" @click="saveRetention">{{ t('common.save') }}</button></div><div class="p-3.25 grid gap-2.25"><label class="grid gap-1 text-secondary text-[0.8rem]">Mode<select v-model="retentionMode" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"><option value="report_only">Report only</option><option value="automatic">Automatic retention</option></select></label><label class="grid gap-1 text-secondary text-[0.8rem]">History days<input data-field="history-days" v-model.number="retentionDays" type="number" min="1" max="3650" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><div class="text-secondary leading-[1.45]">{{ t('sysmon.clusterHistoryRetentionNote') }}</div></div></article><article class="overflow-hidden rounded-[9px] border border-border-default bg-card"><div class="flex items-center justify-between gap-2.5 border-b border-border-default px-3.25 py-2.75"><span class="font-bold">{{ t('sysmon.retentionReport') }}</span></div><div class="p-3.25"><pre class="m-0 overflow-auto whitespace-pre-wrap rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(retentionReport) }}</pre></div></article></section>
      </section>
    </div>

    <div v-if="removeNode" data-modal="remove" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true" @click.stop><div class="max-h-[calc(100vh-40px)] max-h-[calc(100dvh-40px)] w-[min(640px,calc(100vw-40px))] overflow-auto rounded-lg bg-card p-4.5"><div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5"><h2 class="m-0 text-[1.05rem]">{{ t('sysmon.removeNode') }}</h2><button data-close="remove" class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="closeRemove"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><p>{{ t('sysmon.removeNodeMsg', { node: `${nodeLabel(removeNode)} (${removeNode.node_id})` }) }}</p><div class="mt-3.75 flex justify-end gap-1.75"><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="closeRemove">{{ t('common.cancel') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-danger-soft border-danger/38 bg-danger/8" @click="confirmRemove">{{ t('sysmon.removeNode') }}</button></div></div></div>
    <div v-if="settingsNode" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true" @click.stop><div class="max-h-[calc(100vh-40px)] max-h-[calc(100dvh-40px)] w-[min(640px,calc(100vw-40px))] overflow-auto rounded-lg bg-card p-4.5"><div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5"><h2 class="m-0 text-[1.05rem]">{{ t('sysmon.editClusterNode') }}</h2><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="closeSettings"><PbIcon :icon="PhX" /> {{ t('common.close') }}</button></div><div class="grid gap-2.25"><label class="grid gap-1 text-secondary text-[0.8rem]">Remote PBGui Dir<input v-model="settingsForm.remote_pbgui_dir" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">Sync mode<select v-model="settingsForm.sync_mode" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"><option value="reachable">Reachable</option><option value="outbound_only">Outbound only</option><option value="disabled">Disabled</option></select></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH Host<input v-model="settingsForm.ssh_host" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH User<input v-model="settingsForm.ssh_user" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label><label class="grid gap-1 text-secondary text-[0.8rem]">SSH Port<input v-model.number="settingsForm.ssh_port" type="number" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-page px-2 py-1.5 text-primary"></label></div><div class="mt-3.75 flex justify-end gap-1.75"><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" @click="closeSettings">{{ t('common.cancel') }}</button><button class="inline-flex items-center gap-1.25 min-h-8 rounded-md border border-border-default bg-card px-2.5 py-1.5 text-primary cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-accent-soft border-accent/42 bg-accent/8" @click="saveSettings">{{ t('common.save') }}</button></div></div></div>
  </div>
  </AppShell>
</template>

<style scoped>
/* Page-level AppShell overrides for the fixed-height workbench layout —
   ported from styles/cluster-sync.css at the Tailwind migration. These
   target AppShell internals, so they stay as CSS instead of utilities. */
.operations-shell--cluster :deep(.app-shell__workspace) {
  display: flex;
  height: 100dvh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.operations-shell--cluster :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  flex: 1;
  padding: 0;
}

.operations-shell--cluster :deep(.app-shell__primary) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
</style>
