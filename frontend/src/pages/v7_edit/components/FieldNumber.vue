<script setup lang="ts">
import FieldLabel from './FieldLabel.vue';
import { Input } from '@/shared/components/ui/input';

/** Numeric form-group primitive — the legacy <div class="form-group"> + input number (:583), on the shared Input chrome. */
const model = defineModel<string>({ required: true });
withDefaults(
  defineProps<{
    id: string;
    label: string;
    tip?: string;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    placeholder?: string;
    /** v8 locks the version input (run_editor_adapter.js configureUi :180). */
    readonly?: boolean;
  }>(),
  { tip: '', min: undefined, max: undefined, step: undefined, placeholder: '', readonly: false }
);
</script>

<template>
  <div class="form-group">
    <label :for="id"><FieldLabel :label="label" :tip="tip" /></label>
    <Input :id="id" v-model="model" type="number" :min="min" :max="max" :step="step" :placeholder="placeholder" :readonly="readonly || undefined" />
  </div>
</template>
