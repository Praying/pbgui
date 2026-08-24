<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ModelInfo, ReasoningVariant } from '../composables/useAiChat';

interface ChatToolbarProps {
  providerId: string;
  providers: Record<string, { connected?: boolean }>;
  modelId: string;
  models: ModelInfo[];
  effort: string;
  effortVariants: ReasoningVariant[];
  transitioning: boolean;
  busy: boolean;
  conversationId: string;
}

const props = defineProps<ChatToolbarProps>();

const emit = defineEmits<{
  'update:providerId': [value: string];
  'update:modelId': [value: string];
  'update:effort': [value: string];
  providerChange: [];
  modelChange: [];
  refreshHealth: [];
  newChat: [];
  deleteChat: [];
}>();

const { t } = useI18n();

const PROVIDER_LABELS: Array<[string, string]> = [
  ['chatgpt', 'ChatGPT'],
  ['opencode-zen', 'OpenCode Zen'],
  ['opencode-go', 'OpenCode Go'],
];

const connectedProviders = computed(() => PROVIDER_LABELS.filter(([id]) => (props.providers[id] || {}).connected));

const freeModels = computed(() => props.models.filter((model) => model.free));
const standardModels = computed(() => props.models.filter((model) => !model.free));

const effortSupported = computed(() => props.effortVariants.length > 0);

function modelLabel(model: ModelInfo): string {
  const health = model.health && model.health.status ? ' · ' + String(model.health.status).replace(/_/g, ' ') : '';
  return (
    model.name +
    (model.free ? ' · ' + t('ai.chat.free') : '') +
    (model.tools ? ' · ' + t('ai.chat.pbGuiTools') : ' · ' + t('ai.chat.chatOnly')) +
    (model.training ? ' · ' + t('ai.chat.trainingEnabled') : '') +
    health
  );
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2.5 border-b border-border-default bg-panel/90 px-4 py-3">
    <label class="text-xs text-secondary" for="provider-select">{{ t('ai.chat.provider') }}</label>
    <select
      id="provider-select"
      class="h-8 w-[145px] rounded-md border border-border-default bg-[#0b1320] px-2 text-sm text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      :value="providerId"
      :disabled="transitioning || busy || !connectedProviders.length"
      @change="emit('update:providerId', ($event.target as HTMLSelectElement).value); emit('providerChange')"
    >
      <option v-for="[id, label] in connectedProviders" :key="id" :value="id">{{ label }}</option>
    </select>

    <label class="text-xs text-secondary" for="model-select">{{ t('ai.chat.model') }}</label>
    <select
      id="model-select"
      class="h-8 min-w-[180px] max-w-[330px] rounded-md border border-border-default bg-[#0b1320] px-2 text-sm text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      :value="modelId"
      :disabled="transitioning || busy || !models.length"
      @change="emit('update:modelId', ($event.target as HTMLSelectElement).value); emit('modelChange')"
    >
      <optgroup v-if="freeModels.length" :label="t('ai.chat.free')">
        <option v-for="model in freeModels" :key="model.id" :value="model.id" :title="model.retention ? t('ai.chat.retention', { retention: model.retention }) : ''">
          {{ modelLabel(model) }}
        </option>
      </optgroup>
      <optgroup :label="t('ai.chat.models')">
        <option v-for="model in standardModels" :key="model.id" :value="model.id" :title="model.retention ? t('ai.chat.retention', { retention: model.retention }) : ''">
          {{ modelLabel(model) }}
        </option>
      </optgroup>
    </select>

    <template v-if="effortSupported">
      <label class="text-xs text-secondary" for="effort-select">{{ t('ai.chat.effort') }}</label>
      <select
        id="effort-select"
        class="h-8 w-[105px] rounded-md border border-border-default bg-[#0b1320] px-2 text-sm text-primary outline-none focus:border-accent disabled:cursor-not-allowed disabled:opacity-50"
        :value="effort"
        :disabled="transitioning || busy"
        @change="emit('update:effort', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('ai.chat.standardEffort') }}</option>
        <option v-for="variant in effortVariants" :key="variant.id" :value="variant.id" :title="String(variant.description || '')">
          {{ variant.label || variant.id }}
        </option>
      </select>
    </template>

    <span class="flex-1"></span>
    <button
      type="button"
      class="h-8 cursor-pointer rounded-md border border-border-default bg-elevated px-3 text-sm text-primary transition-colors hover:border-accent"
      @click="emit('refreshHealth')"
    >{{ t('ai.chat.checkFreeModels') }}</button>
    <button
      type="button"
      class="h-8 cursor-pointer rounded-md border border-border-default bg-elevated px-3 text-sm text-primary transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="transitioning"
      @click="emit('newChat')"
    >{{ t('ai.chat.newChat') }}</button>
    <button
      type="button"
      class="h-8 cursor-pointer rounded-md border border-[rgba(248,113,113,.35)] bg-transparent px-3 text-sm text-[#fecaca] transition-colors hover:border-danger disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="transitioning || !conversationId"
      @click="emit('deleteChat')"
    >{{ t('ai.chat.delete') }}</button>
  </div>
</template>
