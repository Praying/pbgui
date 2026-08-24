<script setup lang="ts">
/**
 * Floating passivbot log panel — v7_edit.html:1142-1150 markup + openLogPanel
 * (:3291-3376): hosts the global LogViewerPanel (log_viewer_panel.js, kept
 * global per the recon matrix) pinned to this instance's Bot service, with
 * the v7 last-active-host lookup / v8 master-name resolution and the local
 * file filter (isLocalBotLogFile :3306-3315).
 */
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import { useEditPageContext } from '../composables/useEditPage';

interface LogViewer {
  open(): void;
  close(): void;
}

type LogViewerCtor = new (options: Record<string, unknown>) => LogViewer;

const { t } = useI18n();
const page = useEditPageContext();
const props = defineProps<{ masterName?: string }>();

let cachedMaster = '';
/** MASTER_NAME replacement — /api/server-status carries master_name. */
async function masterName(): Promise<string> {
  if (cachedMaster || !page.isV8) return cachedMaster;
  try {
    const resp = await fetch(getBoot().origin + '/api/server-status', {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = (await resp.json()) as { master_name?: string };
    cachedMaster = String(data.master_name ?? '');
  } catch {
    cachedMaster = '';
  }
  return cachedMaster;
}

const open = defineModel<boolean>({ required: true });
const hostBadge = ref('');
const hostClass = ref('');
const viewer = ref<LogViewer | null>(null);
let disposed = false;

const runtimeNumber = page.isV8 ? '8' : '7';
const svc = 'Bot:' + page.instanceName.value + ':' + runtimeNumber;

function wsBase(): string {
  const origin = getBoot().origin || window.location.origin;
  return origin.replace('http://', 'ws://').replace('https://', 'wss://');
}

function isLocalBotLogFile(file: string): boolean {
  const value = String(file || '');
  if (!value) return false;
  if (value === 'PBRun.log') return true;
  if (value === 'Bot:' + page.instanceName.value || value === svc) return true;
  if (value === 'BotErr:' + page.instanceName.value || value === 'BotErr:' + page.instanceName.value + ':' + runtimeNumber) return true;
  if (value === 'data/run_v' + runtimeNumber + '/' + page.instanceName.value + '/passivbot_err.log') return true;
  if (value === 'data/run_v' + runtimeNumber + '/' + page.instanceName.value + '/passivbot_err.log.old') return true;
  return value.indexOf(page.isV8 ? 'pb8/logs/' : 'pb7/logs/') === 0 && value.indexOf(page.instanceName.value) >= 0;
}

/** Host badge state → full utility colour set (the former
 *  #log-panel-host.connected/.disabled rules; 'disabled' is the neutral
 *  default while the host is being resolved). */
function logHostClass(state: string): string {
  if (state === 'connected') return 'border-success text-success';
  if (state === 'disabled') return 'border-warning text-warning';
  return 'border-border-default text-secondary';
}

function initViewer(host: string): void {
  viewer.value?.close();
  const Ctor = (window as Window & { LogViewerPanel?: LogViewerCtor }).LogViewerPanel;
  if (!Ctor) return;
  const isLocal = !host || host === 'local';
  viewer.value = new Ctor({
    containerId: 'log-viewer-target',
    wsBase: wsBase(),
    defaultHost: isLocal ? 'local' : host,
    defaultService: isLocal ? 'PBRun' : svc,
    defaultFile: isLocal ? svc : '',
    localFileFilter: isLocal ? isLocalBotLogFile : null,
    presets: 'trading',
    showRestart: true,
    height: '100%',
  });
  viewer.value.open();
}

async function resolveHost(): Promise<void> {
  const enabledOn = page.state.enabledOn || 'disabled';
  hostBadge.value = t('v7run.searching');
  hostClass.value = 'disabled';
  if (page.isV8) {
    const master = props.masterName ?? (await masterName());
    const isCurrentLocal = !!master && enabledOn === master;
    hostBadge.value = enabledOn === 'disabled' ? 'local' : enabledOn;
    hostClass.value = isCurrentLocal || enabledOn === 'disabled' ? 'disabled' : 'connected';
    initViewer(isCurrentLocal || enabledOn === 'disabled' ? 'local' : enabledOn);
    return;
  }
  try {
    const resp = await fetch(page.apiBaseOf() + '/last-active-host/' + encodeURIComponent(page.instanceName.value), {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = (await resp.json()) as { host?: string; master?: string; version?: string };
    const masterHost = data.master ?? '';
    if (enabledOn && enabledOn !== 'disabled') {
      const isCurrentLocal = !!masterHost && enabledOn === masterHost;
      hostBadge.value = enabledOn;
      hostClass.value = isCurrentLocal ? 'disabled' : 'connected';
      initViewer(isCurrentLocal ? 'local' : enabledOn);
      return;
    }
    if (!data.host) {
      hostBadge.value = 'local';
      hostClass.value = 'disabled';
      initViewer('local');
      return;
    }
    const isLocal = data.host === masterHost;
    hostBadge.value = data.host + ' (v' + (data.version || '?') + ')';
    hostClass.value = isLocal ? 'disabled' : 'connected';
    initViewer(isLocal ? 'local' : data.host);
  } catch {
    if (enabledOn && enabledOn !== 'disabled') {
      hostBadge.value = enabledOn;
      hostClass.value = 'connected';
      initViewer(enabledOn);
      return;
    }
    hostBadge.value = 'local';
    hostClass.value = 'disabled';
    initViewer('local');
  }
}

watch(
  () => open.value,
  (isOpen) => {
    if (isOpen && !disposed) void resolveHost();
    if (!isOpen) viewer.value?.close();
  }
);

onBeforeUnmount(() => {
  disposed = true;
  viewer.value?.close();
  viewer.value = null;
});
</script>

<template>
  <div
    id="log-panel"
    class="fixed top-[52px] right-0 bottom-0 z-[150] w-[min(560px,92vw)] flex-col overflow-hidden border-l border-border-default bg-panel shadow-[-6px_0_24px_rgba(5,8,14,0.5)]"
    :class="open ? 'flex' : 'hidden'"
  >
    <div id="log-panel-header" class="flex shrink-0 items-center gap-2 border-b border-border-default bg-elevated px-3 py-2">
      <span id="log-panel-title" class="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold">&#x1F4CB; {{ t('v7run.passivbotLog') }}</span>
      <span
        id="log-panel-host"
        class="max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap rounded-[3px] border bg-page px-1.5 py-px text-xs"
        :class="logHostClass(hostClass)"
      >{{ hostBadge }}</span>
      <button class="cursor-pointer rounded-sm border-0 bg-transparent px-1.5 py-0.5 text-md leading-none text-secondary hover:bg-white/6 hover:text-primary" :title="t('common.close')" @click="open = false">&#x00D7;</button>
    </div>
    <div id="log-viewer-target" style="flex: 1; overflow: hidden; min-height: 0"></div>
  </div>
</template>
