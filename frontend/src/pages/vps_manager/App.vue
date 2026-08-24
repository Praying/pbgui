<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { PhArrowClockwise, PhFile, PhFolder, PhX } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import { apiFetch } from '@/shared/api';
import AppShell from '@/shared/components/AppShell.vue';
import type { PageSection } from '@/shared/navigation';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { managerApiBase, managerWsUrl } from './config';

const { t } = useI18n();
const apiBase = managerApiBase();

type ManagerView =
  | 'overview' | 'master' | 'vps' | 'add-vps'
  | 'master-task-log' | 'master-host-logs' | 'master-pbgui-branch' | 'master-pb7-branch' | 'master-pb8-branch' | 'master-ufw'
  | 'vps-setup' | 'vps-task-log' | 'vps-host-logs' | 'vps-pbgui-branch' | 'vps-pb7-branch' | 'vps-pb8-branch' | 'vps-ufw'
  | 'deploys-vps-logging' | 'settings-vps-logging';
type Repo = 'pbgui' | 'pb7' | 'pb8';
type ModalKind = 'confirm' | 'history' | 'host-key' | 'package-updates' | 'ufw-preview' | 'existing-import' | 'cluster-import' | 'cluster-onboard' | 'deploy-password' | 'password' | 'files' | 'bot-log' | 'systemd' | null;
type JsonRecord = Record<string, any>;
type SharedLogViewer = { open(): void; close(): void; setHost(host: string): void; setFile(file: string): void };

const view = ref<ManagerView>('overview');

/* AI drawer page context — Vue port of the legacy vps-manager registration
   (overview selections first, else the form's current hostname). */
useAiPageContext({
  id: 'vps-manager',
  getContext: () => {
    let hosts = (selectedHosts.value || []).slice(0, 8);
    if (!hosts.length && hostname.value) hosts = [hostname.value];
    return {
      section: view.value,
      entities: hosts.map((host: string) => ({ kind: 'vps_host', name: host })),
    };
  },
});
const hostname = ref('');
const state = ref<JsonRecord>({ config: {}, overview: { rows: [] }, deploys: { history: [], progress_rows: [] } });
const detail = ref<JsonRecord | null>(null);
const connection = ref<'connecting' | 'connected' | 'lost'>('connecting');
const notice = ref<{ text: string; kind: 'ok' | 'err' } | null>(null);
const modal = ref<ModalKind>(null);
const modalData = ref<JsonRecord>({});
const ws = ref<WebSocket | null>(null);
const sharedLogViewer = ref<SharedLogViewer | null>(null);
const contextGeneration = ref(0);
const pendingWsMessages = ref<JsonRecord[]>([]);
const requestCounter = ref(0);
const activeRequestIds = ref<Record<string, number>>({});
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let clusterPollTimer: ReturnType<typeof setTimeout> | null = null;
let onboardPollTimer: ReturnType<typeof setTimeout> | null = null;

const addForm = ref<JsonRecord>({
  hostname: '', ip: '', user: '', user_pw: '', install_dir: 'software/pbgui',
  init_methode: 'root', initial_root_pw: '', root_pw: '', user_sudo: '', user_sudo_pw: '',
  private_key_user: '', private_key_file: '', swap: '0', firewall: true,
  firewall_ssh_port: 22, firewall_ssh_ips: '', remove_user: false, runtime_profile: 'pb7',
});
const addReady = ref<JsonRecord>({});
const publicIp = ref('');
const existingImport = ref<JsonRecord>({ hostname: '', ip: '', user: '', user_pw: '', local_sudo_pw: '', install_dir: '', accept_unknown_host: false, accepted_host_key_fingerprint: '' });
const clusterImport = ref<JsonRecord>({ preview: null, local_sudo_pw: '', passwords: {}, selected: {} });
const clusterOnboard = ref<JsonRecord>({ job: null, hostname: '' });
const vpsForm = ref<JsonRecord>({});
const vpsDirtyFields = ref<Record<string, boolean>>({});
const masterSudoPw = ref('');
const pendingMasterAction = ref<{ command: string; extraVars: JsonRecord | null } | null>(null);
const secretFields = ref<Record<string, string>>({});
const logFilename = ref('');
const logSizeKb = ref(50);
const logReverse = ref(true);
const logDebug = ref(false);
const logContent = ref('');
const logLoading = ref(false);
const metric = ref<JsonRecord>({ loading: false, data: null, bot: '', name: '', error: '' });
const botLog = ref<JsonRecord>({ loading: false, lines: [], bot: '', kind: '', error: '' });
const fileBrowseTarget = ref<'vps-install-dir' | 'add-private-key' | ''>('');
const ufw = ref<JsonRecord>({ hostname: '', loaded: false, loading: false, applying: false, enabled: false, revision: '', rules: [], addRules: [], deleteNumbers: [], form: { port: '', from: '', comment: '', action: 'allow' }, error: '', sudoPw: '' });
const branchUi = ref<Record<string, JsonRecord>>({});
const deploy = ref<JsonRecord>({ action: '', mode: '', debug: false, reboot_requested: false, selectedHosts: [], password: '', currentHost: '', entryId: '', remainingHosts: [], acceptUnknownHost: false, acceptedHostKeyFingerprint: '' });
const loggingConfig = ref<JsonRecord>({ services: [], selected_hosts: [] });
const deploySettings = ref<JsonRecord>({ action: '', mode: '', debug: false, reboot_requested: false, selected_hosts: [], actions: [], modes: [] });
const overviewSort = ref({ field: 'hostname', direction: 'asc' });
const overviewDrag = ref({ active: false, anchor: '', mode: true, pointerHandled: false });
const visibleColumns = ref<Record<string, boolean>>({ status: true, ip: true, cpu: true, memory: true, disk: true, pbgui: true, pb7: true, pb8: true, updates: true, actions: true });

const rows = computed(() => Array.isArray(state.value.overview?.rows) ? state.value.overview.rows : []);
const vpsRows = computed(() => rows.value.filter((row: JsonRecord) => row.nav === 'vps'));
const selectedRow = computed(() => rows.value.find((row: JsonRecord) => String(row.hostname) === hostname.value) || null);
const selectedHosts = computed(() => deploy.value.selectedHosts as string[]);
const config = computed(() => state.value.config || {});
const deployHistory = computed(() => Array.isArray(state.value.deploys?.history) ? state.value.deploys.history : []);
const currentRepo = computed<Repo>(() => view.value.includes('pb8') ? 'pb8' : view.value.includes('pb7') ? 'pb7' : 'pbgui');
const isMasterContext = computed(() => view.value.startsWith('master-') || view.value === 'master');
const sections = computed<PageSection[]>(() => {
  const items: PageSection[] = [
    { key: 'overview', label: t('vpsmgr.overview') },
    { key: 'master', label: t('vpsmgr.masterLabel') },
    { key: 'vps', label: t('vpsmgr.vps') },
    { key: 'add-vps', label: t('vpsmgr.addVps') },
    { key: 'deploys-vps-logging', label: t('vpsmgr.deploymentsLabel') },
    { key: 'settings-vps-logging', label: t('vpsmgr.settings') },
  ];
  if (hostname.value) {
    if (!isMasterContext.value) items.push({ key: 'vps-setup', label: t('vpsmgr.setup') });
    items.push({ key: 'task-log', label: t('vpsmgr.taskLogLabel') });
    items.push({ key: 'host-logs', label: t('vpsmgr.hostLogs') });
    items.push({ key: 'pbgui-branch', label: t('vpsmgr.pbguiBranch') });
    items.push({ key: 'pb7-branch', label: t('vpsmgr.pb7Branch') });
    items.push({ key: 'pb8-branch', label: t('vpsmgr.pb8Branch') });
    items.push({ key: 'ufw', label: t('vpsmgr.ufwLabel') });
  }
  return items;
});
const activeSection = computed<string>(() => {
  const v = view.value;
  if (v.endsWith('task-log')) return 'task-log';
  if (v.endsWith('host-logs')) return 'host-logs';
  if (v.endsWith('pbgui-branch')) return 'pbgui-branch';
  if (v.endsWith('pb7-branch')) return 'pb7-branch';
  if (v.endsWith('pb8-branch')) return 'pb8-branch';
  if (v.endsWith('ufw')) return 'ufw';
  return v;
});
function onSectionSelect(key: string): void {
  if (key === 'overview' || key === 'add-vps' || key === 'deploys-vps-logging' || key === 'settings-vps-logging') { setContext(key as ManagerView); return; }
  if (key === 'master') { setContext('master', String(config.value.master_name || '')); return; }
  if (key === 'vps') { setContext('vps', hostname.value); return; }
  if (key === 'vps-setup') { openView('vps-setup'); return; }
  const prefix = isMasterContext.value ? 'master' : 'vps';
  if (key === 'task-log') { openView(prefix + '-task-log'); return; }
  if (key === 'host-logs') { openHostLogs(); return; }
  if (key === 'pbgui-branch') { openView(prefix + '-pbgui-branch'); return; }
  if (key === 'pb7-branch') { openView(prefix + '-pb7-branch'); return; }
  if (key === 'pb8-branch') { openView(prefix + '-pb8-branch'); return; }
  if (key === 'ufw') { openUfw(); return; }
}
const currentTarget = computed(() => isMasterContext.value ? String(config.value.master_name || '') : hostname.value);
const currentBranches = computed(() => detail.value?.branches?.[currentRepo.value] || {});
const currentUfwHost = computed(() => isMasterContext.value ? String(config.value.master_name || '') : hostname.value);
const monitorItems = computed(() => {
  const monitor = detail.value?.monitor || {};
  return [...(Array.isArray(monitor.v7) ? monitor.v7 : []), ...(Array.isArray(monitor.v8) ? monitor.v8 : []), ...(Array.isArray(monitor.instances) ? monitor.instances : [])];
});
const branchState = computed(() => {
  const repo = currentRepo.value;
  if (!branchUi.value[repo]) branchUi.value[repo] = {};
  return branchUi.value[repo];
});
const vpsLogging = computed(() => loggingConfig.value.services || config.value.vps_logging?.services || []);
const deployActions = computed(() => deploySettings.value.actions || config.value.vps_deploy?.actions || []);
const deployModes = computed(() => deploySettings.value.modes || config.value.vps_deploy?.modes || []);
const modalTitle = computed(() => {
  const titles: Record<string, string> = {
    confirm: t('vpsmgr.confirmAction'), history: t('vpsmgr.metricHistory'), 'host-key': t('vpsmgr.reviewSshHostKey'),
    'package-updates': t('vpsmgr.packageUpdatesLabel'), 'ufw-preview': t('vpsmgr.ufwPreview'), 'existing-import': t('vpsmgr.importExisting'),
    'cluster-import': t('vpsmgr.importClusterNodes'), 'cluster-onboard': t('vpsmgr.clusterOnboarding'), 'deploy-password': t('vpsmgr.deploymentPassword'),
    password: t('vpsmgr.password'), files: t('vpsmgr.files'), 'bot-log': t('vpsmgr.botLogMatches'), systemd: t('vpsmgr.systemdMigration'),
  };
  return titles[String(modal.value || '')] || t('vpsmgr.vpsManager');
});

function clean(value: unknown): string { return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim(); }
function display(value: unknown): string { return clean(value) || '—'; }
function inputValue(event: unknown): string { return String((event as { target?: { value?: unknown } })?.target?.value ?? ''); }
function numberValue(event: unknown): number { const value = Number(inputValue(event)); return Number.isFinite(value) ? value : 0; }
function checkedValue(event: unknown): boolean { return Boolean((event as { target?: { checked?: unknown } })?.target?.checked); }
function jsonText(value: unknown): string { try { return JSON.stringify(value || {}, null, 2); } catch { return '{}'; } }
function messageOf(value: unknown): string { if (value && typeof value === 'object') { const body = value as JsonRecord; return clean(body.message || body.detail || body.error || JSON.stringify(body)); } return clean(value); }
/* Status/pill/notice colour mappings (the former .manager-pill
   .good/.warn/.bad and .manager-status .ok/.err tints). Each helper
   returns the FULL colour set including the fallback branch so the
   static utilities on the element never fight a dynamic one. */
function statusClass(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (['online', 'running', 'successful', 'connected', 'known', 'ok', 'ready'].includes(v)) return 'bg-success-deep text-success-soft';
  if (['failed', 'offline', 'error', 'unreachable', 'mismatch'].includes(v)) return 'bg-danger-deep text-danger-soft';
  return 'bg-warning-deep text-warning-soft';
}

