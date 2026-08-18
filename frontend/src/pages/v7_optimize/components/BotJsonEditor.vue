<script setup lang="ts">
import { computed, ref } from 'vue';

type Status = 'neutralized' | 'pb_default' | string;
const props = withDefaults(defineProps<{
  modelValue: string;
  status?: Record<string, unknown>;
  label: string;
}>(), { status: () => ({}) });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const textarea = ref<HTMLTextAreaElement | null>(null);
const highlight = ref<HTMLElement | null>(null);

interface Line { text: string; status: Status | null; number: number }
function lineStatus(value: string): Line[] {
  const result: Line[] = [];
  let depth = 0;
  let blockStatus: Status | null = null;
  let blockDepth = 0;
  value.split('\n').forEach((text, index) => {
    const opens = (text.match(/\{/g) || []).length;
    const closes = (text.match(/\}/g) || []).length;
    const depthBefore = depth;
    depth += opens - closes;
    let status: Status | null = null;
    if (blockStatus && depthBefore > blockDepth) status = blockStatus;
    else {
      const match = text.match(/^\s*"([^"]+)":/);
      status = match ? String(props.status?.[match[1]!] || '') || null : null;
    }
    if (status && opens > closes) {
      blockStatus = status;
      blockDepth = depthBefore;
    }
    if (blockStatus && depth <= blockDepth) blockStatus = null;
    result.push({ text, status, number: index + 1 });
  });
  return result;
}
const lines = computed(() => lineStatus(props.modelValue));
function syncScroll(): void {
  if (!textarea.value || !highlight.value) return;
  highlight.value.scrollTop = textarea.value.scrollTop;
  highlight.value.scrollLeft = textarea.value.scrollLeft;
}
</script>

<template>
  <div class="opt-bot-json-editor">
    <div v-if="Object.keys(status).length" class="opt-bot-json-legend">
      <span data-status="neutralized">■ neutralized</span>
      <span data-status="pb_default">■ review</span>
    </div>
    <div class="opt-bot-json-layer">
      <pre ref="highlight" class="opt-bot-json-highlight" aria-hidden="true"><span v-for="line in lines" :key="line.number" :data-status="line.status || undefined" :class="line.status ? `is-${line.status}` : undefined">{{ line.text }}</span></pre>
      <textarea ref="textarea" class="opt-json opt-bot-json-input" :aria-label="label" :value="modelValue" spellcheck="false" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @scroll="syncScroll" /></div>
  </div>
</template>
