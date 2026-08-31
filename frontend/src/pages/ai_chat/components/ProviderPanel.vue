<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
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
      <div class="mb-4 rounded-lg border border-warning/35 bg-warning/14 p-3 text-xs text-warning-soft">
        {{ t('ai.chat.notice') }}
      </div>
    </div>

    <!-- ChatGPT -->
    <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="font-bold text-primary">ChatGPT</span>
        <span
          class="inline-flex items-center gap-1.5 text-[11px]"
          :class="chatgpt.connected ? 'text-success' : chatgpt.available ? 'text-secondary' : 'text-danger'"
        >
          <span
            class="inline-block h-[7px] w-[7px] rounded-full"
            :class="chatgpt.connected ? 'bg-success shadow-[0_0_8px_rgb(var(--success-rgb)/.35)]' : chatgpt.available ? 'bg-secondary' : 'bg-danger'"
          ></span>
          {{ chatgpt.connected ? t('ai.chat.connected') + (chatgpt.plan ? ' · ' + chatgpt.plan : '') : chatgpt.available ? t('ai.chat.notConnected') : t('ai.chat.runtimeMissing') }}
        </span>
      </div>
      <p class="mb-2.5 text-xs text-secondary">{{ t('ai.chat.chatgptHelp') }}</p>
      <div class="flex gap-2">
        <Button
          type="button"
          variant="primary"
          :disabled="transitioning || chatgpt.connected || !chatgpt.available"
          @click="emit('chatgptLogin', 'browser')"
        >{{ t('ai.chat.browserLogin') }}</Button>
        <Button
          type="button"
          :disabled="transitioning || chatgpt.connected || !chatgpt.available"
          @click="emit('chatgptLogin', 'device')"
        >{{ t('ai.chat.deviceCode') }}</Button>
        <Button
          v-if="chatgpt.connected"
          type="button"
          variant="danger"
          :disabled="transitioning"
          @click="emit('chatgptDisconnect')"
        >{{ t('ai.chat.disconnect') }}</Button>
      </div>
      <div v-if="loginVisible" class="mt-2.5 rounded-lg border border-border-subtle bg-input p-2.5">
        <div>{{ loginInstructions }}</div>
        <a class="mt-1.5 block break-all text-accent" :href="loginUrl" target="_blank" rel="noopener noreferrer">{{ loginUrl }}</a>
        <div v-if="loginCode" class="my-1.5 font-mono text-xl font-bold tracking-[0.08em] text-accent-soft">{{ loginCode }}</div>
        <Button
          type="button"
          class="mt-1.5"
          @click="emit('chatgptCancel')"
        >{{ t('ai.chat.cancelLogin') }}</Button>
      </div>
    </section>

    <!-- OpenCode Go -->
    <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel">
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="font-bold text-primary">OpenCode</span>
        <span class="inline-flex items-center gap-1.5 text-[11px]" :class="go.connected ? 'text-success' : 'text-secondary'">
          <span class="inline-block h-[7px] w-[7px] rounded-full" :class="go.connected ? 'bg-success shadow-[0_0_8px_rgb(var(--success-rgb)/.35)]' : 'bg-secondary'"></span>
          {{ go.connected ? t('ai.chat.connected') : t('ai.chat.notConnected') }}
        </span>
      </div>
      <p class="mb-2.5 text-xs text-secondary">{{ t('ai.chat.goHelp') }}</p>
      <div v-if="!go.connected" class="flex gap-2">
        <Input
          v-model="goKey"
          type="password"
          autocomplete="new-password"
          :placeholder="t('ai.chat.goKeyPlaceholder')"
          :aria-label="t('ai.chat.goKeyPlaceholder')"
          class="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="primary"
          class="shrink-0"
          :disabled="transitioning"
          @click="onGoConnect"
        >{{ t('ai.chat.connect') }}</Button>
      </div>
      <div v-if="!go.connected" class="mt-1.5 flex gap-2">
        <a
          class="inline-flex h-8 items-center justify-center rounded-sm border border-border-default bg-elevated px-3 text-sm text-primary no-underline transition-colors hover:border-accent"
          href="/api/ai/providers/opencode-go/subscribe"
          target="_blank"
          rel="noopener noreferrer"
        >{{ t('ai.chat.getGo') }}</a>
      </div>
      <Button
        v-if="go.connected"
        type="button"
        variant="danger"
        class="mt-1.5"
        :disabled="transitioning"
        @click="emit('goDisconnect')"
      >{{ t('ai.chat.disconnect') }}</Button>
    </section>
  </div>
</template>
