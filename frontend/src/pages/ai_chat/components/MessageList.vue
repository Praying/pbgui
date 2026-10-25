<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhArrowCounterClockwise, PhArrowDown, PhCheck, PhCopy } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import PbIcon from '@/shared/components/PbIcon.vue';
import { useStreamingScroll } from '@/shared/composables/useStreamingScroll';
import { copyText } from '../lib/clipboard';
import { detectedQuickReplies } from '../lib/proposal';
import { renderAiMarkdown } from '../lib/aiMarkdown';
import type { ChatMessage, UiAction } from '../composables/useAiChat';

interface MessageListProps {
  messages: ChatMessage[];
  pendingMessage: string;
  busy: boolean;
  quickReplyAction: UiAction | null;
  /** Switching conversations jumps to the latest message of the new one. */
  conversationId?: string;
}

const props = withDefaults(defineProps<MessageListProps>(), { conversationId: '' });

const emit = defineEmits<{
  copied: [ok: boolean];
  rewind: [messageIndex: number];
  quickReply: [actionId: string, value: string];
}>();

const { t } = useI18n();

const scroller = useTemplateRef<HTMLElement>('scroller');
const transcript = useTemplateRef<HTMLElement>('transcript');

/* A reply streams in a token at a time; pinning blindly on every append
   would drag the view back down the moment the user scrolls up to re-read
   an earlier answer. useStreamingScroll only follows the tail while the
   user is already there and has not just scrolled. */
const scroll = useStreamingScroll();

/* Follow the transcript's size rather than the message rows: approval cards
   in the #tail slot arrive after the reply that asked for them, and a
   finished turn replaces the rows in one piece. */
let resizeObserver: ResizeObserver | null = null;

onMounted(() => {
  scroll.attach(scroller.value);
  if (transcript.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => scroll.pin(scroller.value));
    resizeObserver.observe(transcript.value);
  }
});

watch(
  () => props.conversationId,
  () => {
    void nextTick(() => scroll.scrollToBottom(scroller.value, false));
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

/* The copy icon turns into a check for a moment, like the breadcrumb copy
   button in WorkspaceHeader; the parent reports the outcome in its notice. */
const copiedIndex = ref<number | null>(null);
let copiedTimer: ReturnType<typeof setTimeout> | null = null;

async function onCopy(index: number, text: string): Promise<void> {
  const ok = await copyText(text);
  emit('copied', ok);
  if (!ok) return;
  copiedIndex.value = index;
  if (copiedTimer) clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => {
    copiedIndex.value = null;
  }, 1500);
}

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (copiedTimer) clearTimeout(copiedTimer);
});
</script>

<template>
  <div class="relative flex min-h-0 flex-1 flex-col">
  <div
    ref="scroller"
    class="min-h-0 flex-1 overflow-y-auto px-[max(18px,calc((100%-920px)/2))] py-5"
    @scroll.passive="scroll.onScroll"
  >
    <div v-if="!messages.length && !pendingMessage" class="grid min-h-full place-items-center text-center text-secondary">
      <div>
        <strong class="mb-1 block text-md text-primary">{{ t('ai.chat.emptyTitle') }}</strong>
        {{ t('ai.chat.emptyBody') }}
      </div>
    </div>

    <div ref="transcript">
      <!-- User turns are bubbles on the right; replies read as plain text
           across the column. The action row sits under each message and
           appears on hover/focus (always on touch screens). -->
      <div
        v-for="(message, index) in messages"
        :key="index"
        class="group/message mb-3 flex flex-col"
        :class="message.role === 'user' ? 'items-end' : 'items-start'"
        :data-message-index="index"
      >
        <div
          v-if="message.role === 'user'"
          class="max-w-[min(680px,85%)] whitespace-pre-wrap wrap-anywhere rounded-xl rounded-br-sm border border-accent/35 bg-accent/14 px-3.5 py-2 leading-relaxed text-primary"
        >{{ message.content }}</div>
        <div v-else class="w-full min-w-0">
          <div class="ai-markdown" v-html="renderAiMarkdown(message.content || '')"></div>
          <div v-if="quickReplies(message.content).length" class="mt-3 flex flex-wrap gap-1.5">
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
        <div
          class="mt-0.5 flex gap-0.5 opacity-0 transition-opacity duration-base ease-standard group-hover/message:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"
          :class="message.role === 'user' ? '-mr-1.5' : '-ml-1.5'"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7"
            :title="copiedIndex === index ? t('ai.chat.copied') : t('ai.chat.copy')"
            :aria-label="t('ai.chat.copy')"
            data-test="message-copy"
            @click="onCopy(index, message.content || '')"
          >
            <PbIcon :icon="copiedIndex === index ? PhCheck : PhCopy" :size="15" :class="copiedIndex === index ? 'text-success' : undefined" />
          </Button>
          <Button
            v-if="message.role === 'user'"
            type="button"
            variant="ghost"
            size="icon"
            class="size-7"
            :title="t('ai.chat.rewind')"
            :aria-label="t('ai.chat.rewind')"
            data-test="message-rewind"
            @click="emit('rewind', index)"
          >
            <PbIcon :icon="PhArrowCounterClockwise" :size="15" />
          </Button>
        </div>
      </div>

      <!-- The model is still on this turn; the notice row carries the
           announced text, so the dots stay out of the accessibility tree. -->
      <div v-if="busy && messages.length" class="mb-3 flex h-7 items-center gap-1" aria-hidden="true" data-test="typing-indicator">
        <span
          v-for="dot in 3"
          :key="dot"
          class="size-1.5 rounded-full bg-secondary motion-safe:animate-pulse"
          :style="{ animationDelay: `${(dot - 1) * 180}ms` }"
        ></span>
      </div>

      <!-- Cards that belong to the end of the conversation (pending approvals). -->
      <slot name="tail" />

      <!-- Persistent quick replies delivered by the server UI action -->
      <div v-if="quickReplyAction && quickReplyAction.payload" class="mb-3 w-fit max-w-full rounded-lg border border-border-subtle bg-panel p-3">
        <div>{{ quickReplyAction.payload.question || t('ai.chat.chooseOption') }}</div>
        <div class="mt-2.5 flex flex-wrap gap-1.5">
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

    <!-- Jump to the newest reply. Only while a reply is streaming and the
         user has scrolled away — otherwise the tail already follows. -->
    <Button
      v-if="scroll.isScrolledUp.value && busy"
      type="button"
      variant="secondary"
      size="sm"
      class="absolute bottom-3 left-1/2 -translate-x-1/2 gap-1 border-border-default bg-panel/90 shadow-md backdrop-blur-sm hover:bg-elevated"
      data-test="scroll-bottom"
      @click="scroll.scrollToBottom(scroller)"
    >
      <PbIcon :icon="PhArrowDown" :size="14" />
      {{ t('ai.chat.jumpToLatest') }}
    </Button>
  </div>
