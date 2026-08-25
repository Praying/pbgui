<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { PhArrowClockwise, PhWrench, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import { apiFetch, ApiError } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import type { PageSection } from '@/shared/navigation';
import { clusterApiBase } from './config';

const { t } = useI18n();
const apiBase = clusterApiBase();
type Section = 'overview' | 'setup' | 'nodes' | 'instances' | 'tombstones' | 'operations' | 'credentials' | 'retention';
const section = ref<Section>('overview');

/* AI drawer page context — Vue port of the legacy cluster registration. */
useAiPageContext({
  id: 'cluster',
  getContext: () => ({ section: section.value }),
});

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

const SYNC_MODE_LABELS: Record<string, string> = { reachable: 'Reachable', outbound_only: 'Outbound only', disabled: 'Disabled' };
const syncModeLabel = computed(() => SYNC_MODE_LABELS[settingsForm.value.sync_mode] ?? settingsForm.value.sync_mode);

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
  if (kind === 'ok') return 'border border-success/30 bg-success-deep/12 text-success-soft';
  if (kind === 'err') return 'border border-danger/30 bg-danger-deep/12 text-danger-soft';
  return 'border border-warning/30 bg-warning-deep/12 text-warning-soft';
}

/* ── Class kits ─────────────────────────────────────────────────────────
   Structural classes only — form controls moved to the shared ui/ layer
   (Button/Input/Label/Select/Checkbox), which owns their chrome. */
