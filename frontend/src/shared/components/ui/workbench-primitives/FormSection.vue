<script setup lang="ts">
/**
 * FormSection — a semantic fieldset wrapper for long configuration forms.
 * Labels and hints remain text content so callers retain normal escaping.
 */
import { useId } from 'vue';

interface FormSectionProps {
  title: string;
  description?: string;
}

const props = defineProps<FormSectionProps>();
const descriptionId = `form-section-description-${useId()}`;
</script>

<template>
  <fieldset
    class="min-w-0 rounded-lg border border-border-subtle bg-panel p-4"
    :aria-describedby="props.description ? descriptionId : undefined"
  >
    <legend class="px-1 text-md font-semibold tracking-tight text-primary">
      {{ props.title }}
    </legend>
    <p v-if="props.description" :id="descriptionId" class="mb-3 mt-1 text-sm text-muted">
      {{ props.description }}
    </p>
    <div class="grid min-w-0 gap-3">
      <slot />
    </div>
  </fieldset>
</template>