function noticeKindClass(kind: string): string {
  if (kind === 'ok') return 'border border-success/30 text-success-soft';
  if (kind === 'err') return 'border border-danger/30 text-danger-soft';
  return '';
}

function checkStatusClass(ok: unknown): string {
  return ok ? 'border border-success/30 text-success-soft' : 'border border-danger/30 text-danger-soft';
}

/* manager-btn variant → complete Tailwind set (the former .manager-btn,
   .primary/.warn/.danger/.small and .manager-file-row rules). Every branch
   returns the full declaration set — no base class stays on the element,
   so two utilities never claim the same property. */
type BtnVariant = 'base' | 'primary' | 'warn' | 'danger' | 'small' | 'file';
function btnClass(variant: BtnVariant = 'base'): string {
  const color = variant === 'primary'
    ? 'border-accent/42 bg-accent/8 text-accent-soft'
    : variant === 'warn'
      ? 'border-warning/38 bg-warning/8 text-warning-soft'
      : variant === 'danger'
        ? 'border-danger/38 bg-danger/8 text-danger-soft'
        : 'border-border-default bg-panel text-primary';
  const size = variant === 'small'
    ? 'min-h-[27px] px-1.75 py-0.75 text-[0.72rem]'
    : 'min-h-8 px-2.5 py-1.5';
  const layout = variant === 'file' ? ' justify-start text-left' : '';
  return `inline-flex cursor-pointer items-center gap-1.5 rounded-md border ${color} ${size} hover:border-accent/48 hover:bg-border-strong disabled:cursor-not-allowed disabled:opacity-50${layout}`;
}
function formatBytes(value: unknown): string { const n = Number(value || 0); if (!Number.isFinite(n) || n <= 0) return '0 B'; const units = ['B', 'KB', 'MB', 'GB', 'TB']; const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024))); return `${(n / 1024 ** i).toFixed(1)} ${units[i]}`; }
function formatPercent(value: unknown): string { const n = Number(value); return Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'; }
function actionText(action: unknown): string { return clean(action).replace(/^vps-/, '').replace(/-/g, ' ') || '—'; }
function showNotice(value: unknown, kind: 'ok' | 'err' = 'ok'): void { notice.value = { text: messageOf(value), kind }; }
function closeModal(): void { modal.value = null; modalData.value = {}; }
function setModal(kind: ModalKind, data: JsonRecord = {}): void { modalData.value = data; modal.value = kind; }

function nextRequestId(): string { requestCounter.value += 1; return `vps-manager-${requestCounter.value}`; }
function send(command: JsonRecord): void {
  const payload = { ...command };
  if (ws.value?.readyState === WebSocket.OPEN) ws.value.send(JSON.stringify(payload));
  else pendingWsMessages.value.push(payload);
}
function flushPendingWsMessages(): void { const pending = pendingWsMessages.value.splice(0); pending.forEach((item) => send(item)); }
function setContext(nextView: ManagerView, nextHost = ''): void {
  const previousHost = hostname.value;
  const previousIsVps = view.value.startsWith('vps') || view.value.startsWith('master');
  view.value = nextView;
  hostname.value = nextHost;
  contextGeneration.value += 1;
  detail.value = nextHost && detail.value?.hostname === nextHost ? detail.value : nextHost ? null : detail.value;
  if (previousHost !== nextHost || (previousIsVps && !nextView.startsWith('vps') && !nextView.startsWith('master'))) clearRevealedSecrets();
  closeSharedLogViewer();
  if (nextHost) hydrateVpsForm(detail.value?.hostname === nextHost ? detail.value : null);
  const generation = contextGeneration.value;
  send({ cmd: 'set_context', view: nextView, hostname: nextHost, context_generation: generation });
  void fetchDetailFallback(nextView, nextHost, generation);
}
async function fetchDetailFallback(nextView: ManagerView, nextHost: string, generation: number): Promise<void> {
  if (nextView !== 'vps' && nextView !== 'master') return;
  const endpoint = nextView === 'master' ? `${apiBase}/detail-master` : nextHost ? `${apiBase}/detail/${encodeURIComponent(nextHost)}` : '';
  if (!endpoint) return;
  try {
    const result = await apiFetch<JsonRecord>(endpoint);
    if (generation !== contextGeneration.value) return;
    if (nextView === 'master' || String(result.hostname || '') === nextHost) { detail.value = result; hydrateVpsForm(result); }
  } catch {
    // The authenticated WebSocket remains the primary live source.
  }
}
function selectHost(row: JsonRecord): void { const target = String(row.hostname || ''); setContext(row.nav === 'master' ? 'master' : 'vps', target); if (row.nav === 'vps' && target) void resumeActiveOnboard(target); }
function openView(nextView: string): void {
  const target = nextView as ManagerView;
  if (target.startsWith('vps-') && !hostname.value) return;
  if (!target.endsWith('host-logs')) closeSharedLogViewer();
  setContext(target, target.startsWith('vps') ? hostname.value : target.startsWith('master') ? String(config.value.master_name || '') : '');
  if (target.endsWith('host-logs')) void nextTick(initSharedLogViewer);
  if (target.endsWith('task-log')) void nextTick(() => { logFilename.value = taskLogFile(target); initSharedLogViewer(); });
}
function taskLogFile(target: string): string {
  const command = String(detail.value?.progress?.command || (isMasterContext.value ? 'master-update-linux' : 'vps-update'));
  return isMasterContext.value || target.startsWith('master') ? `MasterAction:${command}` : `VPSAction:${hostname.value}:${command}`;
}
function initSharedLogViewer(): void {
  if (typeof window === 'undefined') return;
  const Viewer = (window as Window & { LogViewerPanel?: new (options: Record<string, unknown>) => SharedLogViewer }).LogViewerPanel;
  if (typeof Viewer !== 'function') return;
  closeSharedLogViewer();
  const wsRoot = managerWsUrl().replace(/\/api\/vps-manager\/ws$/, '');
  const viewerHost = isMasterContext.value ? 'local' : (hostname.value || 'local');
  const viewer = new Viewer({ containerId: 'vps-manager-log-viewer', wsBase: wsRoot, defaultHost: viewerHost, defaultFile: logFilename.value || '', presets: 'system', showRestart: false, height: '360px', startLocalAtEnd: false });
  sharedLogViewer.value = viewer;
  viewer.open();
  viewer.setHost(viewerHost);
  if (logFilename.value) viewer.setFile(logFilename.value);
}
function closeSharedLogViewer(): void { sharedLogViewer.value?.close(); sharedLogViewer.value = null; }
function selectLogFile(file: string): void { logFilename.value = file; sharedLogViewer.value?.setFile(file); }
function connectionLabel(): string { return connection.value === 'connected' ? t('vpsmgr.connected') : connection.value === 'lost' ? t('vpsmgr.disconnected') : t('vpsmgr.connecting'); }

function connect(): void {
  const socket = new WebSocket(managerWsUrl());
  ws.value = socket;
  connection.value = 'connecting';
  socket.onopen = () => { connection.value = 'connected'; send({ cmd: 'set_context', view: view.value, hostname: hostname.value, context_generation: contextGeneration.value }); flushPendingWsMessages(); };
  socket.onmessage = (event) => { try { receive(JSON.parse(event.data) as JsonRecord); } catch { showNotice(t('vpsmgr.invalidMessage'), 'err'); } };
  socket.onerror = () => { connection.value = 'lost'; };
  socket.onclose = () => { connection.value = 'lost'; if (!reconnectTimer) reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 3000); };
}
function disconnect(): void {
  contextGeneration.value += 1;
  clearRevealedSecrets();
  closeSharedLogViewer();
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (clusterPollTimer) clearTimeout(clusterPollTimer);
  if (onboardPollTimer) clearTimeout(onboardPollTimer);
  reconnectTimer = clusterPollTimer = onboardPollTimer = null;
  const socket = ws.value;
  ws.value = null;
  if (socket) { socket.onmessage = null; socket.onclose = null; socket.close(); }
}

function hydrateVpsForm(source: JsonRecord | null): void {
  if (!source?.config) return;
  const next = { ...source.config };
  Object.entries(next).forEach(([key, value]) => { if (!vpsDirtyFields.value[key]) vpsForm.value[key] = value; });
  logFilename.value = String(source.log_preview?.filename || source.logfiles?.[0] || '');
  logSizeKb.value = Number(source.log_preview?.size_kb || 50);
  logContent.value = String(source.log_preview?.content || '');
}
function clearRevealedSecrets(): void { secretFields.value = {}; if (vpsForm.value) { for (const key of ['user_pw', 'root_pw', 'user_sudo_pw', 'initial_root_pw']) vpsForm.value[key] = ''; } deploy.value.password = ''; masterSudoPw.value = ''; ufw.value.sudoPw = ''; }
function setVpsField(key: string, value: unknown): void { vpsForm.value[key] = value; vpsDirtyFields.value[key] = true; }
function setAddField(key: string, value: unknown): void { addForm.value[key] = value; if (['hostname', 'ip', 'init_methode', 'initial_root_pw', 'user_sudo', 'user_sudo_pw', 'private_key_user', 'private_key_file'].includes(key)) addReady.value = {}; }
function canUseStoredPassword(): boolean { return Boolean(vpsForm.value.user_pw || secretFields.value.user_pw); }

function receive(message: JsonRecord): void {
  if (message.type === 'state') {
    state.value = message.data || {};
    loggingConfig.value = structuredCloneSafe(state.value.config?.vps_logging || {});
    deploySettings.value = structuredCloneSafe(state.value.config?.vps_deploy || {});
    if (!deploySettings.value.action) deploySettings.value.action = String(state.value.config?.vps_deploy?.action || '');
    return;
  }
  if (message.type === 'detail') {
    if (Number(message.context_generation || 0) !== contextGeneration.value) return;
    detail.value = message.data || null;
    hydrateVpsForm(detail.value);
    return;
  }
  if (message.type === 'result') { handleResult(message); return; }
  if (message.type === 'error') { showNotice(message.error, 'err'); return; }
  if (message.type === 'confirm_unknown_host_key') { setModal('host-key', { ...message, forDeploy: true }); return; }
  if (message.type === 'secret_value') { handleSecret(message); return; }
  if (message.type === 'log_preview') { if (String(message.hostname || '') === hostname.value) { logContent.value = String(message.data?.content || message.data?.log || ''); logLoading.value = false; } return; }
  if (message.type === 'remote_branches') { if (activeRequestIds.value.branches !== Number(message.request_id || 0)) return; branchState.value.remoteBranches = message.branches || []; return; }
  if (message.type === 'remote_branch_commits') { if (activeRequestIds.value.commits !== Number(message.request_id || 0)) return; branchState.value.remoteCommits = message.commits || []; return; }
  if (message.type === 'cpu_history' || message.type === 'metric_history') { metric.value = { ...metric.value, loading: false, data: message.data || null }; setModal('history', metric.value); return; }
  if (message.type === 'bot_log_matches') { botLog.value = { ...botLog.value, loading: false, lines: message.lines || [] }; setModal('bot-log', botLog.value); return; }
  if (message.type === 'vps_systemd_migration_preview') { setModal('systemd', { data: message.data || {} }); return; }
  if (message.type === 'public_ip_result') { publicIp.value = String(message.data?.ip || message.data || ''); if (publicIp.value && !addForm.value.ip) addForm.value.ip = publicIp.value; return; }
  if (message.type === 'vps_ready_result') { addReady.value = message.data || {}; return; }
  if (message.type === 'write_hosts_result') { showNotice(message.data?.message || t('vpsmgr.addedToHosts')); return; }
  if (message.type === 'browse_result') { setModal('files', { data: message.data || {} }); return; }
  if (message.type === 'vps_read_settings_progress') { modalData.value = { ...modalData.value, progress: { ...message } }; return; }
  if (message.type === 'local_sudo_validation_result') {
    if (!message.data?.ok) { pendingMasterAction.value = null; showNotice(message.data?.error || t('vpsmgr.invalidSudoPassword'), 'err'); return; }
    const pending = pendingMasterAction.value;
    pendingMasterAction.value = null;
    if (pending) { closeModal(); runMasterCommand(pending.command, pending.extraVars); }
    return;
  }
}
function handleSecret(message: JsonRecord): void {
  const data = message.data || {};
  if (String(data.hostname || hostname.value) !== hostname.value) return;
  const field = String(data.field || '');
  if (!field) return;
  secretFields.value[field] = String(data.value || '');
  vpsForm.value[field] = String(data.value || '');
}
function handleResult(message: JsonRecord): void {
  const cmd = String(message.cmd || '');
  if (message.success === false) { showNotice(message.error || message.data?.error, 'err'); return; }
  const data = message.data || {};
  if (cmd === 'probe_vps_host_key') setModal('host-key', data);
  else if (cmd === 'trust_vps_host_key') { closeModal(); showNotice(t('vpsmgr.trusted')); send({ cmd: 'refresh' }); }
  else if (cmd === 'read_ufw_rules') { applyUfwData(data); showNotice(t('vpsmgr.ufwRulesLoaded')); }
  else if (cmd === 'preview_ufw_rules') setModal('ufw-preview', data);
  else if (cmd === 'apply_ufw_rules') { applyUfwData(data); closeModal(); showNotice(t('vpsmgr.ufwChangesApplied')); }
  else if (cmd === 'read_vps_settings') { if (data?.config) { detail.value = { ...(detail.value || {}), ...data }; hydrateVpsForm(data); } showNotice(t('vpsmgr.vpsSettingsRefreshed')); }
  else if (cmd === 'fetch_vps_log') { logContent.value = String(data.content || data.log || ''); logLoading.value = false; }
  else if (cmd === 'reveal_secret') handleSecret(message);
  else if (cmd === 'validate_and_stage_vps_deploy_host') handleStagedDeploy(data);
  else if (cmd === 'finalize_vps_deploy_session') { closeModal(); showNotice(t('vpsmgr.deploymentStarted')); }
  else if (cmd === 'delete_vps') { closeModal(); showNotice(t('vpsmgr.vpsDeleted')); setContext('overview'); }
  else if (cmd === 'save_vps_config') { closeModal(); showNotice(t('vpsmgr.vpsConfigSaved')); }
  else if (cmd === 'save_vps_logging_config') { loggingConfig.value = data; showNotice(t('vpsmgr.vpsLoggingSettingsSaved')); }
  else if (cmd === 'save_vps_deploy_settings') { deploySettings.value = data; showNotice(t('vpsmgr.deploySettingsSaved')); }
  else if (cmd === 'add_vps_to_cluster') { showNotice(t('vpsmgr.vpsJoinedCluster')); }
  else if (cmd === 'preview_vps_systemd_migration') setModal('systemd', { data });
  else if (cmd === 'refresh') showNotice(t('vpsmgr.refreshed'));
  else showNotice(data?.message || message.message || t('common.saved'));
}
function structuredCloneSafe(value: unknown): JsonRecord { try { return JSON.parse(JSON.stringify(value || {})) as JsonRecord; } catch { return {}; } }

