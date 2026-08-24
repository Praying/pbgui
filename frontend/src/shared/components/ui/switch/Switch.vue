<script setup lang="ts" generic="T extends boolean | string | number = boolean">
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import { SwitchRoot, type SwitchRootEmits, type SwitchRootProps, SwitchThumb, useForwardPropsEmits } from 'reka-ui';
import { cn } from '@/shared/lib/utils';

/**
 * Switch — boolean toggle (the single replacement for PBGui's one
 * hand-rolled switch and its bare checkbox toggles). Reka drives the
 * ARIA switch role and keyboard activation; trueValue/falseValue let
 * pages bind 0/1 or string-backed state directly (hence the generic).
 *
 * Props and the update:modelValue event are forwarded as one unit —
 * declaring modelValue as a prop would otherwise drop the listener
 * from $attrs (Vue treats it as the component's own v-model event).
 */
const props = defineProps<SwitchRootProps<T> & { class?: HTMLAttributes['class'] }>();
const emits = defineEmits<SwitchRootEmits<T>>();

const delegatedProps = computed(() => {
  const { class: _class, ...delegated } = props;
  return delegated;
});
const forwarded = useForwardPropsEmits(delegatedProps, emits);
</script>

<template>
  <SwitchRoot
    data-slot="switch"
    v-bind="forwarded"
    :class="cn(
      'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-default bg-white/10 transition-colors duration-[120ms] ease-standard data-[state=checked]:border-accent/50 data-[state=checked]:bg-accent/45 disabled:cursor-not-allowed disabled:opacity-45',
      props.class,
    )"
  >
    <SwitchThumb
      data-slot="switch-thumb"
      class="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-secondary shadow transition-transform duration-[120ms] ease-standard data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-accent-soft"
    />
  </SwitchRoot>
</template>
