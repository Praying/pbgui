<script setup lang="ts">
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * Legacy #tpl-overlay (dashboard_main.html templates popup + drag-to-move IIFE):
 * a floating, resizable iframe popup moved by its #tpl-drag-handle. The parent
 * clears the url on close (legacy close set tplIframe.src = '').
 */
defineProps<{
  visible: boolean;
  url: string;
}>();

const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const overlay = ref<HTMLElement | null>(null);

let startX = 0;
let startY = 0;
let boxLeft = 0;
let boxTop = 0;

function onDragDown(event: MouseEvent): void {
  event.preventDefault();
  const el = overlay.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  // Legacy: switch from the CSS centering transform to absolute coordinates.
  el.style.transform = 'none';
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  startX = event.clientX;
  startY = event.clientY;
  boxLeft = rect.left;
  boxTop = rect.top;
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);
}

function onDragMove(event: MouseEvent): void {
  const el = overlay.value;
  if (!el) return;
  el.style.left = `${boxLeft + event.clientX - startX}px`;
  el.style.top = `${boxTop + event.clientY - startY}px`;
}

function onDragUp(): void {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragUp);
}

onUnmounted(onDragUp);
</script>

<template>
  <div id="tpl-overlay" ref="overlay" v-show="visible">
    <div id="tpl-drag-handle" @mousedown="onDragDown"></div>
    <button id="tpl-close-btn" :title="t('common.close')" @click="emit('close')">✕</button>
    <iframe id="tpl-iframe" :src="url"></iframe>
  </div>
</template>
