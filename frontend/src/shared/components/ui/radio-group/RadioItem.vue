<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { RadioGroupItem as RadioItemPrimitive, type RadioGroupItemProps, RadioGroupIndicator } from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/** RadioItem — one option; place inside RadioGroup and give it a value. */
const props = defineProps<RadioGroupItemProps & { class?: HTMLAttributes['class'] }>();
</script>

<template>
  <RadioItemPrimitive
    data-slot="radio-item"
    v-bind="{ ...props, class: undefined }"
    :class="cn(
      'aspect-square size-4 shrink-0 cursor-pointer rounded-full border border-border-strong bg-input transition-colors duration-[120ms] ease-standard data-[state=checked]:border-accent disabled:cursor-not-allowed disabled:opacity-45',
      props.class,
    )"
  >
    <RadioGroupIndicator class="flex items-center justify-center">
      <span class="block size-2 rounded-full bg-accent" />
    </RadioGroupIndicator>
  </RadioItemPrimitive>
</template>
