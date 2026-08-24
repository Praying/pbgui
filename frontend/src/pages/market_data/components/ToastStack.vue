<script setup lang="ts">
/*
 * Legacy #toast-stack markup (market_data_main.html:3638, :4987-4993):
 * fixed container, one .toast {level} child per item, is-leaving during the
 * exit phase. Text is interpolated — server data never reaches v-html.
 *
 * Tailwind port: the slide-in/out keyframes (non-rotation) stay as CSS in
 * the scoped block below; toastClass returns the complete colour set per
 * level so the base tint never fights a variant (the .toast.warn rule also
 * swapped the text colour). 'toast' / level / 'is-leaving' ride along as
 * anchors — the suite selects `.toast.success` and asserts `is-leaving`.
 */
import type { ToastItem } from '../types';

defineProps<{ toasts: ToastItem[] }>();

const TOAST_TONE: Record<string, string> = {
  success: 'bg-success/96 border-success-soft/28 text-[#f2f5fb]',
  error: 'bg-danger/96 border-danger-soft/28 text-[#f2f5fb]',
  info: 'bg-accent/96 border-accent-soft/28 text-[#f2f5fb]',
  warn: 'bg-warning/96 border-warning-soft/28 text-card',
  warning: 'bg-warning/96 border-warning-soft/28 text-card',
};

/** The former .toast + .toast.{level} + .toast.is-leaving rules. */
function toastClass(toast: ToastItem): string {
  const tone = TOAST_TONE[toast.level] ?? TOAST_TONE.info;
  const animation = toast.leaving
    ? 'is-leaving animate-[toast-slide-out_0.22s_ease_forwards]'
    : 'animate-[toast-slide-in_0.22s_ease]';
  return `toast ${toast.level} pointer-events-auto rounded-[10px] border px-3 py-2 text-base leading-[1.45] break-words shadow-[0_18px_40px_rgba(5,8,14,0.28)] ${tone} ${animation}`;
}
</script>

<template>
  <div
    id="toast-stack"
    class="pointer-events-none fixed top-[68px] right-5 z-[2000] flex w-[min(420px,calc(100vw-40px))] flex-col gap-2"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="toastClass(toast)"
    >{{ toast.message }}</div>
  </div>
</template>

<style scoped>
/* ── legacy :1770-1783 + :1808-1835 — the slide keyframes (kept as CSS;
      animate-[…] utilities reference them by name) ── */
@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(18px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-slide-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(18px);
  }
}
</style>
