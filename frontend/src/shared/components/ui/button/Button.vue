<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { Primitive, type PrimitiveProps } from 'reka-ui';
import { cn } from '@/shared/lib/utils';
import { type ButtonVariants, buttonVariants } from '.';

/**
 * Button — the shadcn-vue button with PBGui token classes.
 *
 * `variant` maps onto the old `.btn-*` classes one-to-one (default→.btn,
 * primary→.btn-primary, …) so migrating pages is a mechanical swap.
 */
interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: HTMLAttributes['class'];
  disabled?: boolean;
  /** Shows a small inline spinner and blocks activation. */
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
  disabled: false,
  loading: false,
});
</script>

<template>
  <Primitive
    data-slot="button"
    :as="as"
    :as-child="asChild"
    :class="cn(buttonVariants({ variant, size }), props.class)"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="spinner size-3.5 border-2" aria-hidden="true" />
    <slot />
  </Primitive>
</template>
