<script setup lang="ts">
/** Select form-group primitive — the legacy selects with static options (:575). */
export interface SelectOption {
  readonly value: string;
  readonly label?: string;
  readonly disabled?: boolean;
}

const model = defineModel<string>({ required: true });
withDefaults(defineProps<{ id: string; label: string; tip?: string; options: readonly SelectOption[] }>(), {
  tip: '',
});
</script>

<template>
  <div class="form-group">
    <label><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
    <select :id="id" v-model="model">
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >{{ option.label ?? option.value }}</option>
    </select>
  </div>
</template>
