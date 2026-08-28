<script setup lang="ts">
/*
 * AI Chat page — the Vue port of frontend/ai_chat.html (1039 lines).
 *
 * Layout keeps the legacy two-pane geometry (providers + conversations
 * rail on the left, chat column on the right) inside AppShell's main
 * region; the legacy free-form palette is replaced by the Tailwind token
 * scale like every migrated page.
 */
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import { Button } from '@/shared/components/ui/button';
import { dialogsConfirm } from './lib/dialogs';
import { proposalActionLabel } from './lib/proposal';
import { useAiChat } from './composables/useAiChat';
import ChatToolbar from './components/ChatToolbar.vue';
import Composer from './components/Composer.vue';
import ConversationList from './components/ConversationList.vue';
import MessageList from './components/MessageList.vue';
import ProviderPanel from './components/ProviderPanel.vue';
import ProposalList from './components/ProposalList.vue';

const { t } = useI18n();

const store = useAiChat((key, params) => t(key, params ?? {}));

useAiPageContext({
  id: 'ai-chat',
  getContext: () => ({ section: 'Conversations' }),
});

onMounted(() => {
  document.title = t('ai.chat.documentTitle');
  void store.initialize();
});

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
      : t('ai.proposal.approveDetail', { autostart: preview.may_start_immediately ? t('ai.proposal.autostartEnabled') + ' ' : '' });
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
    // Detected (server-unaware) quick reply: send directly.
    void store.sendMessage(value);
    return;
  }
  void store.onQuickReplyAck(actionId, value);
}
</script>

<template>
  <AppShell class="ai-chat-shell" page-key="info_ai_chat" :page-title="t('ai.chat.title')">
    <template #status>
      <span class="text-xs text-secondary">{{ store.notice.value.message }}</span>
    </template>

    <div class="grid h-[calc(100dvh-112px)] grid-cols-[minmax(260px,330px)_1fr] gap-[var(--component-gap)] p-[var(--page-padding)] max-[780px]:grid-cols-1 max-[780px]:grid-rows-[auto_1fr]">
      <!-- Left pane: providers + conversations -->
      <aside class="min-h-0 overflow-y-auto border-r border-border-default bg-[#0d1521] p-[var(--component-gap)] max-[780px]:max-h-[min(220px,35dvh)] max-[780px]:border-r-0 max-[780px]:border-b">
        <ProviderPanel
          :chatgpt="store.chatgpt.value"
          :go="store.go.value"
          :transitioning="store.transitioning.value"
          :login-visible="store.loginBox.value.visible"
          :login-instructions="store.loginBox.value.instructions"
          :login-url="store.loginBox.value.url"
          :login-code="store.loginBox.value.code"
          :go-key="store.goKey.value"
          @update:go-key="store.goKey.value = $event"
          @chatgpt-login="store.startChatgptLogin"
          @chatgpt-cancel="store.cancelChatgptLogin"
          @chatgpt-disconnect="store.disconnectChatgpt"
          @go-connect="store.connectGo"
          @go-disconnect="store.disconnectGo"
        />
        <ConversationList
          class="mt-3"
          :conversations="store.conversations.value"
          :conversation-id="store.conversationId.value"
          @select="store.loadConversation"
        />
      </aside>

      <!-- Right pane: chat column -->
      <div class="flex min-h-0 min-w-0 flex-col">
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
          @provider-change="store.onProviderChange"
          @model-change="store.onModelChange"
          @refresh-health="store.refreshModelHealth"
          @new-chat="store.newChat(false)"
          @delete-chat="onDeleteChat"
        />

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

        <details v-if="store.reasoningSummary.value" class="mx-4 rounded-md border border-border-default bg-[#0b1320] p-2 text-xs text-[#bfdbfe]">
          <summary class="cursor-pointer">{{ t('ai.chat.reasoningSummary') }}</summary>
          <pre class="max-h-[180px] overflow-auto whitespace-pre-wrap text-secondary">{{ store.reasoningSummary.value }}</pre>
        </details>
        <details v-if="store.activityHistory.value" class="mx-4 rounded-md border border-border-default bg-[#0b1320] p-2 text-xs text-[#bfdbfe]">
          <summary class="cursor-pointer">{{ t('ai.chat.activity') }}</summary>
          <pre class="max-h-[180px] overflow-auto whitespace-pre-wrap text-secondary">{{ store.activityHistory.value }}</pre>
        </details>

        <div class="flex min-h-[29px] items-center gap-2 px-4 pt-1">
          <div
            class="min-w-0 flex-1 text-xs"
            :class="[
              store.notice.value.error ? 'text-danger' : 'text-secondary',
              store.notice.value.working ? 'inline-flex items-center gap-2' : '',
            ]"
            aria-live="polite"
          >
            <span v-if="store.notice.value.working" class="inline-block h-2 w-2 animate-spin rounded-full border-2 border-border-default border-t-accent"></span>
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
  </AppShell>
</template>

<style scoped>
/* Full-height chat column inside AppShell's padded main region. */
.ai-chat-shell :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  padding: 0;
}

.ai-chat-shell :deep(.app-shell__primary) {
  min-height: 0;
}
</style>
