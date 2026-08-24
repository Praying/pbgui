<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { PhCaretDown } from '@phosphor-icons/vue';
import { SelectTrigger as SelectTriggerPrimitive, type SelectTriggerProps } from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * SelectTrigger — the closed-state control. Same chrome as Input, plus
 * the caret; `data-placeholder` drives the placeholder text color.
 */
const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
</script>

<template>
  <SelectTriggerPrimitive
    data-slot="select-trigger"
    v-bind="delegatedProps"
    :class="cn(
      'flex h-8 w-full cursor-pointer items-center justify-between gap-2 rounded-sm border border-border-default bg-input px-2 text-sm text-primary outline-none transition-colors duration-[120ms] ease-standard data-[placeholder]:text-placeholder hover:border-border-strong focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-45 [&>span]:truncate',
      props.class,
    )"
  >
    <slot />
    <PhCaretDown class="size-3.5 shrink-0 text-secondary" aria-hidden="true" />
  </SelectTriggerPrimitive>
</template>
