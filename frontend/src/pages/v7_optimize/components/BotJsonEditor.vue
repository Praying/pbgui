<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhCheck, PhCode, PhCopy } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';

type Status = 'neutralized' | 'pb_default' | string;
const props = withDefaults(defineProps<{
  modelValue: string;
  status?: Record<string, unknown>;
  label: string;
}>(), { status: () => ({}) });
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function useSafeI18n() {
  try {
    return useI18n();
  } catch {
    return {
      t: (key: string) => {
        const fallbacks: Record<string, string> = {
          'v7optimize.botStrategyJson': 'Bot Strategy JSON',
          'v7optimize.prettifyJson': 'Prettify JSON',
          'v7optimize.copyJson': 'Copy JSON',
          'v7optimize.copied': 'Copied',
        };
        return fallbacks[key] || key;
      },
    };
  }
}
const { t } = useSafeI18n();
const highlight = ref<HTMLElement | null>(null);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

async function copyToClipboard(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.modelValue);
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    // clipboard not accessible
  }
}

function prettifyJson(): void {
  try {
    const parsed = JSON.parse(props.modelValue);
    emit('update:modelValue', JSON.stringify(parsed, null, 2));
  } catch {
    // Keep raw content if JSON parse fails
  }
}

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
  <div class="flex flex-col overflow-hidden rounded-xl border border-border-default bg-card shadow-sm">
    <!-- Editor Header Toolbar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-border-default/80 bg-surface-deep/70 px-3.5 py-2">
      <div class="flex items-center gap-2">
        <PbIcon :icon="PhCode" class="text-accent" :size="17" />
        <span class="text-[13.5px] font-semibold text-primary">{{ label || t('v7optimize.botStrategyJson') }}</span>
        <span class="rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-secondary">
          {{ lines.length }} lines
        </span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Status legend if any -->
        <div v-if="Object.keys(status).length" class="opt-bot-json-legend flex items-center gap-3 text-xs mr-2">
          <span data-status="neutralized" class="inline-flex items-center gap-1 font-medium">
            <span class="size-2 rounded-full bg-warning" /> neutralized
          </span>
          <span data-status="pb_default" class="inline-flex items-center gap-1 font-medium">
            <span class="size-2 rounded-full bg-danger" /> review
          </span>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-7.5 px-3 text-xs gap-1.5"
          :title="t('v7optimize.prettifyJson')"
          @click="prettifyJson"
        >
          <PbIcon :icon="PhCode" :size="13" />
          <span>{{ t('v7optimize.prettifyJson') }}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-7.5 px-3 text-xs gap-1.5"
          :title="copied ? t('v7optimize.copied') : t('v7optimize.copyJson')"
          @click="copyToClipboard"
        >
          <PbIcon :icon="copied ? PhCheck : PhCopy" :size="13" :class="copied ? 'text-success' : undefined" />
          <span>{{ copied ? t('v7optimize.copied') : t('v7optimize.copyJson') }}</span>
        </Button>
      </div>
    </div>

    <!-- Code Editor Canvas -->
    <div class="relative min-h-[360px] bg-page font-mono text-[13px]">
      <pre
        ref="highlight"
        class="pointer-events-none absolute inset-0 box-border h-full w-full overflow-auto whitespace-pre-wrap p-3 font-mono text-[13px] leading-relaxed text-transparent"
        aria-hidden="true"
      ><span v-for="line in lines" :key="line.number" :data-status="line.status || undefined" :class="line.status ? `is-${line.status}` : undefined">{{ line.text }}</span></pre>
      <Textarea
        class="opt-bot-json-input absolute inset-0 z-[1] box-border h-full min-h-0 resize-y overflow-auto whitespace-pre-wrap rounded-none border-0 bg-transparent p-3 font-mono text-[13px] leading-relaxed caret-primary focus-visible:ring-0 focus-visible:outline-none"
        :aria-label="label"
        :model-value="modelValue"
        spellcheck="false"
        @update:model-value="emit('update:modelValue', String($event ?? ''))"
        @scroll="syncScroll"
      />
    </div>
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
