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
defineEmits<{ (e: 'dismiss', id: number): void }>();

/* Level → shared tonal toast classes (components.css `.toast-*`): elevated
   surface + status-coloured rail. The solid bright fills are retired — the
   near-white text on them failed contrast badly. The contract ships no
   warning tone, so warn/warning recolour the rail via a utility. */
const TOAST_TONE: Record<string, string> = {
  success: 'toast-success',
  error: 'toast-error',
  info: 'toast-info',
  warn: '[border-left-color:var(--warning)]',
  warning: '[border-left-color:var(--warning)]',
};

/** The former .toast + .toast.{level} + .toast.is-leaving rules. 'toast' and
    the level stay as inert anchors — the suite selects `.toast.success`. */
function toastClass(toast: ToastItem): string {
  const tone = TOAST_TONE[toast.level] ?? TOAST_TONE.info;
  const animation = toast.leaving
    ? 'is-leaving animate-[toast-slide-out_0.22s_ease_forwards]'
    : 'animate-[toast-slide-in_0.22s_ease]';
  return `toast ${toast.level} cursor-pointer break-words select-none ${tone} ${animation}`;
}
</script>

<template>
  <div
    id="toast-stack"
    class="pointer-events-none fixed top-[68px] right-5 z-[var(--z-toast)] flex w-[min(420px,calc(100vw-40px))] flex-col gap-2"
  >
    <div
      v-for="toast in toasts"
      :key="toast.id"
      :class="toastClass(toast)"
      role="status"
      tabindex="0"
      @click="$emit('dismiss', toast.id)"
      @keydown.enter="$emit('dismiss', toast.id)"
      @keydown.space.prevent="$emit('dismiss', toast.id)"
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
