<script setup lang="ts">
/*
 * The floating DB Tools log panel (:268-282 markup, :747-871 logic): hosts
 * the legacy LogViewerPanel global (log_viewer_panel.js, same as market_data
 * loads it) pinned to a sync-job log file, with header drag and 8-way resize
 * — ported 1:1 from bindDbToolsLogPanelDragResize.
 */
import { onBeforeUnmount, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getBoot } from '@/shared/boot';
import { wsBase } from '../config';

declare global {
  interface Window {
    LogViewerPanel?: new (options: Record<string, unknown>) => {
      open(): void;
      close(): void;
      setHost(host: string): void;
      setFile(file: string): void;
    };
  }
}

const props = defineProps<{
  visible: boolean;
  title: string;
  logFile: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const { t } = useI18n();

const panelEl = useTemplateRef<HTMLElement>('panel');
const headerEl = useTemplateRef<HTMLElement>('header');

let viewer: InstanceType<NonNullable<typeof window.LogViewerPanel>> | null = null;

function ensureViewer() {
  if (viewer || typeof window.LogViewerPanel !== 'function') return null;
  viewer = new window.LogViewerPanel({
    containerId: 'dbtools-log-viewer-target',
    wsBase: wsBase(),
    token: getBoot().token,
    defaultHost: 'local',
    defaultFile: '',
    presets: 'system',
    showRestart: false,
    height: '100%',
    startLocalAtEnd: false,
  }); // :750-760
  return viewer;
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      viewer?.close();
      return;
    }
    viewer?.close();
    viewer = null;
    const next = ensureViewer();
    if (next) {
      next.open();
      next.setHost('local');
      next.setFile(props.logFile);
    }
    const panel = panelEl.value;
    if (panel && !panel.style.left) {
      panel.style.right = '0';
      panel.style.bottom = '0';
      panel.style.left = '';
      panel.style.top = '';
    }
  }
);

onBeforeUnmount(() => viewer?.close());

/* ── header drag (:800-822) ── */

function onHeaderMousedown(event: MouseEvent): void {
  const panel = panelEl.value;
  if (!panel || event.button !== 0) return;
  if (event.target === headerEl.value?.querySelector('#dbtools-log-panel-close')) return;
  const rect = panel.getBoundingClientRect();
  panel.style.left = rect.left + 'px';
  panel.style.top = rect.top + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  const startX = event.clientX;
  const startY = event.clientY;
  const startL = rect.left;
  const startT = rect.top;

  function onMove(moveEvent: MouseEvent): void {
    panel!.style.left = startL + moveEvent.clientX - startX + 'px';
    panel!.style.top = startT + moveEvent.clientY - startY + 'px';
  }

  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  event.preventDefault();
}

/* ── 8-way resize (:824-870) ── */

function onResizeMousedown(event: MouseEvent, dir: string): void {
  const panel = panelEl.value;
  if (!panel || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = panel.getBoundingClientRect();
  panel.style.left = rect.left + 'px';
  panel.style.top = rect.top + 'px';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.width = rect.width + 'px';
  panel.style.height = rect.height + 'px';
  const startX = event.clientX;
  const startY = event.clientY;
  const startL = rect.left;
  const startT = rect.top;
  const startW = rect.width;
  const startH = rect.height;

  function onMove(moveEvent: MouseEvent): void {
    const dx = moveEvent.clientX - startX;
    const dy = moveEvent.clientY - startY;
    let nextL = startL;
    let nextT = startT;
    let nextW = startW;
    let nextH = startH;
    if (dir.indexOf('w') >= 0) {
      nextL = startL + dx;
      nextW = startW - dx;
    }
    if (dir.indexOf('e') >= 0) nextW = startW + dx;
    if (dir.indexOf('n') >= 0) {
      nextT = startT + dy;
      nextH = startH - dy;
    }
    if (dir.indexOf('s') >= 0) nextH = startH + dy;
    if (nextW < 360) {
      if (dir.indexOf('w') >= 0) nextL = startL + startW - 360;
      nextW = 360;
    }
    if (nextH < 260) {
      if (dir.indexOf('n') >= 0) nextT = startT + startH - 260;
      nextH = 260;
    }
    panel!.style.left = nextL + 'px';
    panel!.style.top = nextT + 'px';
    panel!.style.width = nextW + 'px';
    panel!.style.height = nextH + 'px';
  }

  function onUp(): void {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<template>
  <div
    ref="panel"
    id="dbtools-log-panel"
    :class="{ visible: visible }"
  >
    <div class="lp-resize lp-resize-n" data-dir="n" @mousedown="onResizeMousedown($event, 'n')"></div>
    <div class="lp-resize lp-resize-s" data-dir="s" @mousedown="onResizeMousedown($event, 's')"></div>
    <div class="lp-resize lp-resize-w" data-dir="w" @mousedown="onResizeMousedown($event, 'w')"></div>
    <div class="lp-resize lp-resize-e" data-dir="e" @mousedown="onResizeMousedown($event, 'e')"></div>
    <div class="lp-resize lp-resize-nw" data-dir="nw" @mousedown="onResizeMousedown($event, 'nw')"></div>
    <div class="lp-resize lp-resize-ne" data-dir="ne" @mousedown="onResizeMousedown($event, 'ne')"></div>
    <div class="lp-resize lp-resize-sw" data-dir="sw" @mousedown="onResizeMousedown($event, 'sw')"></div>
    <div class="lp-resize lp-resize-se" data-dir="se" @mousedown="onResizeMousedown($event, 'se')"></div>
    <div ref="header" id="dbtools-log-panel-header" @mousedown="onHeaderMousedown">
      <span id="dbtools-log-panel-title">{{ title || t('misc.dbtools.dbToolsLog') }}</span>
      <button id="dbtools-log-panel-close" :title="t('common.close')" @click="emit('close')">✕</button>
    </div>
    <div id="dbtools-log-viewer-target"></div>
  </div>
</template>
