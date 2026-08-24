<script setup lang="ts">
/**
 * Page message list — the #messages section (:214) fed by setMessages
 * (:993-1003): the candle-load info filter lives in the store.
 */
import type { ExplorerStore } from '../composables/useStrategyExplorer';

const props = defineProps<{ store: ExplorerStore }>();
const list = () => props.store.messages.value;

/* Message level colour sets — the former .message.info/.warning/.error
   border/background/text tints of styles/explorer.css. Each branch
   (neutral default included) returns the FULL colour set so the static
   utilities on the element never fight a dynamic one. */
function messageClass(level: string): string {
  if (level === 'error') return 'border-danger/38 bg-danger-deep/24 text-danger-soft';
  if (level === 'warning') return 'border-warning/45 bg-page/78 text-secondary';
  if (level === 'info') return 'border-accent/35 bg-page/78 text-secondary';
  return 'border-border-default bg-page/78 text-secondary';
}
</script>

<template>
  <section id="messages" class="flex flex-col gap-2" :hidden="!list().length">
    <div v-for="(msg, i) in list()" :key="i" class="border rounded-[9px] px-3.25 py-2.5" :class="messageClass(String(msg.level || 'info'))">{{ msg.text || msg.message || '' }}</div>
  </section>
</template>
