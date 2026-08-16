<script setup lang="ts">
/*
 * Generic auto-resizing iframe shell for M-data-7 — the useFrameAutoResize
 * dedupe of installBest1mFrameAutoResize (:7447-7505, hyperliquid
 * data-actions, root #__HLDA_ROOT__) and
 * installBest1mJobMonitorFrameAutoResize (:7507-7575, job monitor,
 * body-first-child root + ResizeObserver + 120 ms settle).
 *
 * The frameKey prop gives the hyperliquid variant its forced-remount
 * channel (legacy reassigned frame.src; see useBest1m.mountHyperliquid).
 */
import { onBeforeUnmount, ref } from 'vue';
import { useFrameAutoResize } from '../../composables/useFrameAutoResize';

const props = defineProps<{
  src: string;
  /** Legacy content-root id (__HLDA_ROOT__); omit for the monitor root rule. */
  rootId?: string;
  /** Monitor variant: + ResizeObserver + 120 ms settle re-sync. */
  autoResizeMode?: 'content-root' | 'monitor';
  /** Bumping remounts the frame (forced hyperliquid reload). */
  frameKey?: number;
  frameClass: string;
  frameId: string;
  title: string;
}>();

const frameEl = ref<HTMLIFrameElement | null>(null);

const controller = useFrameAutoResize({
  frame: () => frameEl.value,
  rootId: props.rootId,
  useResizeObserver: props.autoResizeMode === 'monitor',
  settleMs: props.autoResizeMode === 'monitor' ? 120 : undefined, // :7552
});

function onLoad(): void {
  controller.handleLoad(); // legacy frame load listener (:7490, :7550)
}

onBeforeUnmount(() => controller.teardown()); // R7 — no observer survives a remount
</script>

<template>
  <iframe
    :key="frameKey ?? 0"
    :class="frameClass"
    :id="frameId"
    :title="title"
    :src="src || undefined"
    loading="lazy"
    scrolling="no"
    ref="frameEl"
    @load="onLoad"
  ></iframe>
</template>
