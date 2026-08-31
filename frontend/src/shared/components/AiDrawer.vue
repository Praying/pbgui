<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { useAiDrawer } from '@/shared/ai/useAiDrawer';
import { Button } from '@/shared/components/ui/button';
import { dialogsConfirm } from '@/pages/ai_chat/lib/dialogs';
import { proposalActionLabel } from '@/pages/ai_chat/lib/proposal';
import { useAiChat } from '@/pages/ai_chat/composables/useAiChat';
import ChatToolbar from '@/pages/ai_chat/components/ChatToolbar.vue';
import Composer from '@/pages/ai_chat/components/Composer.vue';
import ConversationList from '@/pages/ai_chat/components/ConversationList.vue';
import MessageList from '@/pages/ai_chat/components/MessageList.vue';
import ProposalList from '@/pages/ai_chat/components/ProposalList.vue';

const { locale, t } = useI18n();
const drawer = useAiDrawer();
const store = useAiChat((key, params) => t(key, params ?? {}));
const historyOpen = ref(false);
const resizing = ref(false);
const initialized = ref(false);

const DRAWER_LABELS = {
  en: {
    resize: 'Resize AI drawer',
    history: 'History',
    title: 'PBGui AI',
    full: 'Full',
    fullTitle: 'Open full AI Chat',
    close: 'Collapse AI assistant',
    includeContext: 'Include page context',
  },
  zh: {
    resize: '调整 AI 对话框宽度',
    history: '历史记录',
    title: 'PBGui AI',
    full: '完整页面',
    fullTitle: '打开完整 AI 对话页',
    close: '收起 AI 助手',
    includeContext: '包含当前页面上下文',
  },
} as const;

function drawerText(key: keyof typeof DRAWER_LABELS.en): string {
  return DRAWER_LABELS[locale.value === 'zh' ? 'zh' : 'en'][key];
}

watch(
  () => drawer.isOpen.value,
  (open) => {
    if (!open || initialized.value) return;
    initialized.value = true;
    void store.initialize();
  },
  { immediate: true },
);

async function openFullChat(): Promise<void> {
  await drawer.closeDrawer();
  window.location.assign('/api/ai/main_page');
}

function onResizeStart(event: PointerEvent): void {
  if (window.innerWidth <= 760 || event.button !== 0) return;
  event.preventDefault();
  resizing.value = true;
  const onPointerMove = (moveEvent: PointerEvent): void => {
    drawer.drawerWidth.value = Math.min(
      Math.max(320, window.innerWidth - moveEvent.clientX),
      Math.min(640, window.innerWidth - 24),
    );
  };
  const onPointerUp = (): void => {
    resizing.value = false;
    drawer.saveWidth();
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
  };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

async function onRewind(messageIndex: number): Promise<void> {
  const confirmed = await dialogsConfirm({
    title: t('ai.chat.rewindTitle'),
    message: t('ai.chat.rewindMessage'),
    confirmText: t('ai.chat.rewind'),
  });
  if (!confirmed) return;
  const result = await store.rewindToMessage(messageIndex);
  store.draft.value = result.restored;
  if (result.restored) store.setNotice(t('ai.chat.rewound'));
}

async function onDeleteChat(): Promise<void> {
  const confirmed = await dialogsConfirm({
    title: t('ai.chat.deleteTitle'),
    message: t('ai.chat.deleteMessage'),
    confirmText: t('ai.chat.delete'),
  });
  if (confirmed) void store.deleteCurrentConversation();
}

async function onResolveProposal(proposal: Parameters<typeof store.resolveProposal>[0], approve: boolean): Promise<void> {
  if (!approve) {
    void store.resolveProposal(proposal, false);
    return;
  }
  const preview = proposal.preview || {};
  const approvalDetail =
    preview.action === 'python_analysis'
      ? t('ai.proposal.approvePythonDetail')
      : t('ai.proposal.approveDetail', {
          autostart: preview.may_start_immediately ? t('ai.proposal.autostartEnabled') + ' ' : '',
        });
  const confirmed = await dialogsConfirm({
    title: t('ai.proposal.approveTitle'),
    message: proposalActionLabel(preview.action, t) + ' ' + String(preview.name || ''),
    detail: approvalDetail,
    confirmText: t('ai.proposal.approve'),
  });
  if (confirmed) void store.resolveProposal(proposal, true);
}

async function onCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    store.setNotice(t('ai.chat.copied'));
  } catch {
    store.setNotice(t('ai.chat.clipboardDenied'), true);
  }
}