function refresh(): void { send({ cmd: 'refresh' }); }
const OVERVIEW_PREFS_KEY = 'pbgui-vps-manager-overview';
function saveOverviewPrefs(): void { try { localStorage.setItem(OVERVIEW_PREFS_KEY, JSON.stringify({ selectedHosts: [...selectedHosts.value], sort: { ...overviewSort.value }, columns: { ...visibleColumns.value } })); } catch { /* unavailable in test/private mode */ } }
function loadOverviewPrefs(): void { try { const saved = JSON.parse(localStorage.getItem(OVERVIEW_PREFS_KEY) || '{}') as JsonRecord; if (Array.isArray(saved.selectedHosts)) deploy.value.selectedHosts = saved.selectedHosts.map(String); if (saved.sort?.field) overviewSort.value = { field: String(saved.sort.field), direction: saved.sort.direction === 'desc' ? 'desc' : 'asc' }; if (saved.columns && typeof saved.columns === 'object') visibleColumns.value = { ...visibleColumns.value, ...saved.columns }; } catch { /* unavailable or invalid */ } }
function setOverviewSelectionRange(anchor: string, target: string, mode: boolean): void {
  const hosts: string[] = vpsRows.value.map((row: JsonRecord) => String(row.hostname || '')).filter((host: string) => Boolean(host));
  const start = hosts.indexOf(anchor);
  const end = hosts.indexOf(target);
  if (start < 0 || end < 0) return;
  const range = hosts.slice(Math.min(start, end), Math.max(start, end) + 1);
  const selected = new Set(selectedHosts.value);
  range.forEach((host: string) => mode ? selected.add(host) : selected.delete(host));
  deploy.value.selectedHosts = hosts.filter((host: string) => selected.has(host));
  saveOverviewPrefs();
}
function startOverviewDrag(row: JsonRecord, event: PointerEvent): void {
  if (event.button !== 0 || row.nav !== 'vps' || (event.target as HTMLElement | null)?.closest('button, input, select, a')) return;
  const host = String(row.hostname || '');
  overviewDrag.value = { active: true, anchor: host, mode: !selectedHosts.value.includes(host), pointerHandled: true };
  setOverviewSelectionRange(host, host, overviewDrag.value.mode);
}
function moveOverviewDrag(row: JsonRecord): void { if (overviewDrag.value.active && row.nav === 'vps') setOverviewSelectionRange(overviewDrag.value.anchor, String(row.hostname || ''), overviewDrag.value.mode); }
function endOverviewDrag(): void { overviewDrag.value.active = false; }
function handleOverviewRowClick(row: JsonRecord): void { if (overviewDrag.value.pointerHandled) { overviewDrag.value.pointerHandled = false; return; } if (row.nav === 'vps') toggleSelectedHost(String(row.hostname || '')); }
function toggleSelectedHost(host: string): void { const current = [...selectedHosts.value]; const index = current.indexOf(host); if (index >= 0) current.splice(index, 1); else current.push(host); deploy.value.selectedHosts = current; saveOverviewPrefs(); }
function selectAllVps(): void { deploy.value.selectedHosts = vpsRows.value.map((row: JsonRecord) => String(row.hostname || '')).filter(Boolean); saveOverviewPrefs(); }
function clearSelectedVps(): void { deploy.value.selectedHosts = []; saveOverviewPrefs(); }
function sortOverview(field: string): void { overviewSort.value = overviewSort.value.field === field ? { field, direction: overviewSort.value.direction === 'asc' ? 'desc' : 'asc' } : { field, direction: 'asc' }; saveOverviewPrefs(); }
function sortedRows(): JsonRecord[] { const { field, direction } = overviewSort.value; return [...rows.value].sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''), undefined, { numeric: true }) * (direction === 'asc' ? 1 : -1)); }
function toggleColumn(key: string): void { visibleColumns.value[key] = !visibleColumns.value[key]; saveOverviewPrefs(); }

function setupVps(): void { send({ cmd: 'setup_vps', hostname: hostname.value, form: { ...vpsForm.value }, debug: false }); }
function readVpsSettings(): void { if (!canUseStoredPassword()) { setModal('password', { title: t('vpsmgr.vpsUserPasswordRequired'), action: 'read-settings' }); return; } send({ cmd: 'read_vps_settings', hostname: hostname.value, form: { ...vpsForm.value }, request_id: nextRequestId() }); }
function saveVpsConfig(): void { if (!canUseStoredPassword()) { setModal('password', { title: t('vpsmgr.vpsUserPasswordRequired'), action: 'save-config' }); return; } send({ cmd: 'save_vps_config', hostname: hostname.value, form: { ...vpsForm.value, user_pw: vpsForm.value.user_pw || undefined } }); }
function saveAddVps(): void { send({ cmd: 'save_vps', form: { ...addForm.value } }); }
function initAddVps(): void { send({ cmd: 'init_vps', form: { ...addForm.value }, debug: false }); }
function detectIp(): void { send({ cmd: 'detect_public_ip' }); }
function checkReady(): void { send({ cmd: 'check_vps_ready', form: { ...addForm.value } }); }
function writeHosts(): void { setModal('password', { title: t('vpsmgr.updateEtcHosts'), action: 'write-hosts' }); }
function confirmWriteHosts(password: string): void { masterSudoPw.value = password; closeModal(); send({ cmd: 'write_hosts_entry', ip: String(addForm.value.ip || publicIp.value), hostname: String(addForm.value.hostname || ''), sudo_pw: password }); }
function addFormReady(): boolean {
  const form = addForm.value;
  const method = String(form.init_methode || 'root');
  const credentialsReady = method === 'private_key'
    ? Boolean(form.private_key_user && form.private_key_file)
    : method === 'password'
      ? Boolean(form.user_sudo && form.user_sudo_pw)
      : Boolean(form.initial_root_pw && form.root_pw);
  const preflightReady = Boolean(addReady.value.hosts_ok && addReady.value.ssh_ok && !addReady.value.host_key?.needs_confirmation);
  return Boolean(form.hostname && form.ip && form.user && form.user_pw && form.install_dir && credentialsReady && preflightReady);
}
function acceptAddHostKey(): void {
  const hostKey = addReady.value.host_key || {};
  addForm.value.accept_unknown_host = true;
  addForm.value.accepted_host_key_fingerprint = String(hostKey.fingerprint || '');
  addForm.value.replace_existing_host_key = String(hostKey.status || '') === 'mismatch';
  checkReady();
}


async function resolveExistingImport(): Promise<void> { const host = encodeURIComponent(String(existingImport.value.hostname || '')); if (!host) return; try { const data = await apiFetch<JsonRecord>(`${apiBase}/import/resolve-host?hostname=${host}`); Object.assign(existingImport.value, data); } catch (error) { showNotice(error, 'err'); } }
async function probeExistingImport(): Promise<void> { try { const data = await apiFetch<JsonRecord>(`${apiBase}/import/probe`, { method: 'POST', body: JSON.stringify({ ...existingImport.value }) }); modalData.value = { ...modalData.value, probe: data }; } catch (error) { showNotice(error, 'err'); } }
function acceptExistingHostKey(): void {
  const hostKey = modalData.value.probe?.host_key || {};
  existingImport.value.accept_unknown_host = true;
  existingImport.value.accepted_host_key_fingerprint = String(hostKey.fingerprint || '');
  void probeExistingImport();
}
async function saveExistingImport(): Promise<void> { try { await apiFetch<JsonRecord>(`${apiBase}/import/save`, { method: 'POST', body: JSON.stringify({ ...existingImport.value }) }); showNotice(t('vpsmgr.vpsSaved')); refresh(); } catch (error) { showNotice(error, 'err'); } }
function openExistingImport(): void { setModal('existing-import', { probe: null }); }
async function openClusterImport(): Promise<void> { setModal('cluster-import', { loading: true }); try { const preview = await apiFetch<JsonRecord>(`${apiBase}/cluster-import/preview`); clusterImport.value.preview = preview; const items = Array.isArray(preview.items) ? preview.items : []; clusterImport.value.selected = Object.fromEntries(items.map((item: JsonRecord) => [String(item.hostname || ''), item.action !== 'skip'])); modalData.value = { preview, loading: false }; } catch (error) { showNotice(error, 'err'); closeModal(); } }
async function applyClusterImport(): Promise<void> { try { const preview = clusterImport.value.preview || {}; const selected = (preview.items || []).filter((item: JsonRecord) => clusterImport.value.selected[item.hostname]); const result = await apiFetch<JsonRecord>(`${apiBase}/cluster-import/apply`, { method: 'POST', body: JSON.stringify({ selected, passwords: clusterImport.value.passwords, local_sudo_pw: clusterImport.value.local_sudo_pw }) }); closeModal(); pollClusterImport(String(result.job_id || '')); } catch (error) { showNotice(error, 'err'); } }
function pollClusterImport(jobId: string): void { if (!jobId) return; const poll = async () => { try { const result = await apiFetch<JsonRecord>(`${apiBase}/cluster-import/progress/${encodeURIComponent(jobId)}`); modalData.value = { ...modalData.value, progress: result }; if (!['successful', 'error', 'failed'].includes(String(result.status || ''))) clusterPollTimer = setTimeout(poll, 1000); else showNotice(result.status === 'successful' ? t('vpsmgr.clusterNodeImportCompleted') : messageOf(result.error), result.status === 'successful' ? 'ok' : 'err'); } catch (error) { showNotice(error, 'err'); } }; setModal('cluster-import', { progress: { status: 'running', percent: 0 } }); void poll(); }

