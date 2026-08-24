<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Label as LabelPrimitive, type LabelProps } from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * Label — the uppercase small-caps form label (the former
 * `.form-group label` visual), on Reka's accessible label primitive.
 */
const props = defineProps<LabelProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <LabelPrimitive
    data-slot="label"
    :for="props.for"
    :class="cn(
      'text-xs font-semibold uppercase leading-4.5 tracking-label text-secondary peer-disabled:cursor-not-allowed peer-disabled:opacity-45',
      props.class,
    )"
  >
    <slot />
  </LabelPrimitive>
</template>
