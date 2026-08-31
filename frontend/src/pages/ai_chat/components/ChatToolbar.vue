<script setup lang="ts">
/*
 * Chat toolbar — provider/model/effort selectors + conversation actions.
 *
 * ui-migration: the legacy effort <select> carried an empty-value option
 * ("Standard") to reset the effort; the reka listbox reserves "" for the
 * cleared state and has no reset row, so Standard is now the placeholder
 * shown while no effort variant is picked (re-picking Standard after
 * choosing a variant is no longer possible — modern listbox UX).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import {
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
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

/* Trigger labels render from the model — the listbox options are lazily
   mounted, so a programmatically set value has no option text to read. */
const providerTriggerLabel = computed(() => PROVIDER_LABELS.find(([id]) => id === props.providerId)?.[1] ?? '');

const modelTriggerLabel = computed(() => {
  const model = props.models.find((m) => m.id === props.modelId);
  return model ? modelLabel(model) : '';
});

const effortTriggerLabel = computed(() => {
  const variant = props.effortVariants.find((v) => v.id === props.effort);
  return variant ? variant.label || variant.id : '';
});

function onProviderSelect(value: unknown): void {
  emit('update:providerId', String(value ?? ''));
  emit('providerChange');
}

function onModelSelect(value: unknown): void {
  emit('update:modelId', String(value ?? ''));
  emit('modelChange');
}

function onEffortSelect(value: unknown): void {
  emit('update:effort', String(value ?? ''));
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2.5 border-b border-border-subtle bg-panel px-4 py-3">
    <span id="provider-select-label" class="text-xs text-secondary">{{ t('ai.chat.provider') }}</span>
    <SelectRoot
      :model-value="providerId"
      :disabled="transitioning || busy || !connectedProviders.length"
      @update:model-value="onProviderSelect"
    >
      <SelectTrigger id="provider-select" class="w-[145px]" aria-labelledby="provider-select-label">
        <span>{{ providerTriggerLabel }}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="[id, label] in connectedProviders" :key="id" :value="id">{{ label }}</SelectItem>
      </SelectContent>
    </SelectRoot>

    <span id="model-select-label" class="text-xs text-secondary">{{ t('ai.chat.model') }}</span>
    <SelectRoot
      :model-value="modelId"
      :disabled="transitioning || busy || !models.length"
      @update:model-value="onModelSelect"
    >
      <SelectTrigger id="model-select" class="min-w-[180px] max-w-[330px]" aria-labelledby="model-select-label">
        <span>{{ modelTriggerLabel }}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup v-if="freeModels.length">
          <SelectLabel class="px-2 py-1.5 text-xs font-semibold uppercase tracking-label text-secondary">{{ t('ai.chat.free') }}</SelectLabel>
          <SelectItem
            v-for="model in freeModels"
            :key="model.id"
            :value="model.id"
            :title="model.retention ? t('ai.chat.retention', { retention: model.retention }) : ''"
          >
            {{ modelLabel(model) }}
          </SelectItem>
        </SelectGroup>
        <SelectGroup>
          <SelectLabel class="px-2 py-1.5 text-xs font-semibold uppercase tracking-label text-secondary">{{ t('ai.chat.models') }}</SelectLabel>
          <SelectItem
            v-for="model in standardModels"
            :key="model.id"
            :value="model.id"
            :title="model.retention ? t('ai.chat.retention', { retention: model.retention }) : ''"
          >
            {{ modelLabel(model) }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </SelectRoot>

    <template v-if="effortSupported">
      <span id="effort-select-label" class="text-xs text-secondary">{{ t('ai.chat.effort') }}</span>
      <SelectRoot
        :model-value="effort"
        :disabled="transitioning || busy"
        @update:model-value="onEffortSelect"
      >
        <SelectTrigger id="effort-select" class="w-[105px]" aria-labelledby="effort-select-label">
          <span :class="effortTriggerLabel ? undefined : 'text-placeholder'">{{ effortTriggerLabel || t('ai.chat.standardEffort') }}</span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="variant in effortVariants"
            :key="variant.id"
            :value="variant.id"
            :title="String(variant.description || '')"
          >
            {{ variant.label || variant.id }}
          </SelectItem>
        </SelectContent>
      </SelectRoot>
    </template>

    <span class="flex-1"></span>
    <Button
      type="button"
      @click="emit('refreshHealth')"
    >{{ t('ai.chat.checkFreeModels') }}</Button>
    <Button
      type="button"
      :disabled="transitioning"
      @click="emit('newChat')"
    >{{ t('ai.chat.newChat') }}</Button>
    <Button
      type="button"
      variant="danger"
      :disabled="transitioning || !conversationId"
      @click="emit('deleteChat')"
    >{{ t('ai.chat.delete') }}</Button>
  </div>
</template>
