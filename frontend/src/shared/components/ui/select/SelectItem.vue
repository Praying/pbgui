<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { PhCheck } from '@phosphor-icons/vue';
import {
  SelectItem as SelectItemPrimitive,
  type SelectItemProps,
  SelectItemIndicator,
  SelectItemText,
} from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * SelectItem — one option row. `data-highlighted` covers both hover and
 * keyboard focus (Reka drives both), checked state shows the accent check.
 */
const props = defineProps<SelectItemProps & { class?: HTMLAttributes['class'] }>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
</script>

<template>
  <SelectItemPrimitive
    data-slot="select-item"
    v-bind="delegatedProps"
    :class="cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm text-secondary outline-none transition-colors duration-[120ms] ease-standard data-[highlighted]:bg-accent/14 data-[highlighted]:text-primary data-[state=checked]:font-medium data-[state=checked]:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
      props.class,
    )"
  >
    <SelectItemText>
      <slot />
    </SelectItemText>
    <SelectItemIndicator class="absolute right-2 inline-flex items-center">
      <PhCheck class="size-3.5 text-accent-soft" aria-hidden="true" weight="bold" />
    </SelectItemIndicator>
  </SelectItemPrimitive>
</template>
