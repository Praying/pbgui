<script setup lang="ts">
/**
 * The floating archive sync log panel (:9633-9639, DOM :951-965) —
 * hosts the global LogViewerPanel (log_viewer_panel.js, kept global
 * per the recon matrix) pinned to the local ArchiveSync.log, the
 * v7_edit LogPanel precedent: header + target container only.
 */
import { PhClipboardText, PhX } from '@phosphor-icons/vue';
import { onBeforeUnmount, ref, watch } from 'vue';
import PbIcon from '@/shared/components/PbIcon.vue';

interface LogViewer {
  open(): void;
  close(): void;
}

type LogViewerCtor = new (options: Record<string, unknown>) => LogViewer;

withDefaults(defineProps<{ title?: string }>(), { title: 'Archive Sync Log' });

const open = ref(false);
const viewer = ref<LogViewer | null>(null);
let disposed = false;

function wsBase(): string {
  const boot = (globalThis as { __BOOT__?: { origin?: string } }).__BOOT__;
  const origin = boot?.origin || window.location.origin;
  return origin.replace('http://', 'ws://').replace('https://', 'wss://');
}

function token(): string {
  return (globalThis as { __BOOT__?: { token?: string } }).__BOOT__?.token ?? '';
}

function initViewer(): void {
  viewer.value?.close();
  const Ctor = (window as Window & { LogViewerPanel?: LogViewerCtor }).LogViewerPanel;
  if (!Ctor) return;
  viewer.value = new Ctor({
    containerId: 'log-viewer-target',
    wsBase: wsBase(),
    token: token(),
    defaultHost: 'local',
    defaultFile: 'ArchiveSync.log',
    presets: 'system',
    showRestart: false,
    height: '100%',
  });
  viewer.value.open();
}

function openPanel(): void {
  open.value = true;
}

watch(
  open,
  (isOpen) => {
    if (isOpen && !disposed) initViewer();
    if (!isOpen) viewer.value?.close();
  }
);

onBeforeUnmount(() => {
  disposed = true;
  viewer.value?.close();
  viewer.value = null;
});

defineExpose({ open: openPanel });
</script>

<template>
  <div
    id="log-panel"
    class="fixed bottom-0 right-0 z-[500] min-h-[150px] w-1/2 min-w-[240px] flex-col overflow-hidden rounded-t-md border-2 border-accent bg-panel h-[40vh] max-[760px]:w-full"
    :class="open ? 'visible flex' : 'hidden'"
  >
    <div id="log-panel-header" class="flex shrink-0 items-center justify-between border-b border-border-default bg-elevated px-3 py-2">
      <span id="log-panel-title" class="text-sm font-semibold"><PbIcon :icon="PhClipboardText" /> {{ title }}</span>
      <button id="log-panel-close" class="cursor-pointer border-0 bg-transparent text-lg text-secondary hover:text-primary" title="Close" aria-label="Close" @click="open = false"><PbIcon :icon="PhX" :size="18" /></button>
    </div>
    <div id="log-viewer-target" style="flex: 1; min-height: 0; overflow: hidden"></div>
  </div>
</template>