function onQuickReply(actionId: string, value: string): void {
  if (!actionId) {
    void store.sendMessage(value);
    return;
  }
  void store.onQuickReplyAck(actionId, value);
}
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-[180ms] ease-standard"
    enter-from-class="translate-x-full"
    leave-active-class="transition-transform duration-[180ms] ease-standard"
    leave-to-class="translate-x-full"
  >
    <aside
      v-if="drawer.isOpen.value"
      id="pbgui-ai-drawer"
      class="fixed top-[var(--nav-height)] right-0 bottom-0 z-[var(--z-help)] flex h-[calc(100dvh-var(--nav-height))] min-w-0 translate-x-0 flex-col overflow-hidden border-l border-border-default bg-page text-primary shadow-modal max-[760px]:!w-screen"
      :style="{ width: `${drawer.drawerWidth.value}px` }"
      aria-hidden="false"
    >
    <div
      class="absolute inset-y-0 -left-2 z-10 w-4 cursor-ew-resize touch-none hover:bg-accent/14 max-[760px]:hidden"
      :class="{ 'bg-accent/14': resizing }"
      role="separator"
      aria-orientation="vertical"
      :aria-label="drawerText('resize')"
      @pointerdown="onResizeStart"
    ></div>

    <header class="flex min-h-[54px] items-center gap-2 border-b border-border-subtle bg-panel px-3 py-2">
      <Button type="button" size="sm" :variant="historyOpen ? 'info' : 'default'" @click="historyOpen = !historyOpen">
        {{ drawerText('history') }}
      </Button>
      <strong class="min-w-0 flex-1 truncate text-md font-semibold">{{ drawerText('title') }}</strong>
      <Button type="button" size="sm" :title="drawerText('fullTitle')" @click="openFullChat">
        {{ drawerText('full') }}
      </Button>
      <Button type="button" size="sm" variant="danger" :disabled="!store.conversationId.value" @click="onDeleteChat">
        {{ t('ai.chat.delete') }}
      </Button>
      <Button type="button" size="sm" :aria-label="drawerText('close')" @click="drawer.closeDrawer">X</Button>
    </header>

    <ChatToolbar
      v-model:provider-id="store.providerId.value"
      v-model:model-id="store.modelId.value"
      v-model:effort="store.effort.value"
      :providers="store.providers.value"
      :models="store.models.value"
      :effort-variants="store.effortVariants.value"
      :transitioning="store.transitioning.value"
      :busy="store.busy.value"
      :conversation-id="store.conversationId.value"
      class="border-b border-border-subtle bg-panel px-3 py-2"
      @provider-change="store.onProviderChange"
      @model-change="store.onModelChange"
      @refresh-health="store.refreshModelHealth"
      @new-chat="store.newChat(false)"
      @delete-chat="onDeleteChat"
    />

    <div class="grid gap-2 border-b border-border-subtle bg-sidebar px-3 py-2 text-xs text-secondary">
      <label class="inline-flex items-center gap-2">
        <input id="pai-context-toggle" v-model="store.includeContext.value" type="checkbox" class="accent-accent">
        <span>{{ drawerText('includeContext') }}</span>
      </label>
    </div>

    <div class="min-h-0 flex-1" :class="historyOpen ? 'grid grid-cols-[184px_minmax(0,1fr)]' : 'grid grid-cols-1'">
      <ConversationList
        v-if="historyOpen"
        class="min-h-0 overflow-y-auto rounded-none border-0 border-r border-border-subtle"
        :conversations="store.conversations.value"
        :conversation-id="store.conversationId.value"
        @select="store.loadConversation"
      />
      <div class="flex min-h-0 min-w-0 flex-col">
        <MessageList
          :messages="store.messages.value"
          :pending-message="store.pendingMessage.value"
          :busy="store.busy.value"
          :quick-reply-action="store.quickReplyAction.value"
          @copy="onCopy"
          @rewind="onRewind"
          @quick-reply="onQuickReply"
        />
        <ProposalList :proposals="store.visibleProposals.value" @resolve="onResolveProposal" />
        <details v-if="store.reasoningSummary.value" class="mx-3 rounded-md border border-border-subtle bg-input p-2 text-xs text-accent-soft">
          <summary class="cursor-pointer">{{ t('ai.chat.reasoningSummary') }}</summary>
          <pre class="max-h-[160px] overflow-auto whitespace-pre-wrap text-secondary">{{ store.reasoningSummary.value }}</pre>
        </details>
        <details v-if="store.activityHistory.value" class="mx-3 rounded-md border border-border-subtle bg-input p-2 text-xs text-accent-soft">
          <summary class="cursor-pointer">{{ t('ai.chat.activity') }}</summary>
          <pre class="max-h-[160px] overflow-auto whitespace-pre-wrap text-secondary">{{ store.activityHistory.value }}</pre>
        </details>
        <div class="flex min-h-[34px] items-center gap-2 px-3 pt-1">
          <div class="min-w-0 flex-1 truncate text-xs" :class="store.notice.value.error ? 'text-danger' : 'text-secondary'" aria-live="polite">
            {{ store.notice.value.message }}
          </div>
          <Button
            v-if="store.conversationLastError.value && store.retryMessage.value && !store.busy.value"
            type="button"
            variant="danger"
            size="sm"
            @click="store.sendMessage(store.retryMessage.value)"
          >{{ t('ai.chat.retry') }}</Button>
        </div>
        <Composer
          v-model:draft="store.draft.value"
          :enabled="store.composerEnabled.value"
          :busy="store.busy.value"
          @send="store.sendMessage()"
          @stop="store.stopCurrentTurn"
        />
      </div>
    </div>
    </aside>
  </Transition>
</template>
