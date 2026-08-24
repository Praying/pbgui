<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { PhCheck, PhMinus } from '@phosphor-icons/vue';
import {
  CheckboxIndicator,
  CheckboxRoot,
  type CheckboxRootEmits,
  type CheckboxRootProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * Checkbox — styled checkbox with indeterminate support (the accent
 * check on PBGui surfaces). Reka provides the tri-state keyboard and
 * ARIA wiring; bind boolean or checked/indeterminate values.
 *
 * Props and the update events are forwarded as one unit (see Switch).
 */
const props = defineProps<CheckboxRootProps & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<CheckboxRootEmits>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <CheckboxRoot
    data-slot="checkbox"
    v-bind="forwarded"
    :class="cn(
      'peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-border-strong bg-input transition-colors duration-[120ms] ease-standard data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent disabled:cursor-not-allowed disabled:opacity-45',
      props.class,
    )"
  >
    <CheckboxIndicator class="flex items-center justify-center text-accent-contrast">
      <PhCheck v-if="$props.modelValue === true" class="size-3" aria-hidden="true" weight="bold" />
      <PhMinus v-else class="size-3" aria-hidden="true" weight="bold" />
    </CheckboxIndicator>
  </CheckboxRoot>
</template>
