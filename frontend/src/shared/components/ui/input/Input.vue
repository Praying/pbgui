<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { cn } from '@/shared/lib/utils';
import { useFieldContext } from '@/shared/components/ui/field';

/**
 * Input — the unified text-entry chrome (the former `.form-input`
 * visual as utilities). Native attributes (type, placeholder, min/max/
 * step, maxlength, …) fall through to the element via $attrs.
 *
 * Inside a Field, the label association (id, aria-describedby,
 * aria-invalid) is applied automatically through the field context.
 * An explicit id/describedby passed by the caller wins over the context.
 */
const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();

const field = useFieldContext();

const model = defineModel<string | number | null>();
</script>

<template>
  <input
    v-model="model"
    data-slot="input"
    :id="field?.inputId"
    :aria-describedby="field?.describedBy"
    :aria-invalid="field?.invalid || undefined"
    :class="cn(
      'flex h-8 w-full min-w-0 rounded-sm border border-border-default bg-input px-2 text-sm text-primary outline-none transition-colors duration-[120ms] ease-standard placeholder:text-placeholder focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger/60',
      props.class,
    )"
  >
</template>
