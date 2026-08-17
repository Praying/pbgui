<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

/**
 * Fixed [data-tip] tooltip layer — the port of the mouseover/mousemove/
 * mouseout handlers (v7_edit.html:4037+). Renders textContent only (never
 * innerHTML) — the legacy cov-badge variant with raw HTML tooltips is
 * intentionally not ported for server data (XSS class R1).
 */
const tip = ref<HTMLElement | null>(null);
const visible = ref(false);
const position = ref({ left: '0px', top: '0px' });

function onMouseOver(event: MouseEvent): void {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
  if (!target) return;
  if (!tip.value) return;
  tip.value.textContent = target.getAttribute('data-tip') || '';
  visible.value = true;
  onMouseMove(event);
}

function onMouseMove(event: MouseEvent): void {
  if (!visible.value) return;
  let x = event.clientX + 14;
  let y = event.clientY + 14;
  const node = tip.value;
  if (node) {
    const width = node.offsetWidth;
    const height = node.offsetHeight;
    if (x + width > window.innerWidth - 8) x = event.clientX - width - 10;
    if (y + height > window.innerHeight - 8) y = event.clientY - height - 10;
  }
  position.value = { left: x + 'px', top: y + 'px' };
}

function onMouseOut(event: MouseEvent): void {
  const target = (event.target as HTMLElement | null)?.closest?.('[data-tip]') as HTMLElement | null;
  if (target) visible.value = false;
}

onMounted(() => {
  document.addEventListener('mouseover', onMouseOver);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseout', onMouseOut);
});

onBeforeUnmount(() => {
  document.removeEventListener('mouseover', onMouseOver);
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseout', onMouseOut);
});
</script>

<template>
  <div
    ref="tip"
    id="data-tip-tooltip"
    :style="{ display: visible ? 'block' : 'none', left: position.left, top: position.top }"
  ></div>
</template>