async function resumeActiveOnboard(target: string): Promise<void> {
  try {
    const active = await apiFetch<JsonRecord>(`${apiBase}/cluster-onboard/${encodeURIComponent(target)}/active`);
    if (!active.active || !active.job_id) return;
    clusterOnboard.value = { hostname: target, job: active };
    setModal('cluster-onboard', { hostname: target, progress: active });
    pollOnboard(String(active.job_id));
  } catch {
    // Active-job discovery is best-effort; the normal host view remains usable.
  }
}
function startClusterOnboard(): void { const target = hostname.value; if (!target) return; setModal('cluster-onboard', { hostname: target, progress: { status: 'starting', percent: 0 } }); void (async () => { try { const result = await apiFetch<JsonRecord>(`${apiBase}/cluster-onboard/${encodeURIComponent(target)}/start`, { method: 'POST' }); clusterOnboard.value = { hostname: target, job: result }; pollOnboard(String(result.job_id || '')); } catch (error) { showNotice(error, 'err'); closeModal(); } })(); }
function pollOnboard(jobId: string): void { if (!jobId) return; const poll = async () => { try { const result = await apiFetch<JsonRecord>(`${apiBase}/cluster-onboard/jobs/${encodeURIComponent(jobId)}`); modalData.value = { ...modalData.value, progress: result }; if (!['successful', 'error', 'failed'].includes(String(result.status || ''))) onboardPollTimer = setTimeout(poll, 1000); else showNotice(result.status === 'successful' ? t('vpsmgr.clusterOnboardingCompleted') : messageOf(result.error), result.status === 'successful' ? 'ok' : 'err'); } catch (error) { showNotice(error, 'err'); } }; void poll(); }

function openHostKeyReview(): void { send({ cmd: 'probe_vps_host_key', hostname: hostname.value }); }
function trustHostKey(): void {
  if (modalData.value.forDeploy) {
    deploy.value.currentHost = String(modalData.value.hostname || deploy.value.currentHost || '');
    deploy.value.acceptUnknownHost = true;
    deploy.value.acceptedHostKeyFingerprint = String(modalData.value.fingerprint || '');
    closeModal();
    stageNextDeployHost();
    return;
  }
  send({ cmd: 'trust_vps_host_key', hostname: String(modalData.value.hostname || hostname.value), expected_fingerprint: String(modalData.value.fingerprint || ''), replace_existing: modalData.value.status === 'mismatch' });
}

function revealSecret(field: string): void { send({ cmd: 'reveal_secret', hostname: hostname.value, field }); }
function requestDelete(): void { setModal('confirm', { title: t('vpsmgr.deleteVps'), message: t('vpsmgr.deleteVpsBody', { host: hostname.value }), action: 'delete-vps' }); }
function acceptConfirm(): void { const action = String(modalData.value.action || ''); closeModal(); if (action === 'delete-vps') send({ cmd: 'delete_vps', hostname: hostname.value }); if (action === 'apply-ufw') sendUfw('apply_ufw_rules'); if (action === 'purge') runVpsCommand('vps-purge-install', true); if (action === 'systemd') runVpsCommand('vps-migrate-systemd', false); }
function runMasterCommand(command: string, extraVars: JsonRecord | null = null): void { send({ cmd: 'run_master_command', command, command_text: actionText(command), debug: false, sudo_pw: masterSudoPw.value || '', extra_vars: extraVars }); }
function runVpsCommand(command: string, saveConfig = true, extraVars: JsonRecord | null = null): void { if (saveConfig && !canUseStoredPassword() && command !== 'vps-restart') { setModal('password', { title: t('vpsmgr.vpsUserPasswordRequired'), action: 'run-vps', command, extraVars }); return; } if (saveConfig) send({ cmd: 'save_vps_config', hostname: hostname.value, form: { ...vpsForm.value } }); send({ cmd: 'run_vps_command', hostname: hostname.value, command, command_text: actionText(command), debug: false, extra_vars: extraVars }); }
function promptMasterCommand(command: string, extraVars: JsonRecord | null = null): void { setModal('password', { title: t('vpsmgr.sudoPassword'), action: 'run-master', command, extraVars }); }
function runMasterUpdate(): void { promptMasterCommand('master-update-linux', { reboot: false, reboot_requested: false }); }
function runMasterReboot(): void { promptMasterCommand('master-reboot'); }
function requestPurge(): void { setModal('confirm', { title: t('vpsmgr.purgeVpsInstall'), message: t('vpsmgr.purgeVpsInstallBody', { host: hostname.value }), action: 'purge' }); }
function executePasswordModal(): void { const password = String(modalData.value.password || ''); if (modalData.value.action === 'run-vps') { vpsForm.value.user_pw = password; closeModal(); runVpsCommand(String(modalData.value.command || ''), true, (modalData.value.extraVars || null) as JsonRecord | null); } else if (modalData.value.action === 'read-settings') { vpsForm.value.user_pw = password; closeModal(); readVpsSettings(); } else if (modalData.value.action === 'save-config') { vpsForm.value.user_pw = password; closeModal(); saveVpsConfig(); } else if (modalData.value.action === 'run-master') { masterSudoPw.value = password; pendingMasterAction.value = { command: String(modalData.value.command || ''), extraVars: (modalData.value.extraVars || null) as JsonRecord | null }; send({ cmd: 'validate_local_sudo_password', sudo_pw: password }); } else if (modalData.value.action === 'write-hosts') confirmWriteHosts(password); else if (modalData.value.action === 'ufw') { ufw.value.sudoPw = password; closeModal(); sendUfw(String(modalData.value.next || 'read_ufw_rules')); } else if (modalData.value.action === 'deploy') { deploy.value.password = password; closeModal(); stageNextDeployHost(); } }

function openPackageUpdates(): void { setModal('package-updates', { row: selectedRow.value || {}, packages: selectedRow.value?.package_status?.packages || [] }); }
function openHostLogs(): void { openView(isMasterContext.value ? 'master-host-logs' : 'vps-host-logs'); }
function fetchHostLog(): void { logLoading.value = true; send({ cmd: 'fetch_vps_log', hostname: hostname.value, filename: logFilename.value, size_kb: logSizeKb.value, reverse: logReverse.value, debug: logDebug.value }); }
function browseFiles(): void { fileBrowseTarget.value = 'vps-install-dir'; send({ cmd: 'browse_files', path: String(vpsForm.value.install_dir || '') }); }
function browsePrivateKey(): void { fileBrowseTarget.value = 'add-private-key'; send({ cmd: 'browse_files', path: String(addForm.value.private_key_file || '') }); }
function browsePath(path: string): void { send({ cmd: 'browse_files', path }); }
function selectBrowsedPath(path: string, type: string): void { if (type === 'dir') { browsePath(path); return; } if (fileBrowseTarget.value === 'add-private-key') addForm.value.private_key_file = path; else vpsForm.value.install_dir = path; closeModal(); }

async function loadMetricHistory(metricName = 'cpu'): Promise<void> {
  metric.value = { loading: true, data: null, bot: '', name: metricName, error: '' };
  setModal('history', metric.value);
  try {
    const data = await apiFetch<JsonRecord>(`${apiBase}/metric-history/${encodeURIComponent(hostname.value)}?metric=${encodeURIComponent(metricName)}`);
    metric.value = { ...metric.value, loading: false, data };
    modalData.value = metric.value;
  } catch (error) {
    metric.value = { ...metric.value, loading: false, error: messageOf(error) };
    showNotice(error, 'err');
  }
}
function hasRuntime(runtime: 'pb7' | 'pb8'): boolean {
  const status = detail.value?.status || {};
  const row = selectedRow.value || {};
  if (runtime === 'pb7') return Boolean(status.pb7_installed ?? row.pb7_installed ?? ['pb7', 'pb7_pb8'].includes(String(vpsForm.value.runtime_profile || row.runtime_profile || 'pb7')));
  return Boolean(status.pb8_installed ?? row.pb8_installed ?? ['pb8', 'pb7_pb8'].includes(String(vpsForm.value.runtime_profile || row.runtime_profile || 'pb7')));
}
function profileAwareCombinedCommand(): string { return hasRuntime('pb8') && !hasRuntime('pb7') ? 'vps-update-pbgui-pb8' : hasRuntime('pb8') && hasRuntime('pb7') ? 'vps-update-pbgui-pb7-pb8' : 'vps-update-pb'; }
function runDirectDeploy(): void {
  send({ cmd: 'run_vps_deploy', hostnames: hostname.value ? [hostname.value] : [], command: profileAwareCombinedCommand(), mode: 'serial', debug: false, extra_vars: null });
}
function historyBotName(bot: JsonRecord): string {
  const name = String(bot.name || '');
  return String(bot.pb_version || '7') === '8' ? `8:${name}` : name;
}
function openBotMetric(bot: JsonRecord): void { const botName = historyBotName(bot); metric.value = { loading: true, data: null, bot: botName, name: botName, error: '' }; send({ cmd: 'get_metric_history', hostname: hostname.value, bot_name: botName, metric: 'cpu' }); setModal('history', metric.value); }
function openBotLogMatches(bot: JsonRecord, kind = 'tracebacks'): void { const botName = String(bot.name || ''); botLog.value = { loading: true, lines: [], bot: botName, kind, error: '' }; send({ cmd: 'fetch_bot_log_matches', request_id: nextRequestId(), hostname: hostname.value, bot_name: botName, pb_version: String(bot.pb_version || ''), kind, bucket: 'today', expected_count: Number(bot[`${kind}_today`] || 0), lines: 5000 }); setModal('bot-log', botLog.value); }

function branchOptions(source: JsonRecord): string[] { if (Array.isArray(source.branches)) return source.branches.map(String); if (source.branches && typeof source.branches === 'object') return Object.keys(source.branches); return source.current_branch ? [String(source.current_branch)] : ['main']; }
function branchCommits(source: JsonRecord, branch: string): JsonRecord[] { if (Array.isArray(source.remoteCommits) && source.remoteCommits.length) return source.remoteCommits; if (source.branches && !Array.isArray(source.branches) && Array.isArray(source.branches[branch])) return source.branches[branch]; return Array.isArray(source.commits) ? source.commits : []; }
function branchRepoState(repo: Repo): JsonRecord {
  const current = detail.value?.branches?.[repo] || {};
  const existing = branchUi.value[repo] || {};
  const remoteName = String(existing.remoteName ?? current.default_remote_name ?? current.upstream_remote_name ?? 'origin');
  const remoteUrl = String(existing.remoteUrl ?? current.remote_url ?? current.remote_urls?.[remoteName] ?? current.upstream_remote_url ?? '');
  const ui = {
    branch: existing.branch ?? current.current_branch ?? branchOptions(current)[0] ?? 'main',
    sourceBranch: existing.sourceBranch ?? current.current_branch ?? branchOptions(current)[0] ?? 'main',
    commit: existing.commit ?? current.current_commit ?? '', remoteName, remoteUrl, sourceMode: existing.sourceMode ?? 'tracked',
    remoteBranches: existing.remoteBranches ?? [], remoteCommits: existing.remoteCommits ?? [],
  };
  branchUi.value[repo] = ui;
  return { ...current, ...ui };
}
function loadRemoteBranches(): void { const repo = currentRepo.value; const current = branchRepoState(repo); const request = Number(requestCounter.value + 1); requestCounter.value = request; activeRequestIds.value.branches = request; send({ cmd: 'load_remote_branches', request_id: request, remote_url: String(current.remoteUrl || '') }); }
function loadRemoteCommits(): void { const repo = currentRepo.value; const current = branchRepoState(repo); const request = Number(requestCounter.value + 1); requestCounter.value = request; activeRequestIds.value.commits = request; send({ cmd: 'load_remote_branch_commits', request_id: request, remote_url: String(current.remoteUrl || ''), branch: String(current.branch || 'main'), limit: 50 }); }
function setBranchField(field: string, value: unknown): void { const repo = currentRepo.value; branchUi.value[repo] = { ...(branchUi.value[repo] || {}), [field]: value }; }
function setBranchRemoteName(value: string): void { const repo = currentRepo.value; const source = detail.value?.branches?.[repo] || {}; setBranchField('remoteName', value); setBranchField('remoteUrl', source.remote_urls?.[value] || (value === source.upstream_remote_name ? source.upstream_remote_url : '')); }
function usePinnedUpstream(): void { const repo = currentRepo.value; const source = detail.value?.branches?.[repo] || {}; const branch = repo === 'pb7' ? 'master' : 'main'; branchUi.value[repo] = { ...(branchUi.value[repo] || {}), sourceMode: 'pinned', branch, sourceBranch: branch, commit: '', remoteName: source.upstream_remote_name || 'origin', remoteUrl: source.upstream_remote_url || '' }; }
function useLocalBranchTarget(): void { const repo = currentRepo.value; const source = detail.value?.branches?.[repo] || {}; const branch = String(source.current_branch || 'main'); branchUi.value[repo] = { ...(branchUi.value[repo] || {}), sourceMode: 'local', branch, sourceBranch: branch, commit: String(source.current_commit || ''), remoteName: source.default_remote_name || 'origin', remoteUrl: source.remote_urls?.[source.default_remote_name] || '' }; }
function runBranchAction(): void {
  const repo = currentRepo.value;
  const scope = isMasterContext.value ? 'master' : 'vps';
  const current = branchRepoState(repo);
  const command = repo === 'pbgui'
    ? `${scope}-switch-pbgui-branch`
    : repo === 'pb7'
      ? `${scope}-switch-pb7-branch`
      : `${scope}-update-pb8`;
  const extraVars: JsonRecord = repo === 'pbgui'
    ? { branch: current.branch, ...(current.commit ? { commit: current.commit } : {}) }
    : {
        [`${repo}_branch`]: current.branch, [`${repo}_source_branch`]: current.sourceBranch || current.branch,
        ...(current.commit ? { [`${repo}_commit`]: current.commit } : {}),
        ...(current.remoteName ? { [`${repo}_remote_name`]: current.remoteName } : {}),
        ...(current.remoteUrl ? { [`${repo}_remote_url`]: current.remoteUrl } : {}),
        ...(current.sourceMode === 'pinned' ? { [`${repo}_use_pin`]: true } : {}),
      };
  if (scope === 'master') runMasterCommand(command, extraVars); else runVpsCommand(command, false, extraVars);
}
function loadMoreCommits(): void { const current = branchRepoState(currentRepo.value); send({ cmd: 'load_more_commits', repo: currentRepo.value, branch: String(current.branch || 'main'), limit: (current.commits || []).length + 50 }); }

