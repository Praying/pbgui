<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { computed, ref } from 'vue';
import { cn } from '@/shared/lib/utils';
import { useFieldContext } from '@/shared/components/ui/field';

/**
 * Input — the unified text-entry chrome (the former `.form-input`
 * visual as utilities). Native attributes (type, placeholder, min/max/
 * step, maxlength, …) fall through to the element via $attrs.
 *
 * `size` mirrors the Button scale (sm/default/lg) so mixed control rows
 * stay height-aligned; a caller `class` with a competing height still
 * wins through the cn() merge.
 *
 * `v-model.number` keeps its native semantics: the modifier is forwarded
 * to the inner <input>'s own v-model (two-branch render — modifiers are
 * compile-time), so looseToNumber conversion, intermediate-typing states
 * ("2.") and empty-string behavior match a native control exactly.
 *
 * Inside a Field, the label association (id, aria-describedby,
 * aria-invalid) is applied automatically through the field context.
 * An explicit id/describedby passed by the caller wins over the context.
 *
 * The template ref exposes focus/blur/select so legacy call sites that
 * did `inputRef.value?.focus()` keep working unchanged.
 */
const props = withDefaults(
  defineProps<{
    class?: HTMLAttributes['class'];
    /** Height/text-scale variant — matches the Button size scale. */
    size?: 'sm' | 'default' | 'lg';
  }>(),
  { size: 'default' },
);

const field = useFieldContext();

const [model, modelModifiers] = defineModel<string | number | null>();

const el = ref<HTMLInputElement | null>(null);
defineExpose({
  focus: () => el.value?.focus(),
  blur: () => el.value?.blur(),
  select: () => el.value?.select(),
});

const sizeClasses = {
  sm: 'h-7 text-xs',
  default: 'h-8 text-sm',
  lg: 'h-9.5 text-md',
} as const;

/* computed so a reactive caller `class` (e.g. conditional error tones)
   re-resolves through the cn() merge on every render. */
const inputClass = computed(() =>
  cn(
    'flex w-full min-w-0 rounded-sm border border-border-default bg-input px-2 text-primary outline-none transition-colors duration-[120ms] ease-standard placeholder:text-placeholder focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger/60',
    sizeClasses[props.size],
    props.class,
  ),
);
</script>

<template>
  <input
    v-if="modelModifiers.number"
    ref="el"
    v-model.number="model"
    data-slot="input"
    :id="field?.inputId"
    :aria-describedby="field?.describedBy"
    :aria-invalid="field?.invalid || undefined"
    :class="inputClass"
  >
  <input
    v-else
    ref="el"
    v-model="model"
    data-slot="input"
    :id="field?.inputId"
    :aria-describedby="field?.describedBy"
    :aria-invalid="field?.invalid || undefined"
    :class="inputClass"
  >
</template>
