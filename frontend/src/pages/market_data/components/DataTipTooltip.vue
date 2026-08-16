<script setup lang="ts">
/*
 * The data-tip tooltip (legacy market_data_main.html:3637 +
 * initDataTipTooltip :3839-3865): one fixed-position element driven by
 * document-delegated mouseover/mousemove/mouseout over ANY [data-tip]
 * element. Keeping the attribute-driven mechanism (instead of a
 * per-element Vue tooltip) means later panel ports can carry their legacy
 * data-tip attributes (:3428 etc.) unchanged and they work here already.
 *
 * Positioning is legacy-verbatim: cursor + 14 px, flipping left/up when
 * the tip would overflow the viewport edges minus an 8 px margin.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

const TIP_CURSOR_OFFSET_PX = 14; // :3852-3853
const TIP_EDGE_MARGIN_PX = 8; // :3856-3857
const TIP_FLIP_GAP_PX = 10; // :3856-3857

const tipEl = ref<HTMLElement | null>(null);

function tippedTarget(event: MouseEvent): HTMLElement | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest('[data-tip]');
}

function onMouseOver(event: MouseEvent): void {
  const tip = tipEl.value;
  if (!tip) return;
  const element = tippedTarget(event); // :3843
  if (!element) return;
  const text = element.getAttribute('data-tip');
  if (!text) return; // :3845-3846
  tip.textContent = text;
  tip.style.display = 'block';
}

function onMouseMove(event: MouseEvent): void {
  const tip = tipEl.value;
  if (!tip || tip.style.display === 'none') return; // :3851
  let x = event.clientX + TIP_CURSOR_OFFSET_PX;
  let y = event.clientY + TIP_CURSOR_OFFSET_PX;
  const tipWidth = tip.offsetWidth;
  const tipHeight = tip.offsetHeight;
  if (x + tipWidth > window.innerWidth - TIP_EDGE_MARGIN_PX) {
    x = event.clientX - tipWidth - TIP_FLIP_GAP_PX;
  }
  if (y + tipHeight > window.innerHeight - TIP_EDGE_MARGIN_PX) {
    y = event.clientY - tipHeight - TIP_FLIP_GAP_PX;
  }
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function onMouseOut(event: MouseEvent): void {
  const tip = tipEl.value;
  if (!tip) return;
  if (tippedTarget(event)) tip.style.display = 'none'; // :3861-3863
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
  <div id="data-tip-tooltip" ref="tipEl"></div>
</template>
