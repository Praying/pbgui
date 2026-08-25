<script setup lang="ts">
import type { HTMLAttributes } from 'vue';
import { ref } from 'vue';
import { cn } from '@/shared/lib/utils';
import { useFieldContext } from '@/shared/components/ui/field';

/**
 * Textarea — the multi-line counterpart of Input. Same chrome plus the
 * mono stack: every textarea in PBGui edits config/JSON, so the mono
 * default matches how the legacy pages styled them. Field context
 * wiring applies as on Input, and the template ref exposes
 * focus/blur/select for legacy call sites.
 */
const props = defineProps<{
  class?: HTMLAttributes['class'];
}>();

const field = useFieldContext();

const model = defineModel<string>();

const el = ref<HTMLTextAreaElement | null>(null);
defineExpose({
  focus: () => el.value?.focus(),
  blur: () => el.value?.blur(),
  select: () => el.value?.select(),
});
</script>

<template>
  <textarea
    ref="el"
    v-model="model"
    data-slot="textarea"
    :id="field?.inputId"
    :aria-describedby="field?.describedBy"
    :aria-invalid="field?.invalid || undefined"
    :class="cn(
      'flex min-h-16 w-full resize-y rounded-sm border border-border-default bg-input px-2 py-1.5 font-mono text-sm text-primary outline-none transition-colors duration-[120ms] ease-standard placeholder:text-placeholder focus-visible:border-accent disabled:cursor-not-allowed disabled:opacity-45 aria-invalid:border-danger/60',
      props.class,
    )"
  />
</template>
