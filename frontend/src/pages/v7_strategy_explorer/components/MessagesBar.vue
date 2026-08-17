<script setup lang="ts">
/**
 * Page message list — the #messages section (:214) fed by setMessages
 * (:993-1003): the candle-load info filter lives in the store.
 */
import type { ExplorerStore } from '../composables/useStrategyExplorer';

const props = defineProps<{ store: ExplorerStore }>();
const list = () => props.store.messages.value;
</script>

<template>
  <section id="messages" class="messages" :hidden="!list().length">
    <div v-for="(msg, i) in list()" :key="i" :class="'message ' + (msg.level || 'info')">{{ msg.text || msg.message || '' }}</div>
  </section>
</template>
