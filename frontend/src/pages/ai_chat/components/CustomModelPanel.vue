<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import type { CustomModel, CustomModelForm, CustomTestResult } from '../composables/useAiChat';

const props = defineProps<{
  models: CustomModel[];
  transitioning: boolean;
}>();

const emit = defineEmits<{
  save: [form: CustomModelForm, original: string, done: (saved: boolean) => void];
  remove: [model: string];
  test: [form: CustomModelForm, original: string, effort: string, done: (result: CustomTestResult) => void];
}>();

const { t } = useI18n();

const emptyForm = (): CustomModelForm => ({
  model: '',
  name: '',
  base_url: '',
  protocol: 'chat',
  context: 128000,
  output_limit: 8192,
  image_input: false,
  tools: true,
  reasoning_efforts: [],
  api_key: '',
});

const open = ref(false);
const original = ref('');
const form = reactive<CustomModelForm>(emptyForm());
const effortsText = ref('');
const testEffort = ref('');
const testing = ref(false);
const result = ref<CustomTestResult | null>(null);

function parseEfforts(): string[] {
  return effortsText.value.split(/[\s,]+/).filter(Boolean);
}

function currentForm(): CustomModelForm {
  return { ...form, reasoning_efforts: parseEfforts() };
}

function startAdd(): void {
  Object.assign(form, emptyForm());
  original.value = '';
  effortsText.value = '';
  testEffort.value = '';
  result.value = null;
  open.value = true;
}

function startEdit(model: CustomModel): void {
  Object.assign(form, {
    model: model.id,
    name: model.name,
    base_url: model.base_url,
    protocol: model.protocol,
    context: model.context,
    output_limit: model.output_limit,
    image_input: model.image_input,
    tools: model.tools,
    reasoning_efforts: model.reasoning_variants.map((variant) => variant.id),
    api_key: '',
  });
  original.value = model.id;
  effortsText.value = model.reasoning_variants.map((variant) => variant.id).join(', ');
  testEffort.value = '';
  result.value = null;
  open.value = true;
}

function onSave(): void {
  emit('save', currentForm(), original.value, (saved) => {
    if (saved) {
      form.api_key = '';
      open.value = false;
    }
  });
}

function onTest(): void {
  testing.value = true;
  result.value = null;
  emit('test', currentForm(), original.value, testEffort.value, (outcome) => {
    result.value = outcome;
    testing.value = false;
  });
}

function onRemove(model: CustomModel): void {
  if (window.confirm(t('ai.chat.customConfirmDelete', { model: model.name }))) emit('remove', model.id);
}
</script>