</template>

<style scoped>
/* Replies arrive as sanitized HTML (renderAiMarkdown), so their typography
   lives here instead of in utilities. The legacy surface styled the same
   markup through ai_message_view.css, which the Vue bundle never loads:
   without these rules every newline between tags rendered as a blank line
   and the UA block margins padded each reply top and bottom. */
.ai-markdown {
  min-width: 0;
  line-height: 1.7;
  overflow-wrap: break-word;
}

.ai-markdown > :deep(:first-child) {
  margin-top: 0;
}

.ai-markdown > :deep(:last-child) {
  margin-bottom: 0;
}

.ai-markdown :deep(p) {
  margin-block: 0.6em;
}

.ai-markdown :deep(:is(ul, ol)) {
  margin-block: 0.6em;
  padding-inline-start: 1.5em;
}

.ai-markdown :deep(li) {
  margin-block: 0.3em;
}

.ai-markdown :deep(li > :is(p, ul, ol)) {
  margin-block: 0.3em;
}

.ai-markdown :deep(li::marker) {
  color: var(--text-muted);
}

.ai-markdown :deep(:is(h1, h2, h3, h4)) {
  margin: 1.1em 0 0.45em;
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.4;
}

.ai-markdown :deep(h1) {
  font-size: var(--text-lg);
}

.ai-markdown :deep(h2) {
  font-size: var(--text-md);
}

.ai-markdown :deep(:is(h3, h4)) {
  font-size: var(--text-base);
}

.ai-markdown :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.ai-markdown :deep(a) {
  color: var(--accent-soft);
  text-decoration: none;
}

.ai-markdown :deep(a:hover) {
  text-decoration: underline;
}

.ai-markdown :deep(code) {
  padding: 0.1em 0.35em;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  font-size: 0.88em;
}

.ai-markdown :deep(pre) {
  margin-block: 0.75em;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.ai-markdown :deep(pre code) {
  padding: 0;
  border: 0;
  background: none;
  font-size: inherit;
}

.ai-markdown :deep(blockquote) {
  margin: 0.75em 0;
  padding: 0.2em 0 0.2em 0.9em;
  border-left: 3px solid rgb(var(--accent-rgb) / 0.45);
  color: var(--text-secondary);
}

.ai-markdown :deep(hr) {
  margin: 1em 0;
  border: 0;
  border-top: 1px solid var(--border-subtle);
}

.ai-markdown :deep(.ai-markdown-table-scroll) {
  max-width: 100%;
  margin-block: 0.75em;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}

.ai-markdown :deep(table) {
  font-size: var(--text-sm);
  line-height: 1.5;
}

.ai-markdown :deep(:is(th, td)) {
  min-width: 70px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: top;
}

.ai-markdown :deep(th) {
  position: sticky;
  top: 0;
  background: var(--surface-elevated);
  font-weight: 600;
  white-space: nowrap;
}

.ai-markdown :deep(tbody tr:last-child td) {
  border-bottom: 0;
}
</style>
