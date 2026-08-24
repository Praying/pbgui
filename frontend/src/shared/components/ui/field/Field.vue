<script setup lang="ts">
import { computed, useId, type HTMLAttributes } from 'vue';
import { cn } from '@/shared/lib/utils';
import { Label } from '@/shared/components/ui/label';
import { provideFieldContext, type FieldContext } from './context';

/**
 * Field — label / control / feedback scaffold, the lightweight stand-in
 * for shadcn's Form (which is built on vee-validate; PBGui validates in
 * its own stores and does not want the dependency).
 *
 * Controls that inject the field context (Input, Textarea, …) pick up
 * the label association automatically:
 *
 *   <Field label="Symbol" hint="e.g. BTCUSDT">
 *     <Input v-model="symbol" />
 *   </Field>
 *
 * Custom controls receive the same wiring as slot props:
 * `#default="{ id, describedby, invalid }"`.
 */
interface FieldProps {
  label: string;
  hint?: string;
  /** Replaces the hint and switches the feedback to the error look. */
  error?: string;
  required?: boolean;
  class?: HTMLAttributes['class'];
}

const props = defineProps<FieldProps>();

const fieldId = useId();
const inputId = `${fieldId}-input`;
const feedbackId = `${fieldId}-feedback`;
const describedBy = computed(() => (props.error || props.hint ? feedbackId : undefined));

provideFieldContext(
  computed<FieldContext>(() => ({
    inputId,
    describedBy: describedBy.value,
    invalid: !!props.error,
  })),
);
</script>

<template>
  <div
    data-slot="field"
    :class="cn('flex min-w-0 flex-col gap-1', props.class)"
    :data-invalid="props.error ? '' : undefined"
  >
    <Label :for="inputId">
      {{ props.label }}
      <span v-if="props.required" class="text-danger" aria-hidden="true">*</span>
      <span v-if="props.required" class="sr-only">(required)</span>
    </Label>
    <slot :id="inputId" :describedby="describedBy" :invalid="!!props.error" />
    <p v-if="props.error" :id="feedbackId" class="text-xs text-danger-soft" role="alert">
      {{ props.error }}
    </p>
    <p v-else-if="props.hint" :id="feedbackId" class="text-xs text-muted">
      {{ props.hint }}
    </p>
  </div>
</template>
