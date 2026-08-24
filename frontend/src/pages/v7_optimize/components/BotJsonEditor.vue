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
  <div class="grid min-w-0 gap-1.5">
    <div v-if="Object.keys(status).length" class="flex gap-3 text-xs text-secondary">
      <span data-status="neutralized">■ neutralized</span>
      <span data-status="pb_default">■ review</span>
    </div>
    <div class="relative min-h-[320px]">
      <pre ref="highlight" class="pointer-events-none absolute inset-0 box-border h-full w-full overflow-auto whitespace-pre-wrap rounded-sm border border-border-default bg-page p-2.5 font-mono text-xs leading-[1.45] text-transparent" aria-hidden="true"><span v-for="line in lines" :key="line.number" :data-status="line.status || undefined" :class="line.status ? `is-${line.status}` : undefined">{{ line.text }}</span></pre>
      <textarea ref="textarea" class="opt-bot-json-input absolute inset-0 z-[1] box-border h-full w-full resize-y overflow-auto whitespace-pre-wrap rounded-sm border border-border-default bg-transparent p-2.5 font-mono text-xs leading-[1.45] text-primary caret-[#e8ecf4]" :aria-label="label" :value="modelValue" spellcheck="false" @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)" @scroll="syncScroll" /></div>
  </div>
</template>

<style scoped>
/* Highlight overlay ported from styles/optimize.css — per-line spans carry
   status backgrounds via data attributes. */
.opt-bot-json-highlight span {
  display: block;
  min-height: 1.45em;
}

.opt-bot-json-highlight span[data-status='neutralized'] {
  background: rgb(var(--warning-rgb) / 0.16);
  border-radius: 2px;
}

.opt-bot-json-highlight span[data-status='pb_default'] {
  background: rgb(var(--danger-rgb) / 0.16);
  border-radius: 2px;
}

.opt-bot-json-legend [data-status='neutralized'] { color: #d0a36f; }
.opt-bot-json-legend [data-status='pb_default'] { color: var(--danger); }
</style>
