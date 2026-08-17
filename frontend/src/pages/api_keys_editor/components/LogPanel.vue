<script setup lang="ts">
/*
 * Logs panel (:1033-1039 markup, :3422-3464): hosts the legacy
 * LogViewerPanel global (log_viewer_panel.js — shared with market_data and
 * db_tools, kept as a global) pinned to ApiKeys.log. The viewer is created
 * once and closed whenever the panel is left (legacy _closeLogWs).
 */
import { onBeforeUnmount, watch } from 'vue';
import BackButton from './BackButton.vue';
import { bootToken, wsBase } from '../config';

type LogViewer = { open(): void; close(): void };

const props = defineProps<{ visible: boolean }>();

const emit = defineEmits<{ (e: 'back'): void }>();

let viewer: LogViewer | null = null;

function ensureViewer(): LogViewer | null {
  if (viewer) return viewer;
  const Ctor = (window as Window & { LogViewerPanel?: new (o: Record<string, unknown>) => LogViewer }).LogViewerPanel;
  if (typeof Ctor !== 'function') return null;
  viewer = new Ctor({
    containerId: 'logViewerTarget',
    wsBase: wsBase(),
    token: bootToken(),
    defaultFile: 'ApiKeys.log',
    height: 'calc(100vh - 300px)',
  });
  return viewer;
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) ensureViewer()?.open();
    else viewer?.close();
  },
  { immediate: true }
);

onBeforeUnmount(() => viewer?.close());
</script>

<template>
  <div id="logPanel" class="hl-expiry-panel" v-show="visible" style="flex-direction:column; padding:0; gap:0; height:calc(100vh - 120px);">
    <div style="display:flex; align-items:center; gap:10px; padding:8px 16px; border-bottom:1px solid #1e293b; flex-shrink:0;">
      <BackButton @back="emit('back')" />
    </div>
    <div id="logViewerTarget" style="padding:10px 16px 16px; display:flex; flex-direction:column; flex:1; min-height:0;"></div>
  </div>
</template>
