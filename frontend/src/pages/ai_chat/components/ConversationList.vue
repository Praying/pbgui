<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ConversationSummary } from '../composables/useAiChat';

interface ConversationListProps {
  conversations: ConversationSummary[];
  conversationId: string;
}

defineProps<ConversationListProps>();

const emit = defineEmits<{
  select: [conversationId: string];
}>();

const { t } = useI18n();

function meta(conversation: ConversationSummary): string {
  return (
    String(conversation.model || '') +
    (conversation.busy ? ' · ' + t('ai.chat.working') : conversation.last_error ? ' · ' + t('ai.chat.needsAttention') : '')
  );
}
</script>

<template>
  <section class="flex min-h-[180px] flex-col rounded-[10px] border border-border-default bg-panel p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="font-bold text-primary">{{ t('ai.chat.conversations') }}</span>
      <span class="text-[11px] text-secondary">{{ conversations.length }}</span>
    </div>
    <div class="grid min-h-0 content-start gap-1.5 overflow-y-auto">
      <button
        v-for="conversation in conversations"
        :key="conversation.conversation_id"
        type="button"
        class="min-h-[42px] cursor-pointer rounded-md border border-border-default bg-elevated p-2 text-left transition-colors hover:border-accent"
        :class="{ 'border-accent! bg-[rgba(96,165,250,.12)]': conversation.conversation_id === conversationId }"
        @click="emit('select', conversation.conversation_id)"
      >
        <span class="block text-sm text-primary">{{ conversation.title || t('ai.chat.newChat') }}</span>
        <small class="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-secondary">{{ meta(conversation) }}</small>
      </button>
      <p v-if="!conversations.length" class="m-0 text-xs text-secondary">{{ t('ai.chat.noConversations') }}</p>
    </div>
  </section>
</template>