function applyUfwData(data: JsonRecord, clearPending = false): void { ufw.value = { ...ufw.value, ...data, loaded: true, loading: false, applying: false, rules: data.rules || ufw.value.rules || [], revision: data.revision || ufw.value.revision || '', ...(clearPending ? { addRules: [], deleteNumbers: [] } : {}) }; }
function setUfwHost(): void { ufw.value.hostname = currentUfwHost.value; }
function openUfw(): void { setUfwHost(); openView(isMasterContext.value ? 'master-ufw' : 'vps-ufw'); }
function sendUfw(cmd: string): void { setUfwHost(); ufw.value.loading = cmd === 'read_ufw_rules'; ufw.value.applying = cmd !== 'read_ufw_rules'; const payload = cmd === 'read_ufw_rules' ? { cmd, hostname: ufw.value.hostname, sudo_pw: ufw.value.sudoPw || '' } : { cmd, hostname: ufw.value.hostname, sudo_pw: ufw.value.sudoPw || '', payload: { enabled: ufw.value.enabled, revision: ufw.value.revision, delete_numbers: ufw.value.deleteNumbers, add_rules: ufw.value.addRules } }; send(payload); }
function readUfw(): void { if (!ufw.value.sudoPw) { setModal('password', { title: t('vpsmgr.ufwSudoPasswordRequired'), action: 'ufw', next: 'read_ufw_rules' }); return; } sendUfw('read_ufw_rules'); }
function addUfwRule(): void { const form = ufw.value.form || {}; if (!form.port) return; ufw.value.addRules = [...(ufw.value.addRules || []), { action: form.action || 'allow', port: form.port, from: form.from || 'Anywhere', comment: form.comment || '' }]; ufw.value.form = { ...form, port: '', comment: '' }; }
function toggleUfwDelete(number: number): void { const values = [...(ufw.value.deleteNumbers || [])]; const index = values.indexOf(number); if (index >= 0) values.splice(index, 1); else values.push(number); ufw.value.deleteNumbers = values; }
function previewUfw(): void { if (!ufw.value.sudoPw) { setModal('password', { title: t('vpsmgr.ufwSudoPasswordRequired'), action: 'ufw', next: 'preview_ufw_rules' }); return; } sendUfw('preview_ufw_rules'); }
function applyUfw(): void { if (!ufw.value.sudoPw) { setModal('password', { title: t('vpsmgr.ufwSudoPasswordRequired'), action: 'ufw', next: 'apply_ufw_rules' }); return; } setModal('confirm', { title: t('vpsmgr.applyUfwChangesTitle'), message: t('vpsmgr.applyUfwChanges'), action: 'apply-ufw' }); }

function syncDeployConfig(): void { if (!deploySettings.value.action) deploySettings.value = { ...deploySettings.value, ...structuredCloneSafe(config.value.vps_deploy || {}) }; }
function saveLoggingSettings(): void { send({ cmd: 'save_vps_logging_config', data: { services: vpsLogging.value, selected_hosts: loggingConfig.value.selected_hosts || selectedHosts.value } }); }
function saveDeploySettings(): void { send({ cmd: 'save_vps_deploy_settings', data: { action: deploySettings.value.action, mode: deploySettings.value.mode, debug: Boolean(deploySettings.value.debug), reboot_requested: Boolean(deploySettings.value.reboot_requested) } }); }
function deployLogging(): void { send({ cmd: 'deploy_vps_logging', hostnames: loggingConfig.value.selected_hosts || selectedHosts.value, debug: Boolean(deploySettings.value.debug) }); }
function deployLogFile(entry: JsonRecord, host: string): string { const info = entry.host_logs?.[host] || {}; return String(info.file_alias || info.filename || ''); }
function openDeployLog(entry: JsonRecord, host: string): void {
  const file = deployLogFile(entry, host);
  if (!file) return;
  logFilename.value = file;
  setContext('vps-host-logs', host);
  void nextTick(initSharedLogViewer);
}
function startDeploy(): void { syncDeployConfig(); const hosts = (deploy.value.selectedHosts.length ? deploy.value.selectedHosts : vpsRows.value.map((row: JsonRecord) => String(row.hostname || ''))).filter(Boolean); deploy.value.selectedHosts = hosts; deploy.value.currentHost = hosts[0] || ''; deploy.value.remainingHosts = hosts.slice(1); if (!deploy.value.password && hosts.length && deploy.value.action !== 'vps-deploy-logging') { setModal('deploy-password', { action: 'deploy' }); return; } if (hosts.length) stageNextDeployHost(); }
function stageNextDeployHost(): void { const host = String(deploy.value.currentHost || deploy.value.selectedHosts[0] || ''); if (!host) return; send({ cmd: 'validate_and_stage_vps_deploy_host', hostnames: deploy.value.selectedHosts, hostname: host, password: deploy.value.password || '', command: deploySettings.value.action || 'vps-update-pbgui', mode: deploySettings.value.mode || 'serial', debug: Boolean(deploySettings.value.debug), extra_vars: deploySettings.value.reboot_requested ? { reboot: true, reboot_requested: true } : null, entry_id: deploy.value.entryId || undefined, accept_unknown_host: Boolean(deploy.value.acceptUnknownHost), accepted_host_key_fingerprint: deploy.value.acceptedHostKeyFingerprint || '' }); }
function handleStagedDeploy(data: JsonRecord): void { deploy.value.entryId = String(data.entry_id || deploy.value.entryId || ''); const remaining = Array.isArray(data.remaining_hosts) ? data.remaining_hosts : []; if (remaining.length) { deploy.value.remainingHosts = remaining; deploy.value.currentHost = String(remaining[0] || ''); stageNextDeployHost(); } else if (deploy.value.entryId) send({ cmd: 'finalize_vps_deploy_session', entry_id: deploy.value.entryId }); else { closeModal(); showNotice(t('vpsmgr.deploymentStarted')); } }


onMounted(() => {
  loadOverviewPrefs();
  document.addEventListener('pointerup', endOverviewDrag);
  connect();
});
onUnmounted(() => { document.removeEventListener('pointerup', endOverviewDrag); disconnect(); });
</script>

