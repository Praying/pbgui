<script setup lang="ts">
/** Numeric form-group primitive — the legacy <div class="form-group"> + input number (:583). */
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
  }>(),
  { tip: '', min: undefined, max: undefined, step: undefined, placeholder: '' }
);
</script>

<template>
  <div class="form-group">
    <label><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
    <input :id="id" v-model="model" type="number" :min="min" :max="max" :step="step" :placeholder="placeholder" />
  </div>
</template>
