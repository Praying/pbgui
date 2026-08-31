<script setup lang="ts">
import { nextTick, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { detectedQuickReplies } from '../lib/proposal';
import type { ChatMessage, UiAction } from '../composables/useAiChat';

interface MessageListProps {
  messages: ChatMessage[];
  pendingMessage: string;
  busy: boolean;
  quickReplyAction: UiAction | null;
}

const props = defineProps<MessageListProps>();

const emit = defineEmits<{
  copy: [text: string];
  rewind: [messageIndex: number];
  quickReply: [actionId: string, value: string];
}>();

const { t } = useI18n();

const scroller = useTemplateRef<HTMLElement>('scroller');

watch(
  () => props.messages.length,
  () => {
    void nextTick(() => {
      if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
    });
  },
);

function quickReplies(text: string | undefined): string[] {
  return detectedQuickReplies(text);
}

const quickReplyPending = ref(false);

function onQuickReply(actionId: string, value: string): void {
  quickReplyPending.value = true;
  emit('quickReply', actionId, value);
}
</script>

<template>
  <div ref="scroller" class="min-h-0 flex-1 overflow-y-auto px-[max(18px,calc((100%-920px)/2))] py-5">
    <div v-if="!messages.length && !pendingMessage" class="grid min-h-full place-items-center text-center text-secondary">
      <div>
        <strong class="mb-1 block text-[17px] text-primary">{{ t('ai.chat.emptyTitle') }}</strong>
        {{ t('ai.chat.emptyBody') }}
      </div>
    </div>

    <div
      v-for="(message, index) in messages"
      :key="index"
      class="mb-4 flex items-start gap-1"
      :class="{ 'justify-end': message.role === 'user' }"
    >
      <div
        class="max-w-[min(760px,88%)] whitespace-pre-wrap break-anywhere rounded-lg border border-border-subtle p-3 shadow-panel"
        :class="message.role === 'user'
          ? 'border-accent/35 bg-accent/14 text-primary rounded-tr-sm'
          : 'bg-panel rounded-tl-sm'"
      >{{ message.content }}
        <div v-if="message.role !== 'user' && quickReplies(message.content).length" class="mt-2 flex flex-wrap gap-1 opacity-100">
          <Button
            v-for="choice in quickReplies(message.content)"
            :key="choice"
            type="button"
            size="sm"
            :title="choice"
            @click="emit('quickReply', '', choice.length > 80 ? choice.slice(0, 77) + '...' : choice)"
          >{{ choice.length > 80 ? choice.slice(0, 77) + '...' : choice }}</Button>
        </div>
      </div>
      <div class="flex gap-1 opacity-35 transition-opacity focus-within:opacity-100 hover:opacity-100">
        <Button
          type="button"
          size="sm"
          @click="emit('copy', message.content || '')"
        >{{ t('ai.chat.copy') }}</Button>
        <Button
          v-if="message.role === 'user'"
          type="button"
          size="sm"
          @click="emit('rewind', index)"
        >{{ t('ai.chat.rewind') }}</Button>
      </div>
    </div>

    <!-- Persistent quick replies delivered by the server UI action -->
    <div v-if="quickReplyAction && quickReplyAction.payload" class="mb-4 flex items-start gap-1">
      <div class="max-w-[min(760px,88%)] rounded-lg rounded-tl-sm border border-border-subtle bg-panel p-3 shadow-panel">
        <div>{{ quickReplyAction.payload.question || t('ai.chat.chooseOption') }}</div>
        <div class="mt-2 flex flex-wrap gap-1 opacity-100">
          <Button
            v-for="choice in quickReplyAction.payload.choices || []"
            :key="String(choice?.value || '')"
            type="button"
            size="sm"
            :disabled="quickReplyPending"
            @click="onQuickReply(quickReplyAction.action_id, String(choice?.value || '').trim())"
          >{{ choice?.label || '' }}</Button>
        </div>
      </div>
    </div>
  </div>
</template>