<template>
  <AppShell
    class="operations-shell operations-shell--vps-manager"
    page-key="system_vps_manager_fastapi"
    :page-title="t('vpsmgr.vpsManager')"
    :page-description="t('vpsmgr.vueSubtitle')"
    :sections="sections"
    :active-section="activeSection"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('vpsmgr.status')"
        :value="connectionLabel()"
        :tone="connection === 'connected' ? 'success' : connection === 'lost' ? 'danger' : 'warning'"
      />
    </template>

    <template #header-actions>
      <button data-action="refresh" :class="btnClass('primary')" @click="refresh"><PbIcon :icon="PhArrowClockwise" /> {{ t('vpsmgr.refresh') }}</button>
    </template>

  <div class="vps-manager flex min-h-0 flex-1 flex-col bg-page text-primary">
    <div class="flex min-h-0 flex-1 max-[680px]:block">
      <section class="min-w-0 flex-1 overflow-auto p-4.5 max-[900px]:p-3">
        <div v-if="notice" class="mb-3 block rounded-[7px] bg-card px-3 py-2.25 whitespace-pre-line" :class="noticeKindClass(notice.kind)">{{ notice.text }}</div>

        <section v-if="view === 'overview'" class="grid gap-3.5">
          <article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel">
            <div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.overview') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="select-all-vps" :class="btnClass('small')" @click="selectAllVps">{{ t('vpsmgr.selectAll') }}</button><button data-action="clear-selected-vps" :class="btnClass('small')" @click="clearSelectedVps">{{ t('vpsmgr.clearSelection') }}</button><button data-action="open-columns" :class="btnClass('small')" @click="setModal('files', { columns: true })">{{ t('vpsmgr.columns') }}</button></div></div>
            <div class="overflow-auto p-3.25"><table class="manager-table w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" data-sort="hostname" @click="sortOverview('hostname')">{{ t('vpsmgr.hostname') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.status">{{ t('vpsmgr.status') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.ip" @click="sortOverview('ip')">{{ t('vpsmgr.ipLabel') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.cpu">CPU</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.memory">RAM</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.disk">{{ t('vpsmgr.disk') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.pbgui">PBGui</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.pb7">PB7</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.pb8">PB8</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.updates">{{ t('vpsmgr.updates') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default" v-if="visibleColumns.actions">{{ t('vpsmgr.action') }}</th></tr></thead><tbody><tr class="cursor-pointer" v-for="row in sortedRows()" :key="row.hostname" :data-row-host="row.hostname" :class="{ selected: selectedHosts.includes(String(row.hostname || '')) }" @pointerdown="startOverviewDrag(row, $event)" @pointerenter="moveOverviewDrag(row)" @click="handleOverviewRowClick(row)"><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(row.name || row.hostname) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.status"><span class="inline-block rounded-full px-1.75 py-0.5 text-[0.72rem]" :class="statusClass(row.online ? 'online' : 'offline')">{{ row.online ? t('vpsmgr.online') : t('vpsmgr.offline') }}</span><small v-if="row.ssh_host_key_status"> {{ display(row.ssh_host_key_status) }}</small></td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.ip">{{ display(row.ip) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.cpu">{{ formatPercent(row.cpu) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.memory">{{ formatPercent(row.memory_percent ?? row.memory?.percent) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.disk">{{ formatPercent(row.disk_percent ?? row.disk?.percent) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.pbgui">{{ display(row.pbgui_branch) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.pb7">{{ display(row.pb7_branch) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.pb8">{{ display(row.pb8_branch) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.updates">{{ display(row.updates) }}<span v-if="row.task_current_label" class="block text-secondary leading-[1.45]">{{ row.task_current_label }}</span></td><td class="border-b border-border-default px-1.75 py-2 text-left align-top" v-if="visibleColumns.actions"><button v-if="row.nav === 'vps'" :data-action="'select-vps'" :data-host="row.hostname" :class="btnClass('small')" @pointerdown.stop @click.stop="selectHost(row)">{{ t('common.view') }}</button><button v-else :class="btnClass('small')" @pointerdown.stop @click.stop="selectHost(row)">{{ t('common.view') }}</button></td></tr></tbody></table><div v-if="!rows.length" class="p-4.5 text-center text-secondary">{{ t('common.noData') }}</div></div>
          </article>
          <article v-if="selectedHosts.length" class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.bulkActions') }}</span></div><div class="p-3.25"><p class="block text-secondary leading-[1.45]">{{ selectedHosts.length }} {{ t('vpsmgr.selectedLower') }}</p><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="open-view" data-view="deploys-vps-logging" :class="btnClass('primary')" @click="setContext('deploys-vps-logging')">{{ t('vpsmgr.deploy') }}</button><button data-action="deploy-logging" :class="btnClass()" @click="deployLogging">{{ t('vpsmgr.deployLogging') }}</button></div></div></article>
        </section>

        <section v-else-if="view === 'add-vps'" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] max-[900px]:grid-cols-1"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.addVpsTitle') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="open-existing-import" :class="btnClass()" @click="openExistingImport">{{ t('vpsmgr.importExisting') }}</button><button data-action="open-cluster-import" :class="btnClass()" @click="openClusterImport">{{ t('vpsmgr.importClusterNodes') }}</button></div></div><div class="p-3.25 grid gap-2.5"><div class="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5 max-[680px]:grid-cols-1"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.hostname') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-hostname" :value="addForm.hostname" @input="setAddField('hostname', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsIpv4') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-ip" :value="addForm.ip" @input="setAddField('ip', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserName') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-user" :value="addForm.user" @input="setAddField('user', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserPassword') }}<input type="password" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-user-password" :value="addForm.user_pw" @input="setAddField('user_pw', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.installPathLabel') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-install-dir" :value="addForm.install_dir" @input="setAddField('install_dir', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.initMethod') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-init-method" :value="addForm.init_methode" @change="setAddField('init_methode', inputValue($event))"><option v-for="method in config.init_methods || ['root', 'user']" :key="method" :value="method">{{ method }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'root'">{{ t('vpsmgr.initialRootPassword') }}<input type="password" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-initial-root-password" :value="addForm.initial_root_pw" @input="setAddField('initial_root_pw', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'root'">{{ t('vpsmgr.rootPasswordLabel') }}<input type="password" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-root-password" :value="addForm.root_pw" @input="setAddField('root_pw', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'password'">{{ t('vpsmgr.sudoUser') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-sudo-user" :value="addForm.user_sudo" @input="setAddField('user_sudo', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'password'">{{ t('vpsmgr.sudoPassword') }}<input type="password" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-sudo-password" :value="addForm.user_sudo_pw" @input="setAddField('user_sudo_pw', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'private_key'">{{ t('vpsmgr.privateKeyUser') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-private-key-user" :value="addForm.private_key_user" @input="setAddField('private_key_user', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="addForm.init_methode === 'private_key'">{{ t('vpsmgr.privateKeyFile') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-private-key-file" :value="addForm.private_key_file" @input="setAddField('private_key_file', inputValue($event))"><button type="button" class="justify-self-start" :class="btnClass('small')" @click="browsePrivateKey">{{ t('vpsmgr.browse') }}</button></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.swap') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-swap" :value="addForm.swap" @change="setAddField('swap', inputValue($event))"><option v-for="swap in config.swap_options || ['0', '2G']" :key="swap" :value="swap">{{ swap }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.runtimeProfile') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-runtime-profile" :value="addForm.runtime_profile" @change="setAddField('runtime_profile', inputValue($event))"><option value="pb7">PB7</option><option value="pb8">PB8 Live only</option><option value="pb7_pb8">PB7 + PB8</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.firewallSshPort') }}<input type="number" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-firewall-port" :value="addForm.firewall_ssh_port" @input="setAddField('firewall_ssh_port', numberValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.allowedSshIps') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="add-firewall-ips" :value="addForm.firewall_ssh_ips" @input="setAddField('firewall_ssh_ips', inputValue($event))"></label></div><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" :checked="Boolean(addForm.firewall)" @change="setAddField('firewall', checkedValue($event))"> {{ t('vpsmgr.enableFirewall') }}</label><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" :checked="Boolean(addForm.remove_user)" @change="setAddField('remove_user', checkedValue($event))"> {{ t('vpsmgr.removeUserLabel') }}</label><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="detect-public-ip" :class="btnClass()" @click="detectIp">{{ t('vpsmgr.detectPublicIp') }}</button><button data-action="check-vps-ready" :class="btnClass()" @click="checkReady">{{ t('vpsmgr.preflight') }}</button><button data-action="write-hosts" :class="btnClass()" @click="writeHosts">{{ t('vpsmgr.addHosts') }}</button><button data-action="save-add-vps" :class="btnClass()" @click="saveAddVps">{{ t('vpsmgr.save') }}</button><button data-action="init-add-vps" :class="btnClass('primary')" :disabled="!addFormReady()" @click="initAddVps">{{ t('vpsmgr.initialize') }}</button></div></div></article><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.preflight') }}</span></div><div class="p-3.25"><div v-for="(value, key) in addReady" :key="String(key)" class="mb-3 block rounded-[7px] bg-card px-3 py-2.25 whitespace-pre-line" :class="checkStatusClass(value)">{{ key }}: {{ display(value) }}</div><button v-if="addReady.host_key?.needs_confirmation" data-action="accept-add-host-key" :class="btnClass('warn')" @click="acceptAddHostKey">{{ display(addReady.host_key?.fingerprint) }} — {{ t('vpsmgr.trustKeyReconnect') }}</button><pre v-if="publicIp" class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ publicIp }}</pre></div></article></section>

        <section v-else-if="view === 'deploys-vps-logging'" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] max-[900px]:grid-cols-1"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.deploymentsLabel') }}</span></div><div class="p-3.25 grid gap-2.5"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.action') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="deploy-action" :value="deploySettings.action" @change="deploySettings.action = inputValue($event)"><option v-for="item in deployActions" :key="item.command" :value="item.command">{{ item.command_text || actionText(item.command) }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.mode') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="deploy-mode" :value="deploySettings.mode" @change="deploySettings.mode = inputValue($event)"><option v-for="mode in deployModes" :key="mode" :value="mode">{{ mode }}</option></select></label><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" :checked="Boolean(deploySettings.debug)" @change="deploySettings.debug = checkedValue($event)"> {{ t('vpsmgr.debug') }}</label><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" :checked="Boolean(deploySettings.reboot_requested)" @change="deploySettings.reboot_requested = checkedValue($event)"> {{ t('vpsmgr.rebootAfterUpdate') }}</label><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="save-deploy-settings" :class="btnClass()" @click="saveDeploySettings">{{ t('vpsmgr.save') }}</button><button data-action="run-deploy" :class="btnClass('primary')" @click="startDeploy">{{ t('vpsmgr.validateAndStart') }}</button></div></div></article><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.deploymentHistory') }}</span></div><div class="p-3.25"><div v-if="state.deploys?.progress_rows?.length" class="grid gap-1.75"><div v-for="row in state.deploys.progress_rows" :key="`${row.hostname}-${row.command}`" class="grid gap-1.25 rounded-md border border-border-default bg-card p-2.25"><div><strong>{{ display(row.hostname) }}</strong> — {{ display(row.command_text || row.command) }} — {{ display(row.status) }}</div><div class="h-2 overflow-hidden rounded-full bg-border-strong"><div class="h-full bg-accent" :style="{ width: `${Number(row.task_progress?.percent || row.percent || 0)}%` }"></div></div><small class="text-secondary">{{ display(row.task_current_label || row.reason) }}</small></div></div><div v-if="!deployHistory.length" class="p-4.5 text-center text-secondary">{{ t('common.noData') }}</div><table v-else class="manager-table w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.started') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.action') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.hosts') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.status') }}</th></tr></thead><tbody><tr class="cursor-pointer" v-for="entry in deployHistory" :key="entry.id"><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(entry.started_at) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(entry.command_text || entry.command) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top"><div v-for="host in entry.hostnames || []" :key="host" class="my-0.75 flex min-w-[210px] items-center justify-between gap-1.75"><span>{{ host }}</span><button data-action="open-deploy-log" :class="btnClass('small')" :disabled="!deployLogFile(entry, host)" @click="openDeployLog(entry, host)">{{ t('vpsmgr.openLog') }}</button></div></td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(entry.status || entry.result || '—') }}</td></tr></tbody></table></div></article></section>

        <section v-else-if="view === 'settings-vps-logging'" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] max-[900px]:grid-cols-1"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.vpsLogging') }}</span></div><div class="p-3.25 grid gap-2.5"><label class="grid gap-1 text-[0.8rem] text-secondary" v-for="service in vpsLogging" :key="service.service">{{ service.service }} (MB)<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :data-field="`logging-limit-${service.service}`" type="number" :value="service.max_mb" @input="service.max_mb = numberValue($event)"></label><button data-action="save-logging-settings" :class="btnClass('primary')" @click="saveLoggingSettings">{{ t('vpsmgr.save') }}</button><button data-action="deploy-logging" :class="btnClass()" @click="deployLogging">{{ t('vpsmgr.deployLogging') }}</button></div></article><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.vpsDeploySettings') }}</span></div><div class="p-3.25"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(deploySettings) }}</pre></div></article></section>

        <section v-else-if="view.includes('branch')" class="grid gap-3.5"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ currentTarget }} — {{ currentRepo.toUpperCase() }} {{ t('vpsmgr.branch') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="load-remote-branches" :class="btnClass()" @click="loadRemoteBranches">{{ t('vpsmgr.loadRemoteBranches') }}</button><button data-action="load-more-commits" :class="btnClass()" @click="loadMoreCommits">+50</button><button data-action="run-branch-action" :class="btnClass('primary')" @click="runBranchAction">{{ t('vpsmgr.update') }}</button></div></div><div class="p-3.25 grid gap-2.5"><div class="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2"><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ t('vpsmgr.currentBranch') }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]">{{ display(currentBranches.current_branch) }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ t('vpsmgr.currentCommit') }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]">{{ display(currentBranches.current_commit) }}</div></div></div><div class="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5 max-[680px]:grid-cols-1"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.targetBranch') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="branchState.branch || currentBranches.current_branch || 'main'" @change="setBranchField('branch', inputValue($event))"><option v-for="branch in (branchState.remoteBranches?.length ? branchState.remoteBranches : branchOptions(currentBranches))" :key="branch" :value="branch">{{ branch }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="currentRepo !== 'pbgui'">{{ t('vpsmgr.sourceBranch') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="branchState.sourceBranch || branchState.branch || ''" @input="setBranchField('sourceBranch', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.targetCommit') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="branchState.commit || currentBranches.current_commit || ''" @change="setBranchField('commit', inputValue($event))"><option value="">HEAD</option><option v-for="commit in branchCommits({ ...currentBranches, ...branchState }, branchState.sourceBranch || branchState.branch || currentBranches.current_branch || 'main')" :key="commit.full || commit.hash || commit" :value="commit.full || commit.hash || commit">{{ commit.short || commit.hash || commit.full || commit }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary" v-if="currentRepo !== 'pbgui'">{{ t('vpsmgr.remoteName') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="branchState.remoteName || currentBranches.default_remote_name || 'origin'" @change="setBranchRemoteName(inputValue($event))"><option v-for="name in currentBranches.known_remotes || ['origin', 'fork']" :key="name" :value="name">{{ name }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.remoteUrl') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="branchState.remoteUrl || currentBranches.remote_url || ''" @input="setBranchField('remoteUrl', inputValue($event))"></label></div><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="load-remote-commits" :class="btnClass()" @click="loadRemoteCommits">{{ t('vpsmgr.loadRemoteCommits') }}</button><button :class="btnClass()" @click="setBranchField('commit', '')">{{ t('vpsmgr.useHead') }}</button><button v-if="currentRepo !== 'pbgui'" data-action="use-local-branch" :class="btnClass()" @click="useLocalBranchTarget">{{ t('vpsmgr.useLocalBranchTarget') }}</button><button v-if="currentRepo !== 'pbgui'" data-action="use-pinned-upstream" :class="btnClass('warn')" @click="usePinnedUpstream">{{ t('vpsmgr.usePinnedUpstream') }}</button></div><div v-if="branchState.remoteBranches?.length" class="block text-secondary leading-[1.45]">{{ branchState.remoteBranches.join(', ') }}</div><table class="manager-table w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">Hash</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.messageLabel') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.authorLabel') }}</th></tr></thead><tbody><tr class="cursor-pointer" v-for="commit in branchCommits({ ...currentBranches, ...branchState }, branchState.sourceBranch || branchState.branch || currentBranches.current_branch || 'main')" :key="commit.hash || commit"><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(commit.hash || commit) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(commit.subject || commit.message) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(commit.author) }}</td></tr></tbody></table></div></article></section>

        <section v-else-if="view === 'master' || view === 'vps'" class="grid gap-3.5"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ display(detail?.hostname || hostname || config.master_name) }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button v-if="!isMasterContext" data-action="setup-vps" :class="btnClass('warn')" @click="setupVps">{{ t('vpsmgr.setup') }}</button><button v-if="!isMasterContext" data-action="deploy-vps" :class="btnClass('primary')" @click="runDirectDeploy">{{ t('vpsmgr.deploy') }}</button><button v-if="!isMasterContext" data-action="cluster-onboard" :class="btnClass()" @click="startClusterOnboard">{{ t('vpsmgr.addToCluster') }}</button><button v-if="!isMasterContext" data-action="review-host-key" :class="btnClass()" @click="openHostKeyReview">{{ t('vpsmgr.reviewSshHostKey') }}</button><button v-if="!isMasterContext" data-action="delete-vps" :class="btnClass('danger')" @click="requestDelete">{{ t('vpsmgr.deleteVps') }}</button></div></div><div class="p-3.25"><div v-if="!detail" class="p-4.5 text-center text-secondary">{{ t('common.loading') }}</div><template v-else><div class="grid grid-cols-[repeat(auto-fit,minmax(130px,1fr))] gap-2"><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ t('vpsmgr.status') }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]"><span class="inline-block rounded-full px-1.75 py-0.5 text-[0.72rem]" :class="statusClass(detail.status?.online ? 'online' : 'offline')">{{ detail.status?.online ? t('vpsmgr.online') : t('vpsmgr.offline') }}</span></div></div><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ t('vpsmgr.ipLabel') }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]">{{ display(detail.status?.ip || detail.config?.ip) }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">CPU</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]">{{ formatPercent(detail.status?.server_metrics?.cpu?.value || detail.status?.cpu) }}</div></div><div class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ t('vpsmgr.packageStatus') }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]"><button data-action="open-package-updates" data-modal-trigger="package-updates" :class="btnClass('small')" @click="openPackageUpdates">{{ display(detail.status?.package_status?.upgrades || 0) }}</button></div></div></div><div class="flex flex-wrap items-center justify-start gap-1.75 my-3.5 rounded-lg bg-page/72 p-2.5"><button data-action="metric-history" :class="btnClass('small')" @click="loadMetricHistory('cpu')">{{ t('vpsmgr.cpuHistory') }}</button><button v-if="isMasterContext" :class="btnClass()" @click="runMasterCommand('master-update-pbgui')">{{ t('vpsmgr.updatePbgui') }}</button><button v-if="isMasterContext && hasRuntime('pb7')" :class="btnClass()" @click="runMasterCommand('master-update-pb')">{{ t('vpsmgr.updatePbguiAndPb7') }}</button><button v-if="isMasterContext && hasRuntime('pb8')" :class="btnClass()" @click="runMasterCommand('master-update-pbgui-pb8')">{{ t('vpsmgr.updatePbguiAndPb8') }}</button><button v-if="!isMasterContext" data-action="run-vps-command" data-command="vps-update-pbgui-runtime" :class="btnClass()" @click="runVpsCommand('vps-update-pbgui-runtime')">{{ t('vpsmgr.updatePbguiAndRuntime') }}</button><button v-if="!isMasterContext" data-action="run-vps-command" data-command="vps-update-runtime" :class="btnClass()" @click="runVpsCommand('vps-update-runtime')">{{ t('vpsmgr.updateRuntimeByProfile') }}</button><button v-if="!isMasterContext && hasRuntime('pb7')" data-action="run-vps-command" data-command="vps-update-pb7" :class="btnClass()" @click="runVpsCommand('vps-update-pb7')">{{ t('vpsmgr.updatePb7') }}</button><button v-if="!isMasterContext && hasRuntime('pb8')" data-action="run-vps-command" data-command="vps-update-pb8" :class="btnClass()" @click="runVpsCommand('vps-update-pb8')">{{ t('vpsmgr.updatePb8') }}</button><button v-if="isMasterContext" data-action="run-master-update" :class="btnClass()" @click="runMasterUpdate">{{ t('vpsmgr.updateLinux') }}</button><button v-if="isMasterContext" :class="btnClass()" @click="runMasterReboot">{{ t('vpsmgr.reboot') }}</button><button v-if="!isMasterContext" data-action="run-vps-command" data-command="vps-update-linux" :class="btnClass()" @click="runVpsCommand('vps-update-linux')">{{ t('vpsmgr.updateLinux') }}</button><button v-if="!isMasterContext" data-action="run-vps-command" data-command="vps-reboot" :class="btnClass()" @click="runVpsCommand('vps-reboot', false)">{{ t('vpsmgr.reboot') }}</button><button v-if="!isMasterContext" :class="btnClass('danger')" @click="requestPurge">{{ t('vpsmgr.purgeVpsInstall') }}</button><button data-action="open-view" :data-view="isMasterContext ? 'master-ufw' : 'vps-ufw'" :class="btnClass()" @click="openUfw">{{ t('vpsmgr.ufwLabel') }}</button></div><template v-if="!isMasterContext"><h3>{{ t('vpsmgr.configuration') }}</h3><div class="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5 max-[680px]:grid-cols-1"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsIpv4') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-ip" :value="vpsForm.ip" @input="setVpsField('ip', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserName') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-user" :value="vpsForm.user" @input="setVpsField('user', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.installPathLabel') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-install-dir" :value="vpsForm.install_dir" @input="setVpsField('install_dir', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserPassword') }}<input type="password" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-user-password" :value="vpsForm.user_pw || secretFields.user_pw || ''" @input="setVpsField('user_pw', inputValue($event))"><button data-action="reveal-secret" data-field="user_pw" type="button" class="justify-self-start" :class="btnClass('small')" @click="revealSecret('user_pw')">{{ t('vpsmgr.reveal') }}</button></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.swap') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-swap" :value="vpsForm.swap" @input="setVpsField('swap', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.firewallSshPort') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-firewall-port" type="number" :value="vpsForm.firewall_ssh_port" @input="setVpsField('firewall_ssh_port', numberValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.allowedSshIps') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-firewall-ips" :value="vpsForm.firewall_ssh_ips" @input="setVpsField('firewall_ssh_ips', inputValue($event))"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.runtimeProfile') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="vps-runtime-profile" :value="vpsForm.runtime_profile" @change="setVpsField('runtime_profile', inputValue($event))"><option value="pb7">PB7</option><option value="pb8">PB8 Live only</option><option value="pb7_pb8">PB7 + PB8</option></select></label></div><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="save-vps-config" :class="btnClass('primary')" @click="saveVpsConfig">{{ t('vpsmgr.save') }}</button><button data-action="browse-files" :class="btnClass()" @click="browseFiles">{{ t('vpsmgr.browse') }}</button><button data-action="open-view" data-view="vps-setup" :class="btnClass()" @click="openView('vps-setup')">{{ t('vpsmgr.setup') }}</button></div></template><h3>{{ t('vpsmgr.instances') }}</h3><div class="overflow-auto"><table class="manager-table w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.bot') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.status') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">CPU</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">RAM</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">PNL</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.errors') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.tracebacks') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.action') }}</th></tr></thead><tbody><tr class="cursor-pointer" v-for="item in monitorItems" :key="`${item.pb_version || '7'}-${item.name}`"><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(item.name) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(item.status || (item.running ? 'running' : 'stopped')) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ formatPercent(item.cpu) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ formatBytes(item.memory_mb * 1024 * 1024) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(item.pnl_today) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(item.errors_today) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(item.tracebacks_today) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top"><button :class="btnClass('small')" :data-action="'bot-metric'" :data-bot="historyBotName(item)" @click="openBotMetric(item)">{{ t('vpsmgr.history') }}</button><button class="ml-1" :class="btnClass('small')" :data-action="'bot-log-matches'" :data-kind="'tracebacks'" :data-bot="item.name" @click="openBotLogMatches(item, 'tracebacks')">{{ t('vpsmgr.tracebacks') }}</button><button class="ml-1" :class="btnClass('small')" :data-action="'bot-log-matches'" :data-kind="'errors'" :data-bot="item.name" @click="openBotLogMatches(item, 'errors')">{{ t('vpsmgr.errors') }}</button></td></tr></tbody></table></div><h3>{{ t('vpsmgr.log') }}</h3><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary min-h-[220px] max-h-[56vh]">{{ detail.log_preview?.content || t('vpsmgr.noLogFileFound') }}</pre></template></div></article></section>

        <section v-else-if="view === 'vps-setup'" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] max-[900px]:grid-cols-1"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ hostname }} — {{ t('vpsmgr.setup') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="read-vps-settings" :class="btnClass()" @click="readVpsSettings">{{ t('vpsmgr.readVpsSettings') }}</button><button data-action="preview-systemd-migration" :class="btnClass()" @click="send({ cmd: 'preview_vps_systemd_migration', hostname, form: { ...vpsForm } })">{{ t('vpsmgr.systemdMigration') }}</button><button data-action="open-package-updates" :class="btnClass()" @click="openPackageUpdates">{{ t('vpsmgr.packageUpdatesLabel') }}</button></div></div><div class="p-3.25 grid gap-2.5"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(detail?.progress || {}) }}</pre><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="setup-vps" :class="btnClass('warn')" @click="setupVps">{{ t('vpsmgr.setup') }}</button><button data-action="save-vps-config" :class="btnClass('primary')" @click="saveVpsConfig">{{ t('vpsmgr.save') }}</button><button data-action="cluster-onboard" :class="btnClass()" @click="startClusterOnboard">{{ t('vpsmgr.addToCluster') }}</button></div></div></article><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.preflight') }}</span></div><div class="p-3.25"><div v-for="(value, key) in detail?.status?.systemd_migration || {}" :key="String(key)" class="rounded-md bg-card p-2.25"><div class="text-[0.75rem] text-secondary">{{ key }}</div><div class="mt-0.75 text-[1.08rem] font-bold [overflow-wrap:anywhere]">{{ display(value) }}</div></div></div></article></section>

        <section v-else-if="view === 'vps-task-log' || view === 'master-task-log'" class="grid gap-3.5"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.taskLogLabel') }}</span><button :class="btnClass()" @click="setContext(isMasterContext ? 'master' : 'vps', hostname)">{{ t('vpsmgr.backToHost') }}</button></div><div class="p-3.25"><div id="vps-manager-log-viewer" class="min-h-[360px] overflow-hidden rounded-md border border-border-default bg-page"></div><pre v-if="!sharedLogViewer" class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary min-h-[220px] max-h-[56vh]">{{ detail?.progress?.update_log || detail?.progress?.setup_log || detail?.progress?.init_log || detail?.progress?.log || t('vpsmgr.noLogFileFound') }}</pre></div></article></section>

        <section v-else-if="view === 'vps-host-logs' || view === 'master-host-logs'" class="grid gap-3.5"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ t('vpsmgr.hostLogs') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button v-if="!isMasterContext" data-action="fetch-host-log" :class="btnClass('primary')" @click="fetchHostLog">{{ logLoading ? t('vpsmgr.loading') : t('vpsmgr.load') }}</button><button data-action="browse-files" :class="btnClass()" @click="browseFiles">{{ t('vpsmgr.browse') }}</button><button data-action="open-package-updates" :class="btnClass()" @click="openPackageUpdates">{{ t('vpsmgr.packageUpdatesLabel') }}</button><button v-if="!isMasterContext" data-action="cluster-onboard" :class="btnClass()" @click="startClusterOnboard">{{ t('vpsmgr.addToCluster') }}</button></div></div><div class="p-3.25 grid gap-2.5"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.logFile') }}<select class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" :value="logFilename" @change="selectLogFile(inputValue($event))"><option v-for="file in detail?.logfiles || []" :key="file" :value="file">{{ file }}</option></select></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.sizeKb') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" type="number" v-model.number="logSizeKb"></label><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" v-model="logReverse"> {{ t('vpsmgr.reverseLog') }}</label><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" v-model="logDebug"> {{ t('vpsmgr.debug') }}</label><div id="vps-manager-log-viewer" class="min-h-[360px] overflow-hidden rounded-md border border-border-default bg-page"></div><pre v-if="!sharedLogViewer" class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary min-h-[220px] max-h-[56vh]">{{ logContent || t('vpsmgr.noLogFileFound') }}</pre></div></article></section>

        <section v-else-if="view === 'vps-ufw' || view === 'master-ufw'" class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] max-[900px]:grid-cols-1"><article class="mb-3.5 min-w-0 overflow-hidden rounded-[9px] border border-border-default bg-panel"><div class="flex items-center justify-between gap-2.5 border-b border-border-default bg-panel/46 px-3.25 py-2.75"><span class="font-bold">{{ currentUfwHost }} — {{ t('vpsmgr.ufwLabel') }}</span><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="ufw-read" :class="btnClass()" @click="readUfw">{{ t('vpsmgr.load') }}</button><button data-action="ufw-preview" :class="btnClass()" @click="previewUfw">{{ t('vpsmgr.preview') }}</button><button data-action="ufw-apply" :class="btnClass('primary')" @click="applyUfw">{{ t('vpsmgr.applyChanges') }}</button></div></div><div class="p-3.25 grid gap-2.5"><label class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" v-model="ufw.enabled"> {{ t('vpsmgr.enabled') }}</label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.sudoPassword') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="ufw-sudo-password" type="password" v-model="ufw.sudoPw"></label><div class="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-2.5 max-[680px]:grid-cols-1"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.port') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="ufw-port" v-model="ufw.form.port"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.from') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="ufw-from" v-model="ufw.form.from"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.comment') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="ufw-comment" v-model="ufw.form.comment"></label></div><button data-action="ufw-add-rule" :class="btnClass()" @click="addUfwRule">{{ t('vpsmgr.addRule') }}</button><table class="manager-table w-full border-collapse text-[0.78rem]"><thead><tr><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.delete') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">#</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.action') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.to') }}</th><th class="sticky top-0 z-[1] border-b-2 border-border-default bg-card px-1.75 py-2 text-left align-top text-primary whitespace-nowrap cursor-default">{{ t('vpsmgr.from') }}</th></tr></thead><tbody><tr class="cursor-pointer" v-for="rule in ufw.rules" :key="rule.number"><td class="border-b border-border-default px-1.75 py-2 text-left align-top"><input type="checkbox" :checked="ufw.deleteNumbers.includes(rule.number)" @change="toggleUfwDelete(Number(rule.number))"></td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.number) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.action) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.to || rule.port) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.from) }}</td></tr><tr class="cursor-pointer" v-for="(rule, index) in ufw.addRules" :key="`add-${index}`"><td class="border-b border-border-default px-1.75 py-2 text-left align-top">+</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">—</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.action) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.port) }}</td><td class="border-b border-border-default px-1.75 py-2 text-left align-top">{{ display(rule.from) }}</td></tr></tbody></table></div></article></section>
      </section>
    </div>

    <div v-if="modal" class="fixed inset-0 z-[1000] flex items-center justify-center bg-backdrop p-5" :data-modal="modal" role="dialog" aria-modal="true" @click.stop>
      <div class="w-[min(780px,calc(100vw-40px))] max-h-[calc(100dvh-40px)] overflow-auto rounded-lg border border-border-default bg-panel p-4.5 shadow-[0_24px_70px_rgba(5,8,14,0.5)]">
        <div class="mb-3.5 flex items-center justify-between gap-2.5 border-b border-border-default pb-2.5"><h2 class="m-0 text-[1.05rem]">{{ modalTitle }}</h2><button :data-close="modal || 'modal'" :class="btnClass()" @click="closeModal"><PbIcon :icon="PhX" /> {{ t('vpsmgr.close') }}</button></div>
        <template v-if="modal === 'confirm'"><!-- manager-btn danger: inert anchor kept for the parity-test selector --><p>{{ display(modalData.message) }}</p><div class="mt-3.75 flex justify-end gap-1.75"><button :class="btnClass()" @click="closeModal">{{ t('vpsmgr.cancel') }}</button><button class="manager-btn danger" :class="btnClass('danger')" @click="acceptConfirm">{{ t('vpsmgr.confirm') }}</button></div></template>
        <template v-else-if="modal === 'password' || modal === 'deploy-password'"><label>{{ t('vpsmgr.password') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="deploy-password" type="password" v-model="modalData.password"></label><div class="mt-3.75 flex justify-end gap-1.75"><button :class="btnClass()" @click="closeModal">{{ t('vpsmgr.cancel') }}</button><div data-action="stage-deploy-host" @click="executePasswordModal"><button data-action="password-confirm" :class="btnClass('primary')" @click.stop="executePasswordModal">{{ t('vpsmgr.confirm') }}</button></div></div></template>
        <template v-else-if="modal === 'host-key'"><p>{{ display(modalData.error || t('vpsmgr.unknownSshHostKey')) }}</p><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText({ status: modalData.status, key_type: modalData.key_type, fingerprint: modalData.fingerprint, ssh_host: modalData.ssh_host, ip: modalData.ip }) }}</pre><div class="mt-3.75 flex justify-end gap-1.75"><button data-action="trust-host-key" :class="btnClass('primary')" @click="trustHostKey">{{ t('vpsmgr.trustKeyReconnect') }}</button></div></template>
        <template v-else-if="modal === 'package-updates'"><p>{{ display(modalData.row?.hostname) }}</p><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.row?.package_status || {}) }}</pre><ul><li v-for="item in modalData.packages || []" :key="item">{{ item }}</li></ul></template>
        <template v-else-if="modal === 'ufw-preview'"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.preview || modalData) }}</pre><div class="mt-3.75 flex justify-end gap-1.75"><button data-action="ufw-apply-confirm" :class="btnClass('primary')" @click="closeModal(); setModal('confirm', { title: t('vpsmgr.applyUfwChangesTitle'), message: t('vpsmgr.applyUfwChanges'), action: 'apply-ufw' })">{{ t('vpsmgr.applyChanges') }}</button></div></template>
        <template v-else-if="modal === 'existing-import'"><div class="grid gap-2.5"><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.hostname') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="existing-import-hostname" v-model="existingImport.hostname"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsIpv4') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" data-field="existing-import-ip" :value="existingImport.ip" @input="existingImport.ip = inputValue($event)"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserName') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" v-model="existingImport.user"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.vpsUserPassword') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" type="password" v-model="existingImport.user_pw"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.installPathLabel') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" v-model="existingImport.install_dir"></label><label class="grid gap-1 text-[0.8rem] text-secondary">{{ t('vpsmgr.sudoPassword') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" type="password" v-model="existingImport.local_sudo_pw"></label><div class="flex flex-wrap items-center justify-end gap-1.75 max-[680px]:justify-start"><button data-action="resolve-existing-import" :class="btnClass()" @click="resolveExistingImport">{{ t('vpsmgr.resolveHost') }}</button><button data-action="probe-existing-import" :class="btnClass()" @click="probeExistingImport">{{ t('vpsmgr.probe') }}</button><button data-action="save-existing-import" :class="btnClass('primary')" @click="saveExistingImport">{{ t('vpsmgr.save') }}</button></div><div v-if="modalData.probe" class="manager-import-report"><div v-for="check in modalData.probe.checks || []" :key="check.label" class="mb-3 block rounded-[7px] bg-card px-3 py-2.25 whitespace-pre-line" :class="checkStatusClass(check.ok)">{{ check.label }}: {{ display(check.detail || check.ok) }}</div><div v-for="item in modalData.probe.blockers || []" :key="`blocker-${item}`" class="mb-3 block rounded-[7px] bg-card px-3 py-2.25 whitespace-pre-line border border-danger/30 text-danger-soft">{{ item }}</div><div v-for="item in modalData.probe.warnings || []" :key="`warning-${item}`" class="mb-3 block rounded-[7px] bg-card px-3 py-2.25 whitespace-pre-line">{{ item }}</div><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.probe) }}</pre></div><button v-if="modalData.probe?.needs_host_key_confirmation || ['unknown', 'mismatch'].includes(String(modalData.probe?.host_key?.status || ''))" data-action="accept-existing-host-key" :class="btnClass('warn')" @click="acceptExistingHostKey">{{ t('vpsmgr.trustKeyReconnect') }}</button></div></template>
        <template v-else-if="modal === 'cluster-import'"><div v-if="modalData.loading" class="p-4.5 text-center text-secondary">{{ t('vpsmgr.loading') }}</div><template v-else-if="modalData.progress"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.progress) }}</pre></template><template v-else><label>{{ t('vpsmgr.sudoPassword') }}<input class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" type="password" v-model="clusterImport.local_sudo_pw"></label><div v-for="item in clusterImport.preview?.items || []" :key="item.hostname" class="my-2 grid grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)] items-center gap-2.5 max-[680px]:grid-cols-1"><label class="flex items-center gap-1.75 text-primary"><input type="checkbox" v-model="clusterImport.selected[item.hostname]"> {{ item.hostname }} — {{ item.action }}</label><input v-if="item.action === 'add' || item.action === 'update'" class="w-full min-h-[33px] rounded-[5px] border border-border-strong bg-panel px-2 py-1.5 text-primary focus:border-accent/62 focus:outline-2 focus:outline-accent/22" type="password" :placeholder="t('vpsmgr.vpsUserPassword')" v-model="clusterImport.passwords[item.hostname]"></div><div class="mt-3.75 flex justify-end gap-1.75"><button data-action="apply-cluster-import" :class="btnClass('primary')" @click="applyClusterImport">{{ t('vpsmgr.applyChanges') }}</button></div></template></template>
        <template v-else-if="modal === 'cluster-onboard'"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.progress || clusterOnboard.job || {}) }}</pre></template>
        <template v-else-if="modal === 'history'"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(metric.data || modalData.data || {}) }}</pre></template>
        <template v-else-if="modal === 'bot-log'"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary min-h-[220px] max-h-[56vh]">{{ (botLog.lines || []).join('\n') }}</pre></template>
        <template v-else-if="modal === 'systemd'"><pre class="m-0 overflow-auto whitespace-pre-wrap break-words rounded-[5px] bg-page p-2.5 font-mono text-[0.75rem] leading-[1.4] text-primary">{{ jsonText(modalData.data || {}) }}</pre><div class="mt-3.75 flex justify-end gap-1.75"><button :class="btnClass('primary')" @click="closeModal(); setModal('confirm', { title: t('vpsmgr.systemdMigration'), message: t('vpsmgr.applyChanges'), action: 'systemd' })">{{ t('vpsmgr.applyChanges') }}</button></div></template>
        <template v-else-if="modal === 'files'"><div v-if="modalData.columns" class="grid gap-2.5"><label v-for="(_, key) in visibleColumns" :key="key" class="flex items-center gap-1.75 text-[0.8rem] text-primary"><input type="checkbox" :checked="visibleColumns[key]" @change="toggleColumn(String(key))"> {{ key }}</label></div><div v-else class="grid gap-1.75"><button v-if="modalData.data?.parent" :class="btnClass()" @click="browsePath(modalData.data.parent)">..</button><button v-for="entry in modalData.data?.entries || []" :key="entry.name" :class="btnClass('file')" @click="selectBrowsedPath(`${modalData.data.cwd}/${entry.name}`, entry.type)"><PbIcon :icon="entry.type === 'dir' ? PhFolder : PhFile" /> {{ entry.name }}</button></div></template>
      </div>
    </div>
  </div>
  </AppShell>
</template>

<style scoped>
/* Page-level AppShell overrides + table row interactions — ported from
   styles/vps-manager.css at the Tailwind migration. The :deep() rules
   target AppShell internals, so they stay as CSS instead of utilities.
   The .manager-table rules paint td cells from the row's hover/selected
   state — a descendant relationship utilities cannot express; keep the
   declaration order so hover still outranks .selected as before.
   'manager-table' / 'selected' remain as inert anchors. */
.operations-shell--vps-manager :deep(.app-shell__workspace) {
  display: flex;
  height: 100dvh;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.operations-shell--vps-manager :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  flex: 1;
  padding: 0;
}

.operations-shell--vps-manager :deep(.app-shell__primary) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}

.manager-table tbody tr:hover td {
  background: rgb(var(--text-secondary-rgb) / 0.05);
}

.manager-table tr.selected td {
  background: rgb(var(--accent-rgb) / 0.12);
}

.manager-table tr.selected td:first-child {
  border-left: 3px solid var(--accent-soft);
}
</style>
