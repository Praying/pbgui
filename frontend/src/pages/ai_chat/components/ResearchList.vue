<script setup lang="ts">
import { computed } from 'vue';
import { Button } from '@/shared/components/ui/button';
import { renderAiMarkdown } from '../lib/aiMarkdown';
import type { ResearchItem } from '../composables/useAiChat';

const props = defineProps<{ items: ResearchItem[] }>();

const emit = defineEmits<{
  action: [id: string, action: 'start' | 'cancel'];
}>();

function isRunning(item: ResearchItem): boolean {
  return item.status === 'running';
}

function statusText(item: ResearchItem): string {
  if (item.error) return `Stopped: ${item.error}`;
  if (item.status === 'preview') return 'Review the prompt, then approve research.';
  if (item.status === 'budget_review') return `Jev estimate exceeds the approved USD ${Number(item.jev_previous_budget_usd || 0).toFixed(6)} budget.`;
  if (isRunning(item)) return item.phase === 'summary' ? 'Preparing final analysis...' : item.jev_questions ? 'Web research running; Jev next.' : 'Web research running.';
  if (item.summary_error) return `Research completed; final analysis failed: ${item.summary_error}`;
  if (item.status === 'completed') return 'Research completed.';
  if (item.status === 'cancelled') return 'Research cancelled.';
  if (item.status === 'expired') return 'Preview expired. Ask for a new one.';
  return String(item.status || 'Unknown');
}

const visibleItems = computed(() => props.items.filter((item) => /^[a-f0-9]{32}$/.test(item.id)));
</script>

<template>
  <section
    v-for="item in visibleItems"
    :key="item.id"
    class="ai-research-card mx-4 mb-3 rounded-lg border border-accent/30 bg-accent/8 p-3"
    :data-research-id="item.id"
    aria-label="Web research"
  >
    <div class="flex flex-wrap items-center justify-between gap-2">
      <strong class="text-sm text-accent-soft">{{ item.kind === 'jev' ? 'Jev research analysis' : 'Web research' }}</strong>
      <span class="text-xs text-secondary">{{ item.provider }} · {{ item.model }}</span>
    </div>
    <pre class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-primary">{{ item.prompt }}</pre>
    <details v-if="item.instructions" class="mt-2 text-xs text-secondary">
      <summary class="cursor-pointer text-accent-soft">Fixed instructions and limits</summary>
      <pre class="mt-1 whitespace-pre-wrap">{{ item.instructions }}</pre>
    </details>
    <pre v-if="item.jev_questions" class="mt-2 max-h-32 overflow-auto whitespace-pre-wrap text-xs text-secondary">Jev follow-up · max USD {{ item.jev_max_cost_usd }}
{{ JSON.stringify(item.jev_questions, null, 2) }}</pre>
    <div class="mt-2 flex flex-wrap items-center justify-between gap-2" :data-state="item.status">
      <p class="m-0 text-xs text-secondary" role="status">{{ statusText(item) }}</p>
      <div class="flex flex-wrap gap-1.5">
        <Button
          v-if="item.status === 'preview' || item.status === 'budget_review'"
          type="button"
          variant="primary"
          :disabled="isRunning(item)"
          @click="emit('action', item.id, 'start')"
        >{{ item.status === 'budget_review' ? `Approve Jev up to USD ${Number(item.jev_max_cost_usd || 0).toFixed(6)}` : 'Approve research' }}</Button>
        <Button
          v-if="item.status === 'preview' || item.status === 'budget_review'"
          type="button"
          variant="ghost"
          @click="emit('action', item.id, 'cancel')"
        >Reject</Button>
        <Button v-if="isRunning(item)" type="button" variant="danger" @click="emit('action', item.id, 'cancel')">Cancel research</Button>
      </div>
    </div>
    <pre v-if="item.answer" class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-secondary">{{ item.answer }}</pre>
    <pre v-if="item.jev_answer" class="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-secondary">Jev analysis
{{ item.jev_answer }}</pre>
    <div v-if="item.summary" class="ai-research-summary mt-2 text-sm text-primary" v-html="renderAiMarkdown(item.summary)"></div>
  </section>
</template>