const cardClass = 'overflow-hidden rounded-[9px] border border-border-default bg-card';
const cardHeadClass = 'flex items-center justify-between gap-2.5 border-b border-border-default px-4 py-3';
const cardTitleClass = 'text-[0.9rem] font-semibold tracking-[0.01em]';
const pillClass = 'inline-block rounded-full px-2 py-0.5 text-[0.72rem] font-medium';
/* Stat wells sink to the page tone so cards read as one raised surface. */
const statClass = 'rounded-md bg-page p-2.75';
const statValueClass = 'mt-1 text-[1.25rem] font-semibold leading-tight tabular-nums';
const statMonoClass = 'mt-1 break-all font-mono text-[0.95rem] font-semibold leading-tight';
const preClass = 'm-0 overflow-auto whitespace-pre-wrap rounded-md bg-page p-2.5 font-mono text-[0.75rem] leading-[1.5] text-primary';
const thClass = 'sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2.25 text-left align-middle text-[0.72rem] font-semibold tracking-[0.04em] text-secondary';
const tdClass = 'border-b border-border-default px-2.5 py-2.25 text-left align-top';
const tdHoverClass = `${tdClass} transition-colors group-hover:bg-accent/8`;

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
      <Button variant="info" type="button" @click="loadAll"><PbIcon :icon="PhArrowClockwise" /> {{ t('common.refresh') }}</Button>
      <Button variant="warning" type="button" @click="section = 'setup'"><PbIcon :icon="PhWrench" /> {{ t('sysmon.setup') }}</Button>
    </template>

    <div class="flex min-h-0 flex-1 flex-col bg-page text-primary">
      <div class="flex min-h-0 flex-1">
        <section class="flex min-w-0 flex-1 flex-col overflow-auto p-5">
          <div
            v-if="notice"
            class="mb-4 block whitespace-pre-line rounded-md px-3.5 py-2.5 text-[0.85rem] font-medium"
            :class="noticeKindClass(notice.kind)"
            :role="notice.kind === 'err' ? 'alert' : 'status'"
            :aria-live="notice.kind === 'err' ? 'assertive' : 'polite'"
          >{{ notice.text }}</div>

          <LoadingSkeleton v-if="loading" class="p-4.5 text-center text-secondary" :label="t('common.loading')" />
          <ErrorState
            v-else-if="notice?.kind === 'err' && !Object.keys(status).length"
            :title="t('common.error')"
            :message="notice.text"
            :retry-label="t('common.refresh')"
            @retry="loadAll"
          />

          <!-- ── Overview ─────────────────────────────────────────── -->
          <section v-else-if="section === 'overview'" data-section="overview" class="grid gap-4">
            <div class="grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-4">
              <article :class="cardClass">
                <header :class="cardHeadClass">
                  <span :class="cardTitleClass">{{ t('sysmon.localIdentity') }}</span>
                  <span :class="pillClass" class="bg-success-deep text-success-soft">{{ display(identity.role) }}</span>
                </header>
                <div class="p-4">
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] gap-2.5">
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">Cluster ID</div>
                      <div :class="statMonoClass" data-field="cluster-id">{{ display(identity.cluster_id) }}</div>
                    </div>
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">Node ID</div>
                      <div :class="statMonoClass">{{ display(identity.node_id) }}</div>
                    </div>
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">Generation</div>
                      <div :class="statValueClass">{{ counts.oplog || 0 }}</div>
                    </div>
                  </div>
                </div>
              </article>
              <article :class="cardClass">
                <header :class="cardHeadClass">
                  <span :class="cardTitleClass">{{ t('sysmon.summary') }}</span>
                </header>
                <div class="p-4">
                  <div class="grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] gap-2.5">
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">Nodes</div>
                      <div :class="statValueClass" data-count="nodes">{{ counts.nodes || 0 }}</div>
                    </div>
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">V7</div>
                      <div :class="statValueClass">{{ counts.instances || 0 }}</div>
                    </div>
                    <div :class="statClass">
                      <div class="text-[0.72rem] text-secondary">Conflicts</div>
                      <div :class="statValueClass">{{ counts.conflicts || 0 }}</div>
                    </div>
                  </div>
                  <div v-if="warnings.length" class="mt-3 grid gap-1">
                    <div v-for="warning in warnings" :key="warning" class="text-[0.78rem] leading-[1.5] text-warning-soft">{{ warning }}</div>
                  </div>
                </div>
              </article>
            </div>

            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ 'Checkpoint' }}</span>
              </header>
              <div class="flex flex-wrap items-center gap-2.5 p-4">
                <span :class="[pillClass, statusClass(status.checkpoint?.status)]">{{ display(status.checkpoint?.status) }}</span>
                <span class="text-[0.82rem] text-secondary">{{ display(status.sync_status?.healthy ? t('common.ok') : t('sysmon.unknownState')) }}</span>
              </div>
            </article>
          </section>

          <!-- ── Setup ────────────────────────────────────────────── -->
          <section v-else-if="section === 'setup'" data-section="setup" class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.bootstrapClusterState') }}</span>
                <Button variant="warning" type="button" :disabled="!bootstrap.items?.length" @click="applyBootstrap">{{ t('sysmon.applyBootstrap') }}</Button>
              </header>
              <div class="p-4">
                <p class="m-0 text-[0.82rem] leading-[1.55] text-secondary">{{ t('sysmon.bootstrapClusterStateNote') }}</p>
                <div v-if="bootstrap.items?.length" class="mt-3 overflow-auto">
                  <table class="w-full border-collapse text-[0.78rem]">
                    <thead>
                      <tr>
                        <th :class="thClass">Type</th>
                        <th :class="thClass">Name</th>
                        <th :class="thClass">Action</th>
                        <th :class="thClass"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="item in bootstrap.items" :key="`${item.type}:${item.name || item.hostname}`" class="group">
                        <td :class="tdHoverClass">{{ item.type }}</td>
                        <td :class="tdHoverClass">{{ display(item.name || item.hostname) }}</td>
                        <td :class="tdHoverClass">{{ item.action }}</td>
                        <td :class="tdHoverClass">
                          <Button v-if="item.type === 'node'" variant="outline" size="sm" type="button" @click="bootstrapNode(String(item.hostname || item.name))">{{ t('sysmon.bootstrap') }}</Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <EmptyState v-else :title="t('sysmon.noData')" />
              </div>
            </article>
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.selfJoin') }}</span>
                <Button variant="warning" type="button" @click="startSelfJoin">{{ t('sysmon.joinExistingCluster') }}</Button>
              </header>
              <div class="grid gap-3 p-4">
                <Label class="grid gap-1">Hostname<Input v-model="selfJoinForm.hostname" /></Label>
                <Label class="grid gap-1">SSH Host<Input v-model="selfJoinForm.ssh_host" /></Label>
                <Label class="grid gap-1">SSH User<Input v-model="selfJoinForm.ssh_user" /></Label>
                <Label class="grid gap-1">SSH Port<Input v-model.number="selfJoinForm.ssh_port" type="number" /></Label>
                <label class="flex items-center gap-1.75 text-[0.8rem] text-secondary"><Checkbox v-model="selfJoinForm.reset" /> {{ t('sysmon.recovery') }}</label>
              </div>
            </article>
          </section>

          <!-- ── Nodes ────────────────────────────────────────────── -->
          <section v-else-if="section === 'nodes'" data-section="nodes" :class="cardClass">
            <header :class="cardHeadClass">
              <span :class="cardTitleClass">{{ t('sysmon.clusterNodes') }}</span>
              <span class="text-[0.78rem] tabular-nums text-secondary">{{ nodes.length }} nodes</span>
            </header>
            <div class="overflow-auto p-4">
              <table class="w-full border-collapse text-[0.78rem]">
                <thead>
                  <tr>
                    <th :class="thClass">Node</th>
                    <th :class="thClass">Role</th>
                    <th :class="thClass">Sync</th>
                    <th :class="thClass">SSH</th>
                    <th :class="thClass">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="node in nodes" :key="node.node_id" class="group">
                    <td :class="tdHoverClass">
                      <strong>{{ nodeLabel(node) }}</strong>
                      <div class="font-mono text-[0.72rem] text-secondary">{{ node.node_id }}</div>
                    </td>
                    <td :class="tdHoverClass">{{ display(node.role) }}</td>
                    <td :class="tdHoverClass">
                      <span :class="[pillClass, statusClass(node.sync_enabled === false ? 'disabled' : 'synced')]">{{ node.sync_enabled === false ? t('sysmon.disabled') : t('common.enabled') }}</span>
                    </td>
                    <td class="font-mono text-[0.75rem]" :class="tdHoverClass">{{ display(node.ssh_host) }}:{{ node.ssh_port || 22 }}</td>
                    <td class="flex flex-wrap justify-end gap-1.75 border-b border-border-default px-2.5 py-2.25 max-[760px]:justify-start">
                      <Button data-action="toggle-sync" :data-node-id="node.node_id" variant="outline" size="sm" type="button" :disabled="node.node_id === localNodeId" @click="toggleSync(node)">{{ node.sync_enabled === false ? t('sysmon.enable') : t('sysmon.disable') }}</Button>
                      <Button variant="outline" size="sm" type="button" @click="openSettings(node)">{{ t('sysmon.editClusterNode') }}</Button>
                      <Button variant="outline" size="sm" type="button" @click="joinRemote(node)">{{ t('sysmon.joinRemoteClusterNode') }}</Button>
                      <Button variant="outline" size="sm" type="button" @click="repairNode(node)">{{ t('sysmon.repairAllSsh') }}</Button>
                      <Button data-action="remove-node" :data-node-id="node.node_id" variant="danger" size="sm" type="button" :disabled="node.node_id === localNodeId" @click="openRemove(node)">{{ t('sysmon.removeNode') }}</Button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <EmptyState v-if="!nodes.length" :title="t('sysmon.noClusterNodes')" />
            </div>
          </section>

          <!-- ── V7 instances ─────────────────────────────────────── -->
          <section v-else-if="section === 'instances'" data-section="instances" :class="cardClass">
            <header :class="cardHeadClass">
              <span :class="cardTitleClass">{{ t('sysmon.v7State') }}</span>
            </header>
            <div class="overflow-auto p-4">
              <table class="w-full border-collapse text-[0.78rem]">
                <thead>
                  <tr>
                    <th :class="thClass">Instance</th>
                    <th :class="thClass">Current</th>
                    <th :class="thClass">Desired</th>
                    <th :class="thClass">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in desired.instances || []" :key="item.instance || item.name" class="group">
                    <td :class="tdHoverClass">{{ display(item.instance || item.name) }}</td>
                    <td class="font-mono" :class="tdHoverClass">{{ display(item.current_version) }}</td>
                    <td class="font-mono" :class="tdHoverClass">{{ display(item.desired_version) }}</td>
                    <td :class="tdHoverClass">
                      <span :class="[pillClass, statusClass(item.conflicted ? 'conflict' : 'synced')]">{{ item.conflicted ? t('sysmon.conflict') : t('sysmon.synced') }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- ── Tombstones ───────────────────────────────────────── -->
          <section v-else-if="section === 'tombstones'" data-section="tombstones" :class="cardClass">
            <header :class="cardHeadClass">
              <span :class="cardTitleClass">{{ t('sysmon.tombstones') }}</span>
            </header>
            <div class="overflow-auto p-4">
              <table class="w-full border-collapse text-[0.78rem]">
                <thead>
                  <tr>
                    <th :class="thClass">Instance</th>
                    <th :class="thClass">Created</th>
                    <th :class="thClass">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in desired.tombstones || []" :key="item.instance" class="group">
                    <td :class="tdHoverClass">{{ display(item.instance || item.name) }}</td>
                    <td class="font-mono text-[0.75rem] text-secondary" :class="tdHoverClass">{{ timeText(item.created_at) }}</td>
                    <td class="text-secondary" :class="tdHoverClass">{{ display(item.reason) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- ── Oplog ────────────────────────────────────────────── -->
          <section v-else-if="section === 'operations'" data-section="operations" :class="cardClass">
            <header :class="cardHeadClass">
              <span :class="cardTitleClass">{{ t('sysmon.oplog') }}</span>
            </header>
            <div class="overflow-auto p-4">
              <table class="w-full border-collapse text-[0.78rem]">
                <thead>
                  <tr>
                    <th :class="thClass">Created</th>
                    <th :class="thClass">Operation</th>
                    <th :class="thClass">Target</th>
                    <th :class="thClass">Seq</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="op in oplog" :key="op.op_id || `${op.seq}:${op.created_at}`" class="group">
                    <td class="font-mono text-[0.75rem] text-secondary" :class="tdHoverClass">{{ timeText(op.created_at) }}</td>
                    <td :class="tdHoverClass">
                      <span :class="pillClass" class="bg-elevated">{{ display(op.op) }}</span>
                    </td>
                    <td :class="tdHoverClass">{{ display(op.instance || op.node_id || (op.api_serial ? 'api-keys' : 'cluster')) }}</td>
                    <td class="tabular-nums" :class="tdHoverClass">{{ display(op.seq) }}</td>
                  </tr>
                </tbody>
              </table>
              <EmptyState v-if="!oplog.length" :title="t('sysmon.noOplog')" />
            </div>
          </section>

          <!-- ── Credentials ──────────────────────────────────────── -->
          <section v-else-if="section === 'credentials'" data-section="credentials" class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.credentials') }}</span>
                <div class="flex flex-wrap justify-end gap-1.75 max-[760px]:justify-start">
                  <Button variant="info" type="button" @click="rewrapCredentials">{{ t('sysmon.clusterCredentialRewrap') }}</Button>
                  <Button variant="warning" type="button" @click="rotateCredentialKey">{{ t('sysmon.rotateLocalClusterKey') }}</Button>
                </div>
              </header>
              <div class="p-4">
                <div class="grid grid-cols-[repeat(auto-fit,minmax(125px,1fr))] gap-2.5">
                  <div :class="statClass">
                    <div class="text-[0.72rem] text-secondary">Active</div>
                    <div :class="statValueClass">{{ credentials.active || 0 }}</div>
                  </div>
                  <div :class="statClass">
                    <div class="text-[0.72rem] text-secondary">Conflicts</div>
                    <div :class="statValueClass">{{ (credentials.conflicts || []).length }}</div>
                  </div>
                </div>
                <pre :class="preClass" class="mt-3">{{ jsonText(credentials.nodes) }}</pre>
              </div>
            </article>
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.localClusterSsh') }}</span>
              </header>
              <div class="p-4">
                <div class="text-[0.72rem] text-secondary">Fingerprint</div>
                <div class="mt-1 break-all font-mono text-[0.82rem]">{{ display(localClusterSsh.fingerprint) }}</div>
              </div>
            </article>
          </section>

          <!-- ── Retention ────────────────────────────────────────── -->
          <section v-else data-section="retention" class="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] gap-4">
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.clusterHistoryRetention') }}</span>
                <Button data-action="save-retention" variant="info" type="button" @click="saveRetention">{{ t('common.save') }}</Button>
              </header>
              <div class="grid gap-3 p-4">
                <Label class="grid gap-1">Mode
                  <SelectRoot v-model="retentionMode">
                    <SelectTrigger>
                      <span>{{ retentionMode === 'automatic' ? 'Automatic retention' : 'Report only' }}</span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="report_only">Report only</SelectItem>
                      <SelectItem value="automatic">Automatic retention</SelectItem>
                    </SelectContent>
                  </SelectRoot>
                </Label>
                <Label class="grid gap-1">History days<Input data-field="history-days" v-model.number="retentionDays" type="number" min="1" max="3650" /></Label>
                <p class="m-0 text-[0.82rem] leading-[1.55] text-secondary">{{ t('sysmon.clusterHistoryRetentionNote') }}</p>
              </div>
            </article>
            <article :class="cardClass">
              <header :class="cardHeadClass">
                <span :class="cardTitleClass">{{ t('sysmon.retentionReport') }}</span>
              </header>
              <div class="p-4"><pre :class="preClass">{{ jsonText(retentionReport) }}</pre></div>
            </article>
          </section>
        </section>
      </div>

      <!-- ── Remove-node modal ───────────────────────────────────── -->
      <div v-if="removeNode" data-modal="remove" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true" @click.stop>
        <div class="max-h-[calc(100dvh-40px)] w-[min(640px,calc(100vw-40px))] overflow-auto rounded-lg bg-card p-4.5 shadow-modal">
          <div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5">
            <h2 class="m-0 text-[1.05rem] font-semibold">{{ t('sysmon.removeNode') }}</h2>
            <Button data-close="remove" variant="secondary" type="button" @click="closeRemove"><PbIcon :icon="PhX" /> {{ t('common.close') }}</Button>
          </div>
          <p class="m-0 mt-3.5 text-[0.85rem] leading-[1.55]">{{ t('sysmon.removeNodeMsg', { node: `${nodeLabel(removeNode)} (${removeNode.node_id})` }) }}</p>
          <div class="mt-4 flex justify-end gap-1.75">
            <Button variant="secondary" type="button" @click="closeRemove">{{ t('common.cancel') }}</Button>
            <Button variant="danger" type="button" @click="confirmRemove">{{ t('sysmon.removeNode') }}</Button>
          </div>
        </div>
      </div>

      <!-- ── Node settings modal ─────────────────────────────────── -->
      <div v-if="settingsNode" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" role="dialog" aria-modal="true" @click.stop>
        <div class="max-h-[calc(100dvh-40px)] w-[min(640px,calc(100vw-40px))] overflow-auto rounded-lg bg-card p-4.5 shadow-modal">
          <div class="flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5">
            <h2 class="m-0 text-[1.05rem] font-semibold">{{ t('sysmon.editClusterNode') }}</h2>
            <Button variant="secondary" type="button" @click="closeSettings"><PbIcon :icon="PhX" /> {{ t('common.close') }}</Button>
          </div>
          <div class="grid gap-3 pt-3.5">
            <Label class="grid gap-1">Remote PBGui Dir<Input v-model="settingsForm.remote_pbgui_dir" /></Label>
            <Label class="grid gap-1">Sync mode
              <SelectRoot v-model="settingsForm.sync_mode">
                <SelectTrigger>
                  <span>{{ syncModeLabel }}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reachable">Reachable</SelectItem>
                  <SelectItem value="outbound_only">Outbound only</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </SelectRoot>
            </Label>
            <Label class="grid gap-1">SSH Host<Input v-model="settingsForm.ssh_host" /></Label>
            <Label class="grid gap-1">SSH User<Input v-model="settingsForm.ssh_user" /></Label>
            <Label class="grid gap-1">SSH Port<Input v-model.number="settingsForm.ssh_port" type="number" /></Label>
          </div>
          <div class="mt-4 flex justify-end gap-1.75">
            <Button variant="secondary" type="button" @click="closeSettings">{{ t('common.cancel') }}</Button>
            <Button variant="info" type="button" @click="saveSettings">{{ t('common.save') }}</Button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
/* Page-level AppShell overrides for the fixed-height workbench layout —
   ported from the pre-Tailwind cluster page stylesheet. These
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
