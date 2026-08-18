<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue';
import { getBoot } from '@/shared/boot';
import type { OptimizeAdapter } from '../config';
interface Viewer { open(): void; close(): void; setHost?(host: string): void; setFile?(file: string): void }
type ViewerCtor = new (options: Record<string, unknown>) => Viewer;
const props = defineProps<{ open: boolean; filename: string; title: string; adapter: OptimizeAdapter }>();
const emit = defineEmits<{ close: [] }>();
let viewer: Viewer | null = null;
function wsBase(): string { return getBoot().origin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:'); }
function show(): void {
  viewer?.close();
  const Ctor = (window as Window & { LogViewerPanel?: ViewerCtor }).LogViewerPanel;
  if (!Ctor || !props.filename) return;
  viewer = new Ctor({ containerId: 'optimize-log-viewer-target', wsBase: wsBase(), defaultHost: 'local', defaultFile: props.adapter.queueLogPrefix + props.filename + '.log', presets: 'system', showRestart: false, height: '100%', startLocalAtEnd: false });
  viewer.open();
}
watch(() => [props.open, props.filename] as const, ([open]) => { if (open) show(); else viewer?.close(); });
onBeforeUnmount(() => viewer?.close());
</script>
<template><aside v-if="open" class="opt-log-panel"><header><strong>{{ title }}</strong><button class="opt-btn" @click="emit('close')">✕</button></header><div id="optimize-log-viewer-target"></div></aside></template>
