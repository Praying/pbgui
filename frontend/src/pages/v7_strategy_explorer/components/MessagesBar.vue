<script setup lang="ts">
/**
 * Page message list — the #messages section (:214) fed by setMessages
 * (:993-1003): the candle-load info filter lives in the store.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhX } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import type { ExplorerStore } from '../composables/useStrategyExplorer';
import { serverMsg } from '@/shared/i18n';

const props = defineProps<{ store: ExplorerStore }>();
const list = () => props.store.messages.value;

const { t } = useI18n();
/** Dismissed message indices — local view state, the store keeps its list. */
const dismissed = ref(new Set<number>());
function dismiss(index: number): void {
  const next = new Set(dismissed.value);
  next.add(index);
  dismissed.value = next;
}

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
  <section id="messages" class="flex max-h-[30dvh] flex-col gap-2 overflow-y-auto" :hidden="!list().length || list().every((_, i) => dismissed.has(i))">
    <div v-for="(msg, i) in list()" v-show="!dismissed.has(i)" :key="i" class="flex items-start gap-2 border rounded-[9px] px-3.25 py-2.5" :class="messageClass(String(msg.level || 'info'))">
      <span class="min-w-0 flex-1">{{ serverMsg(String(msg.text || msg.message || '')) }}</span>
      <Button type="button" variant="ghost" size="sm" class="h-auto shrink-0 border-0 p-0.5" :aria-label="t('common.close')" @click="dismiss(i)"><PbIcon :icon="PhX" :size="12" /></Button>
    </div>
  </section>
</template>