<template>
  <section class="rounded-lg border border-border-subtle bg-panel p-4 shadow-panel" data-testid="custom-model-panel">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="font-bold text-primary">{{ t('ai.chat.customProvider') }}</span>
      <span class="inline-flex items-center gap-1.5 text-micro" :class="props.models.length ? 'text-success' : 'text-secondary'">
        <span class="inline-block h-[7px] w-[7px] rounded-full" :class="props.models.length ? 'bg-success shadow-[0_0_8px_rgb(var(--success-rgb)/.35)]' : 'bg-secondary'"></span>
        {{ props.models.length ? t('ai.chat.customCount', { count: props.models.length }) : t('ai.chat.notConnected') }}
      </span>
    </div>
    <p class="mb-2.5 text-xs text-secondary">{{ t('ai.chat.customHelp') }}</p>

    <ul v-if="props.models.length" class="mb-2.5 flex flex-col gap-1.5">
      <li
        v-for="model in props.models"
        :key="model.id"
        class="flex items-center justify-between gap-2 rounded-md border border-border-subtle bg-input px-2.5 py-1.5 text-xs"
      >
        <span class="min-w-0">
          <span class="block truncate font-semibold text-primary">{{ model.name }}</span>
          <span class="block truncate text-secondary">{{ model.protocol === 'responses' ? 'Responses' : 'Chat Completions' }} · {{ model.base_url }}</span>
        </span>
        <span class="flex shrink-0 gap-1">
          <Button type="button" size="sm" :disabled="props.transitioning" @click="startEdit(model)">{{ t('ai.chat.customEdit') }}</Button>
          <Button type="button" size="sm" variant="danger" :disabled="props.transitioning" @click="onRemove(model)">{{ t('ai.chat.customDelete') }}</Button>
        </span>
      </li>
    </ul>

    <Button v-if="!open" type="button" variant="primary" :disabled="props.transitioning" @click="startAdd">{{ t('ai.chat.customAdd') }}</Button>

    <form v-else class="flex flex-col gap-2" autocomplete="off" @submit.prevent="onSave">
      <label class="flex flex-col gap-1 text-xs text-secondary">
        {{ t('ai.chat.customBaseUrl') }}
        <Input v-model="form.base_url" type="url" placeholder="https://api.example.com/v1" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-secondary">
        {{ t('ai.chat.customApiKey') }}
        <Input
          v-model="form.api_key"
          type="password"
          autocomplete="new-password"
          :placeholder="original ? t('ai.chat.customKeyKeep') : t('ai.chat.customKeyOptional')"
        />
      </label>
      <div class="flex flex-col gap-1 text-xs text-secondary">
        <span id="custom-protocol-label">{{ t('ai.chat.customProtocol') }}</span>
        <SelectRoot v-model="form.protocol">
          <SelectTrigger aria-labelledby="custom-protocol-label">
            <span>{{ form.protocol === 'responses' ? t('ai.chat.customProtocolResponses') : t('ai.chat.customProtocolChat') }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat">{{ t('ai.chat.customProtocolChat') }}</SelectItem>
            <SelectItem value="responses">{{ t('ai.chat.customProtocolResponses') }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>
      <label class="flex flex-col gap-1 text-xs text-secondary">
        {{ t('ai.chat.customModelName') }}
        <Input v-model="form.model" placeholder="gpt-4.1" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-secondary">
        {{ t('ai.chat.customDisplayName') }}
        <Input v-model="form.name" :placeholder="form.model" />
      </label>
      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-secondary">
          {{ t('ai.chat.customContext') }}
          <Input v-model.number="form.context" type="number" min="1024" step="1024" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-secondary">
          {{ t('ai.chat.customOutput') }}
          <Input v-model.number="form.output_limit" type="number" min="1" step="256" />
        </label>
      </div>
      <label class="flex flex-col gap-1 text-xs text-secondary">
        {{ t('ai.chat.customEfforts') }}
        <Input v-model="effortsText" placeholder="low, medium, high" />
      </label>
      <label class="flex items-center justify-between gap-2 text-xs text-secondary">
        {{ t('ai.chat.customImages') }}
        <Switch v-model="form.image_input" :aria-label="t('ai.chat.customImages')" />
      </label>
      <label class="flex items-center justify-between gap-2 text-xs text-secondary">
        {{ t('ai.chat.customTools') }}
        <Switch v-model="form.tools" :aria-label="t('ai.chat.customTools')" />
      </label>
      <p class="text-xs text-warning-soft">{{ t('ai.chat.customPrivacy') }}</p>

      <div v-if="parseEfforts().length" class="flex flex-col gap-1 text-xs text-secondary">
        <span id="custom-test-effort-label">{{ t('ai.chat.customTestEffort') }}</span>
        <SelectRoot v-model="testEffort">
          <SelectTrigger aria-labelledby="custom-test-effort-label">
            <span>{{ testEffort || t('ai.chat.customTestEffortNone') }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="effort in parseEfforts()" :key="effort" :value="effort">{{ effort }}</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>

      <div class="flex flex-wrap gap-2">
        <Button type="button" :disabled="testing || props.transitioning" @click="onTest">
          {{ testing ? t('ai.chat.customTesting') : t('ai.chat.customTest') }}
        </Button>
        <Button type="submit" variant="primary" :disabled="testing || props.transitioning">{{ t('ai.chat.customSave') }}</Button>
        <Button type="button" :disabled="props.transitioning" @click="open = false">{{ t('ai.chat.customCancel') }}</Button>
      </div>

      <div
        v-if="result"
        role="status"
        class="rounded-md border p-2 text-xs"
        :class="result.ok ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'"
        data-testid="custom-test-result"
      >
        <div class="font-semibold">
          {{ result.ok ? t('ai.chat.customTestOk', { seconds: result.elapsed_seconds }) : t('ai.chat.customTestFailed') }}
        </div>
        <div v-if="result.error" class="break-words">{{ result.error }}</div>
        <div v-else-if="result.reply" class="break-words text-secondary">{{ result.reply }}</div>
      </div>
    </form>
  </section>
</template>
