<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { ProviderInfo } from '../composables/useAiChat';

interface ProviderPanelProps {
  chatgpt: ProviderInfo;
  go: ProviderInfo;
  transitioning: boolean;
  loginVisible: boolean;
  loginInstructions: string;
  loginUrl: string;
  loginCode: string;
}

const props = defineProps<ProviderPanelProps>();

const emit = defineEmits<{
  chatgptLogin: [mode: 'browser' | 'device'];
  chatgptCancel: [];
  chatgptDisconnect: [];
  goConnect: [];
  goDisconnect: [];
}>();

const { t } = useI18n();

const goKey = defineModel<string>('goKey', { default: '' });

function onGoConnect(): void {
  emit('goConnect');
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <div class="text-[11px] font-extrabold tracking-[0.14em] text-accent uppercase">{{ t('ai.chat.connectionTest') }}</div>
      <h1 class="mt-1 mb-0.5 text-2xl font-bold text-primary">{{ t('ai.chat.title') }}</h1>
      <p class="m-0 mb-4 text-sm text-secondary">{{ t('ai.chat.subtitle') }}</p>
      <div class="mb-4 rounded-lg border border-[rgba(251,191,36,.32)] bg-[rgba(251,191,36,.07)] p-3 text-xs text-[#fcd97a]">
        {{ t('ai.chat.notice') }}
      </div>
    </div>

    <!-- ChatGPT -->
    <section class="rounded-[10px] border border-border-default bg-panel p-3">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="font-bold text-primary">ChatGPT</span>
        <span
          class="inline-flex items-center gap-1.5 text-[11px]"
          :class="chatgpt.connected ? 'text-success' : chatgpt.available ? 'text-secondary' : 'text-danger'"
        >
          <span
            class="inline-block h-[7px] w-[7px] rounded-full"
            :class="chatgpt.connected ? 'bg-success shadow-[0_0_8px_rgba(52,211,153,.5)]' : chatgpt.available ? 'bg-secondary' : 'bg-danger'"
          ></span>
          {{ chatgpt.connected ? t('ai.chat.connected') + (chatgpt.plan ? ' · ' + chatgpt.plan : '') : chatgpt.available ? t('ai.chat.notConnected') : t('ai.chat.runtimeMissing') }}
        </span>
      </div>
      <p class="mb-2.5 text-xs text-secondary">{{ t('ai.chat.chatgptHelp') }}</p>
      <div class="flex gap-2">
        <button
          type="button"
          class="h-8 cursor-pointer rounded-md border-none bg-accent px-3 text-sm font-bold text-[#07111f] transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="transitioning || chatgpt.connected || !chatgpt.available"
          @click="emit('chatgptLogin', 'browser')"
        >{{ t('ai.chat.browserLogin') }}</button>
        <button
          type="button"
          class="h-8 cursor-pointer rounded-md border border-border-default bg-elevated px-3 text-sm text-primary transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="transitioning || chatgpt.connected || !chatgpt.available"
          @click="emit('chatgptLogin', 'device')"
        >{{ t('ai.chat.deviceCode') }}</button>
        <button
          v-if="chatgpt.connected"
          type="button"
          class="h-8 cursor-pointer rounded-md border border-[rgba(248,113,113,.35)] bg-transparent px-3 text-sm text-[#fecaca] transition-colors hover:border-danger disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="transitioning"
          @click="emit('chatgptDisconnect')"
        >{{ t('ai.chat.disconnect') }}</button>
      </div>
      <div v-if="loginVisible" class="mt-2.5 rounded-lg border border-border-default bg-[#0b1320] p-2.5">
        <div>{{ loginInstructions }}</div>
        <a class="mt-1.5 block break-all text-accent" :href="loginUrl" target="_blank" rel="noopener noreferrer">{{ loginUrl }}</a>
        <div v-if="loginCode" class="my-1.5 font-mono text-xl font-bold tracking-[0.08em] text-[#bfdbfe]">{{ loginCode }}</div>
        <button
          type="button"
          class="mt-1.5 h-8 cursor-pointer rounded-md border border-border-default bg-elevated px-3 text-sm text-primary transition-colors hover:border-accent"
          @click="emit('chatgptCancel')"
        >{{ t('ai.chat.cancelLogin') }}</button>
      </div>
    </section>

    <!-- OpenCode Go -->
    <section class="rounded-[10px] border border-border-default bg-panel p-3">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="font-bold text-primary">OpenCode</span>
        <span class="inline-flex items-center gap-1.5 text-[11px]" :class="go.connected ? 'text-success' : 'text-secondary'">
          <span class="inline-block h-[7px] w-[7px] rounded-full" :class="go.connected ? 'bg-success shadow-[0_0_8px_rgba(52,211,153,.5)]' : 'bg-secondary'"></span>
          {{ go.connected ? t('ai.chat.connected') : t('ai.chat.notConnected') }}
        </span>
      </div>
      <p class="mb-2.5 text-xs text-secondary">{{ t('ai.chat.goHelp') }}</p>
      <div v-if="!go.connected" class="flex gap-2">
        <input
          v-model="goKey"
          type="password"
          autocomplete="new-password"
          :placeholder="t('ai.chat.goKeyPlaceholder')"
          :aria-label="t('ai.chat.goKeyPlaceholder')"
          class="h-8 min-w-0 flex-1 rounded-md border border-border-default bg-[#0b1320] px-2 text-sm text-primary outline-none focus:border-accent"
        />
        <button
          type="button"
          class="h-8 shrink-0 cursor-pointer rounded-md border-none bg-accent px-3 text-sm font-bold text-[#07111f] transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-45"
          :disabled="transitioning"
          @click="onGoConnect"
        >{{ t('ai.chat.connect') }}</button>
      </div>
      <div v-if="!go.connected" class="mt-1.5 flex gap-2">
        <a
          class="inline-flex h-8 items-center justify-center rounded-md border border-border-default bg-elevated px-3 text-sm text-primary no-underline transition-colors hover:border-accent"
          href="/api/ai/providers/opencode-go/subscribe"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('ai.chat.getGo') }}</a>
      </div>
      <button
        v-if="go.connected"
        type="button"
        class="mt-1.5 h-8 cursor-pointer rounded-md border border-[rgba(248,113,113,.35)] bg-transparent px-3 text-sm text-[#fecaca] transition-colors hover:border-danger disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="transitioning"
        @click="emit('goDisconnect')"
      >{{ t('ai.chat.disconnect') }}</button>
    </section>
  </div>
</template>
