<script setup lang="ts">
import { computed, ref } from 'vue';

/**
 * Tag-input multiselect — the Vue port of the .ms-wrap visual contract
 * (v7_edit.html:1029-1060 DOM; behavior from editor_shared.js
 * createMultiselectController, simplified to the M-v7-1 needs: toggle
 * options, remove tags, 'all' button, clear button). Selected values are the
 * collectConfig source of truth — parity is covered by the golden tests.
 */
const model = defineModel<string[]>({ required: true });
const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    options: readonly string[];
    placeholder?: string;
    allowAllButton?: boolean;
    selectAllButton?: boolean;
  }>(),
  { placeholder: 'Type to search...', allowAllButton: false, selectAllButton: false }
);

const filter = ref('');
const dropdownOpen = ref(false);

const filtered = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  const source = props.options;
  if (!needle) return source.slice();
  return source.filter((option) => option.toLowerCase().includes(needle));
});

function isSelected(value: string): boolean {
  return model.value.includes(value);
}

function toggle(value: string): void {
  model.value = isSelected(value)
    ? model.value.filter((entry) => entry !== value)
    : [...model.value, value];
}

function removeTag(value: string): void {
  model.value = model.value.filter((entry) => entry !== value);
}

function setAll(): void {
  model.value = ['all'];
}

function selectAll(): void {
  model.value = props.options.filter((option) => option !== 'all').slice();
}

function clear(): void {
  model.value = [];
}
</script>

<template>
  <div class="form-group">
    <label
      >{{ label }}
      <span v-if="allowAllButton" class="ms-all-btn" title="Use canonical all" @click="setAll">all</span>
      <span v-else-if="selectAllButton" class="ms-all-btn" title="Select all" @click="selectAll">all</span>
      <span class="ms-clear-btn" title="Clear all" @click="clear">&#x2715;</span>
    </label>
    <div :id="id" class="ms-wrap" @focusin="dropdownOpen = true" @focusout="dropdownOpen = false">
      <span v-for="value in model" :key="value" class="ms-tag">
        {{ value }}
        <span class="ms-x" @click="removeTag(value)">&#x2715;</span>
      </span>
      <!-- ui-migration: blocked — the chip-row filter input is chrome-free by
           design (borderless, transparent, h-6 inside the .ms-wrap box); the
           ui/ Input owns the bordered/h-8 chrome and cannot express this. -->
      <input
        :id="id + '-input'"
        v-model="filter"
        class="ms-input"
        :placeholder="placeholder"
        autocomplete="off"
        @keydown.enter.prevent="() => (filtered.length ? toggle(filtered[0]!) : undefined)"
      />
      <div :id="id + '-dd'" class="ms-dropdown" :class="{ open: dropdownOpen }">
        <div
          v-for="option in filtered"
          :key="option"
          class="ms-option"
          :class="{ selected: isSelected(option) }"
          @mousedown.prevent="toggle(option)"
        >{{ option }}</div>
      </div>
    </div>
  </div>
</template>
