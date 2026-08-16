<script setup lang="ts">
/*
 * The tags multiselect — a Vue reimplementation of the one
 * editor_shared.createMultiselectController behavior coin_data.html used
 * (:2377-2400): chips before the input (.ms-tag/.ms-x :2004-2017), a
 * filter-as-you-type dropdown (.ms-option list :2081-2105), mousedown picks
 * without blurring (:2117-2123), click-outside closes. Exclusive values,
 * counterpart maps and coin meta never applied to the tags picker and are
 * not ported.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  options: string[];
  modelValue: string[];
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', tags: string[]): void;
}>();

const { t } = useI18n();

const wrapEl = useTemplateRef<HTMLDivElement>('wrap');
const inputEl = useTemplateRef<HTMLInputElement>('input');
const open = ref(false);
const filter = ref('');
const highlightIndex = ref(-1);

const visibleOptions = computed(() => {
  const needle = filter.value.trim().toUpperCase();
  return props.options.filter((option) => !needle || String(option).toUpperCase().includes(needle));
});

const placeholder = computed(() => {
  if (props.disabled) return t('market.noTagsAvailable');
  if (props.modelValue.length) return ''; // :2384 — chips replace the hint
  return t('market.selectTags');
});

function toggle(value: string): void {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((tag) => tag !== value)
    : [...props.modelValue, value];
  emit('update:modelValue', next);
}

function pick(value: string): void {
  toggle(value);
  filter.value = '';
  highlightIndex.value = -1;
}

function remove(value: string): void {
  emit('update:modelValue', props.modelValue.filter((tag) => tag !== value));
}

function onInput(): void {
  highlightIndex.value = -1;
  open.value = true;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) open.value = true;
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = highlightIndex.value + delta;
    highlightIndex.value = Math.max(0, Math.min(visibleOptions.value.length - 1, next));
  } else if (event.key === 'Enter') {
    if (open.value && highlightIndex.value >= 0 && visibleOptions.value[highlightIndex.value]) {
      event.preventDefault();
      pick(visibleOptions.value[highlightIndex.value]!);
    }
  } else if (event.key === 'Escape') {
    open.value = false;
  }
}

function onDocMousedown(event: MouseEvent): void {
  if (wrapEl.value && !wrapEl.value.contains(event.target as Node)) {
    open.value = false;
    filter.value = '';
  }
}

/** Wrap mousedown (:3163-3171) — focus the input unless a chip close was hit. */
function onWrapMousedown(event: MouseEvent): void {
  if ((event.target as HTMLElement).closest('.ms-x')) return;
  if (props.disabled) return;
  void nextTick(() => inputEl.value?.focus());
}

/** Server option refresh — keep selection limited to known tags (rebuild :2399). */
watch(
  () => props.options,
  () => {
    const known = new Set(props.options);
    if (props.modelValue.some((tag) => !known.has(tag))) {
      emit('update:modelValue', props.modelValue.filter((tag) => known.has(tag)));
    }
  }
);

onMounted(() => document.addEventListener('mousedown', onDocMousedown));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMousedown));
</script>

<template>
  <div
    ref="wrap"
    class="ms-wrap"
    id="tag-filter-wrap"
    @mousedown="onWrapMousedown"
  >
    <span
      v-for="tag in modelValue"
      :key="tag"
      class="ms-tag"
      :title="tag"
    >{{ tag }} <span class="ms-x" :data-val="tag" @click.stop="remove(tag)">×</span></span>
    <input
      ref="input"
      class="ms-input"
      id="tag-filter-input"
      type="text"
      autocomplete="off"
      :disabled="disabled"
      :placeholder="placeholder"
      v-model="filter"
      @focus="open = true"
      @input="onInput"
      @keydown="onKeydown"
    />
    <div class="ms-dropdown" id="tag-options" :class="{ open: open && !disabled }">
      <div
        v-for="(option, index) in visibleOptions"
        :key="option"
        class="ms-option"
        :class="{
          selected: modelValue.includes(option),
          highlighted: index === highlightIndex && !modelValue.includes(option),
        }"
        :data-val="option"
        @mousedown.prevent="pick(option)"
      >{{ option }}</div>
      <div v-if="!visibleOptions.length" style="padding:4px 8px;color:var(--text-dim);font-size:var(--fs-xs)">{{ t('editor.ms.noMatches') }}</div>
    </div>
  </div>
</template>
