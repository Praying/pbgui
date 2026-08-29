<script setup lang="ts">
import { computed, ref } from 'vue';
import { Textarea } from '@/shared/components/ui/textarea';

type Status = 'neutralized' | 'pb_default' | string;
const props = withDefaults(defineProps<{
  modelValue: string;
  status?: Record<string, unknown>;
  label: string;
}>(), { status: () => ({}) });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
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
/* The scroll event carries the textarea as its target — no template ref
   needed (ui/Textarea exposes only focus/blur/select). */
function syncScroll(event: Event): void {
  const el = event.target as HTMLTextAreaElement | null;
  if (!el || !highlight.value) return;
  highlight.value.scrollTop = el.scrollTop;
  highlight.value.scrollLeft = el.scrollLeft;
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
      <!-- ui-migration: Textarea keeps the overlay-critical metrics
           (p-2.5 / text-xs / leading-[1.45] / whitespace-pre-wrap /
           bg-transparent) — the highlight <pre> behind it aligns to them. -->
      <Textarea class="opt-bot-json-input absolute inset-0 z-[1] box-border h-full min-h-0 resize-y overflow-auto whitespace-pre-wrap bg-transparent p-2.5 text-xs leading-[1.45] caret-primary" :aria-label="label" :model-value="modelValue" spellcheck="false" @update:model-value="emit('update:modelValue', String($event ?? ''))" @scroll="syncScroll" /></div>
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

.opt-bot-json-legend [data-status='neutralized'] { color: var(--warning-soft); }
.opt-bot-json-legend [data-status='pb_default'] { color: var(--danger); }
</style>
