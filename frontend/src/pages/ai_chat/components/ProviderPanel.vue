<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import type { ChatgptProfile, ProviderInfo, ProviderUsage } from '../composables/useAiChat';

interface ProviderPanelProps {
  chatgpt: ProviderInfo;
  go: ProviderInfo;
  transitioning: boolean;
  loginVisible: boolean;
  loginInstructions: string;
  loginUrl: string;
  loginCode: string;
  profiles: ChatgptProfile[];
  profileId: string;
  usage: ProviderUsage;
}

const props = defineProps<ProviderPanelProps>();

const emit = defineEmits<{
  chatgptLogin: [mode: 'browser' | 'device'];
  chatgptCancel: [];
  chatgptDisconnect: [];
  goConnect: [];
  goDisconnect: [];
  profileChange: [profile: string];
}>();

const { t } = useI18n();

const goKey = defineModel<string>('goKey', { default: '' });

function usageLabel(windowDurationMinutes: number | undefined): string {
  if (windowDurationMinutes === 300) return '5h';
  if (windowDurationMinutes === 1440) return '24h';
  if (windowDurationMinutes === 10080) return '7d';
  if (windowDurationMinutes === 43200) return '30d';
  return 'Usage';
}

function onGoConnect(): void {
  emit('goConnect');
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div>
      <div class="text-micro font-bold tracking-label text-accent uppercase">{{ t('ai.chat.connectionTest') }}</div>
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
          class="inline-flex items-center gap-1.5 text-micro"
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
      <div v-if="props.profiles.length > 1" class="mb-2.5 grid gap-1.5">
        <span class="text-xs text-secondary">{{ t('ai.chat.profile') }}</span>
        <SelectRoot :model-value="props.profileId" @update:model-value="emit('profileChange', String($event))">
          <SelectTrigger :aria-label="t('ai.chat.profile')">
            <span>{{ props.profiles.find((profile) => profile.id === props.profileId)?.name || props.profileId }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="profile in props.profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      <div v-if="props.chatgpt.connected && (props.usage.email || props.usage.limits.length)" class="mb-2.5 grid gap-1.5 rounded-md border border-border-subtle bg-input p-2 text-xs text-secondary">
        <span v-if="props.usage.email" class="truncate">{{ props.usage.email }}</span>
        <template v-if="props.usage.limits.length">
          <div v-for="limit in props.usage.limits" :key="`${limit.windowDurationMins}-${limit.resetsAt}`" class="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
            <span>{{ usageLabel(limit.windowDurationMins) }}</span>
            <strong class="text-primary">{{ Math.max(0, Math.min(100, 100 - Number(limit.usedPercent || 0))).toFixed(1) }}% {{ t('ai.chat.usageRemaining') }}</strong>
            <progress class="col-span-2 h-1.5 w-full accent-success" max="100" :value="Math.max(0, Math.min(100, 100 - Number(limit.usedPercent || 0)))" :aria-label="`${usageLabel(limit.windowDurationMins)} ${t('ai.chat.usageRemaining')}`"></progress>
          </div>
        </template>
        <span v-else>{{ t('ai.chat.usageUnavailable') }}</span>
      </div>
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
        <div v-if="loginCode" class="my-1.5 font-mono text-xl font-bold tracking-label text-accent-soft">{{ loginCode }}</div>
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
        <span class="inline-flex items-center gap-1.5 text-micro" :class="go.connected ? 'text-success' : 'text-secondary'">
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
