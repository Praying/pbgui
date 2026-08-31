<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
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
  <section class="flex min-h-[180px] flex-col rounded-lg border border-border-subtle bg-panel p-3">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="font-bold text-primary">{{ t('ai.chat.conversations') }}</span>
      <span class="text-[11px] text-secondary">{{ conversations.length }}</span>
    </div>
    <div class="grid min-h-0 content-start gap-1.5 overflow-y-auto">
      <Button
        v-for="conversation in conversations"
        :key="conversation.conversation_id"
        type="button"
        class="h-auto min-h-[42px] w-full flex-col items-stretch gap-0 whitespace-normal p-2"
        :class="{ 'border-accent! bg-accent/14 text-accent-soft': conversation.conversation_id === conversationId }"
        @click="emit('select', conversation.conversation_id)"
      >
        <span class="block text-sm text-primary">{{ conversation.title || t('ai.chat.newChat') }}</span>
        <small class="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-secondary">{{ meta(conversation) }}</small>
      </Button>
      <p v-if="!conversations.length" class="m-0 text-xs text-secondary">{{ t('ai.chat.noConversations') }}</p>
    </div>
  </section>
</template>
