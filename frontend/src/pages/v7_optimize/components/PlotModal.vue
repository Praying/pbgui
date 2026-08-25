<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import type { PlotState } from '../composables/useOptimizeActions';

defineProps<{ plot: PlotState }>();
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const modal = ref<HTMLElement | null>(null);
const maximized = ref(false);
let drag: { x: number; y: number; left: number; top: number } | null = null;
let resize: { dir: string; x: number; y: number; left: number; top: number; width: number; height: number } | null = null;

function viewportWidth(): number { return window.innerWidth || document.documentElement.clientWidth; }
function viewportHeight(): number { return window.innerHeight || document.documentElement.clientHeight; }
function beginDrag(event: MouseEvent): void {
  if (maximized.value || (event.target as HTMLElement | null)?.closest('button')) return;
  const node = modal.value;
  if (!node) return;
  const rect = node.getBoundingClientRect();
  drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
  event.preventDefault();
  setFramePointerEvents(false);
}
function beginResize(dir: string, event: MouseEvent): void {
  if (maximized.value) return;
  const node = modal.value;
  if (!node) return;
  const rect = node.getBoundingClientRect();
  resize = { dir, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  event.preventDefault();
  event.stopPropagation();
  setFramePointerEvents(false);
}
function setFramePointerEvents(enabled: boolean): void {
  modal.value?.querySelectorAll('iframe').forEach((frame) => { frame.style.pointerEvents = enabled ? '' : 'none'; });
}
function move(event: MouseEvent): void {
  const node = modal.value;
  if (!node) return;
  if (drag) {
    const left = Math.max(0, Math.min(viewportWidth() - node.offsetWidth, drag.left + event.clientX - drag.x));
    const top = Math.max(0, Math.min(viewportHeight() - node.offsetHeight, drag.top + event.clientY - drag.y));
    node.style.left = `${left}px`; node.style.top = `${top}px`; node.style.transform = 'none';
    return;
  }
  if (!resize) return;
  const dx = event.clientX - resize.x; const dy = event.clientY - resize.y;
  const minWidth = 480; const minHeight = 300;
  let left = resize.left; let top = resize.top; let width = resize.width; let height = resize.height;
  if (resize.dir.includes('e')) width = Math.max(minWidth, resize.width + dx);
  if (resize.dir.includes('s')) height = Math.max(minHeight, resize.height + dy);
  if (resize.dir.includes('w')) { width = Math.max(minWidth, resize.width - dx); left = resize.left + resize.width - width; }
  if (resize.dir.includes('n')) { height = Math.max(minHeight, resize.height - dy); top = resize.top + resize.height - height; }
  width = Math.min(width, viewportWidth() - Math.max(0, left)); height = Math.min(height, viewportHeight() - Math.max(0, top));
  node.style.left = `${Math.max(0, left)}px`; node.style.top = `${Math.max(0, top)}px`; node.style.width = `${width}px`; node.style.height = `${height}px`; node.style.transform = 'none';
}
function endInteraction(): void {
  drag = null; resize = null; setFramePointerEvents(true);
}
function resetFrame(): void {
  const node = modal.value;
  if (!node) return;
  node.style.left = ''; node.style.top = ''; node.style.width = ''; node.style.height = ''; node.style.transform = '';
  maximized.value = false;
}
watch(() => modal.value, () => resetFrame());
onMounted(() => {
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', endInteraction);
});
onBeforeUnmount(() => {
  window.removeEventListener('mousemove', move);
  window.removeEventListener('mouseup', endInteraction);
});
</script>

<template>
  <div v-if="plot.open" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop">
    <section ref="modal" class="opt-modal opt-plot-modal" :class="{ 'is-maximized': maximized }" role="dialog" aria-modal="true">
      <div v-for="direction in ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se']" :key="direction" class="pnr" :class="`pnr-${direction}`" :data-dir="direction" @mousedown="beginResize(direction, $event)"></div>
      <header data-test="plot-header" class="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-default px-3.5 py-3" @mousedown="beginDrag"><h2>{{ plot.title }}</h2><div class="whitespace-nowrap! overflow-visible!"><Button variant="default" size="sm" type="button" @click="maximized = !maximized">{{ maximized ? t('common.restore') : t('common.maximize') }}</Button><Button variant="default" type="button" @click="emit('close')">{{ t('common.close') }}</Button></div></header>
      <div class="min-h-0 flex-1 overflow-hidden p-0">
        <iframe v-if="plot.kind === 'html'" :srcdoc="plot.html" sandbox="allow-scripts allow-same-origin" :title="t('v7optimize.plot3d')"></iframe>
        <iframe v-else-if="plot.kind === 'url'" :src="plot.url" sandbox="allow-scripts allow-same-origin allow-forms" :title="t('v7optimize.pdParetoDash')"></iframe>
        <pre v-else>{{ plot.text }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
/* Plot modal chrome ported from styles/optimize.css — drag-resize handles
   and maximized state are dense absolute positioning, not utilities. */
.opt-plot-modal.is-maximized {
  inset: 16px;
  width: auto;
  height: auto;
  transform: none;
}

.opt-plot-modal > :deep(.opt-modal-head) { cursor: move; }

.opt-plot-body iframe { width: 100%; height: 100%; border: 0; }

.opt-plot-body pre {
  height: 100%;
  margin: 0;
  overflow: auto;
  padding: 14px;
  white-space: pre-wrap;
}

.pnr { position: absolute; z-index: 4; }
.pnr-n, .pnr-s { left: 10px; right: 10px; height: 8px; }
.pnr-n { top: -4px; cursor: n-resize; }
.pnr-s { bottom: -4px; cursor: s-resize; }
.pnr-w, .pnr-e { top: 10px; bottom: 10px; width: 8px; }
.pnr-w { left: -4px; cursor: w-resize; }
.pnr-e { right: -4px; cursor: e-resize; }
.pnr-nw, .pnr-ne, .pnr-sw, .pnr-se { width: 12px; height: 12px; }
.pnr-nw { left: -5px; top: -5px; cursor: nw-resize; }
.pnr-ne { right: -5px; top: -5px; cursor: ne-resize; }
.pnr-sw { left: -5px; bottom: -5px; cursor: sw-resize; }
.pnr-se { right: -5px; bottom: -5px; cursor: se-resize; }
</style>
