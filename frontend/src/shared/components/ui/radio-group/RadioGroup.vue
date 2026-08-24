<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { RadioGroupRoot, type RadioGroupRootEmits, type RadioGroupRootProps, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * RadioGroup — the layout container + model owner for a set of
 * RadioItem children. Keyboard arrow navigation comes from Reka.
 *
 * Props and the update:modelValue event are forwarded as one unit
 * (see Switch).
 */
const props = defineProps<RadioGroupRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<RadioGroupRootEmits>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <RadioGroupRoot
    data-slot="radio-group"
    v-bind="forwarded"
    :class="cn('grid gap-1.5', props.class)"
  >
    <slot />
  </RadioGroupRoot>
</template>
