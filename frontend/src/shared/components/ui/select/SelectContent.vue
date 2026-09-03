<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import {
  SelectContent as SelectContentPrimitive,
  type SelectContentProps,
  SelectPortal,
  SelectViewport,
} from 'reka-ui';
import { cn } from '@/shared/lib/utils';
import SelectScrollDownButton from './SelectScrollDownButton.vue';
import SelectScrollUpButton from './SelectScrollUpButton.vue';

/**
 * SelectContent — the floating listbox. Elevated surface + tinted shadow
 * (the PBGui popover language); in popper position the width follows the
 * trigger through Reka's --reka-select-trigger-width variable.
 */
const props = withDefaults(
  defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>(),
  { position: 'popper', sideOffset: 4 },
);

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
</script>

<template>
  <SelectPortal>
    <SelectContentPrimitive
      data-slot="select-content"
      v-bind="delegatedProps"
      :class="cn(
        'z-[var(--z-dropdown,1500)] max-h-[min(24rem,var(--reka-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-md border border-border-default bg-elevated text-primary shadow-elevated',
        props.position === 'popper' && 'w-full min-w-[var(--reka-select-trigger-width)]',
        props.class,
      )"
    >
      <SelectScrollUpButton />
      <SelectViewport class="p-1">
        <slot />
      </SelectViewport>
      <SelectScrollDownButton />
    </SelectContentPrimitive>
  </SelectPortal>
</template>
