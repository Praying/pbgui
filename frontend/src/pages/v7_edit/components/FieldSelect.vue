<script setup lang="ts">
import { computed } from 'vue';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';

/** Select form-group primitive — the legacy selects with static options (:575),
 *  on the shared ui/select listbox. */
export interface SelectOption {
  readonly value: string;
  readonly label?: string;
  readonly disabled?: boolean;
}

const model = defineModel<string>({ required: true });
const emit = defineEmits<{ (e: 'change'): void }>();
const props = withDefaults(defineProps<{ id: string; label: string; tip?: string; options: readonly SelectOption[] }>(), {
  tip: '',
});

/* The legacy empty-value option (forced_mode_* "no override") has no listbox
   row — reka forbids SelectItem value="" — so the trigger falls back to the
   placeholder look and the list offers no reset row (playbook deviation). */
const items = computed(() => props.options.filter((option) => option.value !== ''));
const currentLabel = computed(() => {
  const match = props.options.find((option) => option.value === model.value);
  return match ? (match.label ?? match.value) : model.value;
});
</script>

<template>
  <div class="form-group">
    <label :id="id + '-label'"><span v-if="tip" :data-tip="tip">{{ label }}</span><template v-else>{{ label }}</template></label>
    <SelectRoot v-model="model" @update:model-value="emit('change')">
      <SelectTrigger :id="id" :aria-labelledby="id + '-label'">
        <span :class="currentLabel ? undefined : 'text-placeholder'">{{ currentLabel }}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="option in items"
          :key="option.value"
          :value="option.value"
          :disabled="option.disabled"
        >{{ option.label ?? option.value }}</SelectItem>
      </SelectContent>
    </SelectRoot>
  </div>
</template>
