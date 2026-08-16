<script setup lang="ts">
/*
 * Legacy #toast-stack markup (market_data_main.html:3638, :4987-4993):
 * fixed container, one .toast {level} child per item, is-leaving during the
 * exit phase. Text is interpolated — server data never reaches v-html.
 */
import type { ToastItem } from '../types';

defineProps<{ toasts: ToastItem[] }>();
</script>

<template>
  <div id="toast-stack">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="toast"
      :class="[toast.level, { 'is-leaving': toast.leaving }]"
    >{{ toast.message }}</div>
  </div>
</template>
