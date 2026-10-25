<script setup lang="ts">
/*
 * Bring-your-own-key endpoints. The list is the surface — one card per
 * configured model showing what it can do — and adding, editing and testing
 * live in the shared Modal, which already carries Escape, focus trap and
 * scroll lock for the sidebar's narrow column.
 */
import { computed, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhCheck, PhCaretRight, PhImage, PhKey, PhPlus, PhWrench } from '@phosphor-icons/vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import PbIcon from '@/shared/components/PbIcon.vue';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Switch } from '@/shared/components/ui/switch';
import { Modal } from '@/shared/components/ui/modal';
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
const saved = ref(false);
const result = ref<CustomTestResult | null>(null);

const modalTitle = computed(() =>
  original.value ? t('ai.chat.customEdit') : t('ai.chat.customAdd'),
);

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
  saved.value = false;
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
  saved.value = false;
  open.value = true;
}

function onSave(): void {
  emit('save', currentForm(), original.value, (ok) => {
    if (!ok) return;
    form.api_key = '';
    saved.value = true;
    open.value = false;
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

/** Remove by id; the dialog only knows the id and the display name it edited. */
function onRemove(id: string, name: string): void {
  if (window.confirm(t('ai.chat.customConfirmDelete', { model: name }))) emit('remove', id);
}

function protocolLabel(model: Pick<CustomModel, 'protocol'>): string {
  return model.protocol === 'responses' ? t('ai.chat.customProtocolResponses') : t('ai.chat.customProtocolChat');
}

function contextLabel(tokens: number): string {
  const value = Number(tokens) || 0;
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

/** The endpoint without its scheme, which is noise at this width. */
function endpointLabel(baseUrl: string): string {
  return String(baseUrl || '').replace(/^https?:\/\//, '');
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

    <ul v-if="props.models.length" class="mb-2.5 grid list-none gap-2 pl-0">
      <li v-for="model in props.models" :key="model.id">
        <!-- The whole card opens the editor: the row is the affordance, and
             removing is a separate, deliberate control inside the dialog. -->
        <button
          type="button"
          class="group flex w-full items-start gap-2.5 rounded-md border border-border-subtle bg-input p-2.5 text-left transition-colors duration-snap ease-standard hover:border-border-default hover:bg-elevated focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          :disabled="props.transitioning"
          :data-testid="`custom-model-${model.id}`"
          @click="startEdit(model)"
        >
          <span class="min-w-0 flex-1">
            <span class="flex items-center gap-1.5">
              <span class="truncate text-sm font-semibold text-primary">{{ model.name }}</span>
              <span
                v-if="model.has_key"
                class="inline-flex shrink-0 items-center gap-1 rounded px-1 py-px text-micro text-success"
                :title="t('ai.chat.customKeyStored')"
              >
                <PbIcon :icon="PhKey" :size="11" />
              </span>
            </span>
            <span class="mt-0.5 block truncate font-mono text-micro text-secondary">{{ endpointLabel(model.base_url) }}</span>
            <span class="mt-1.5 flex flex-wrap items-center gap-1">
              <span class="rounded-sm border border-border-subtle px-1 py-px text-micro text-secondary">{{ protocolLabel(model) }}</span>
              <span class="rounded-sm border border-border-subtle px-1 py-px text-micro text-secondary">{{ contextLabel(model.context) }} ctx</span>
              <span v-if="model.image_input" class="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle px-1 py-px text-micro text-secondary">
                <PbIcon :icon="PhImage" :size="10" />{{ t('ai.chat.customTagImages') }}
              </span>
              <span v-if="model.tools" class="inline-flex items-center gap-0.5 rounded-sm border border-accent/30 px-1 py-px text-micro text-accent-soft">
                <PbIcon :icon="PhWrench" :size="10" />{{ t('ai.chat.customTagTools') }}
              </span>
              <span v-if="model.reasoning_variants.length" class="rounded-sm border border-border-subtle px-1 py-px text-micro text-secondary">
                {{ t('ai.chat.customTagEfforts', { efforts: model.reasoning_variants.map((variant) => variant.id).join(' / ') }) }}
              </span>
            </span>
          </span>
          <PbIcon :icon="PhCaretRight" :size="14" class="mt-1 shrink-0 text-secondary transition-colors group-hover:text-primary" />
        </button>
      </li>
    </ul>

    <Button v-if="!props.models.length" type="button" variant="primary" :disabled="props.transitioning" @click="startAdd">
      {{ t('ai.chat.customAdd') }}
    </Button>
    <Button v-else type="button" variant="primary" :disabled="props.transitioning" class="gap-1.5" @click="startAdd">
      <PbIcon :icon="PhPlus" :size="13" />{{ t('ai.chat.customAdd') }}
    </Button>
    <span v-if="saved" class="ml-2 inline-flex items-center gap-1 text-xs text-success">
      <PbIcon :icon="PhCheck" :size="12" />{{ t('ai.chat.customSaved') }}
    </span>

    <Modal
      :open="open"
      :title="modalTitle"
      :close-label="t('ai.chat.customCancel')"
      :description="t('ai.chat.customHelp')"
      panel-class="w-[min(560px,94vw)]"
      footer-class="-mx-5 -mb-5 mt-1 sticky bottom-0 border-t border-border-subtle bg-page px-5 py-3"
      @update:open="open = $event"
    >
      <form id="custom-model-form" class="grid gap-2.5" autocomplete="off" @submit.prevent="onSave">
        <div class="grid gap-1 text-xs text-secondary">
          <span id="custom-protocol-label">{{ t('ai.chat.customProtocol') }}</span>
          <SelectRoot v-model="form.protocol">
            <SelectTrigger aria-labelledby="custom-protocol-label">
              <span>{{ protocolLabel(form) }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="chat">{{ t('ai.chat.customProtocolChat') }}</SelectItem>
              <SelectItem value="responses">{{ t('ai.chat.customProtocolResponses') }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </div>
        <label class="grid gap-1 text-xs text-secondary">
          {{ t('ai.chat.customBaseUrl') }}
          <Input v-model="form.base_url" type="url" placeholder="https://api.example.com/v1" />
        </label>
        <label class="grid gap-1 text-xs text-secondary">
          {{ t('ai.chat.customApiKey') }}
          <Input
            v-model="form.api_key"
            type="password"
            autocomplete="new-password"
            :placeholder="original ? t('ai.chat.customKeyKeep') : t('ai.chat.customKeyOptional')"
          />
        </label>
        <div class="grid grid-cols-2 gap-2.5">
          <label class="grid gap-1 text-xs text-secondary">
            {{ t('ai.chat.customModelName') }}
            <Input v-model="form.model" placeholder="gpt-4.1" />
          </label>
          <label class="grid gap-1 text-xs text-secondary">
            {{ t('ai.chat.customDisplayName') }}
            <Input v-model="form.name" :placeholder="form.model" />
          </label>
          <label class="grid gap-1 text-xs text-secondary">
            {{ t('ai.chat.customContext') }}
            <Input v-model.number="form.context" type="number" min="1024" step="1024" />
          </label>
          <label class="grid gap-1 text-xs text-secondary">
            {{ t('ai.chat.customOutput') }}
            <Input v-model.number="form.output_limit" type="number" min="1" step="256" />
          </label>
        </div>
        <label class="grid gap-1 text-xs text-secondary">
          {{ t('ai.chat.customEfforts') }}
          <Input v-model="effortsText" placeholder="low, medium, high" />
        </label>
        <div class="grid gap-1.5 rounded-md border border-border-subtle bg-input px-2.5 py-2">
          <label class="flex items-center justify-between gap-2 text-xs text-secondary">
            {{ t('ai.chat.customImages') }}
            <Switch v-model="form.image_input" :aria-label="t('ai.chat.customImages')" />
          </label>
          <label class="flex items-center justify-between gap-2 text-xs text-secondary">
            {{ t('ai.chat.customTools') }}
            <Switch v-model="form.tools" :aria-label="t('ai.chat.customTools')" />
          </label>
        </div>

        <div v-if="parseEfforts().length" class="grid gap-1 text-xs text-secondary">
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
          <div v-if="result.error" class="break-words wrap-anywhere">{{ result.error }}</div>
          <div v-else-if="result.reply" class="break-words text-secondary wrap-anywhere">{{ result.reply }}</div>
        </div>

        <p class="m-0 text-xs text-warning-soft">{{ t('ai.chat.customPrivacy') }}</p>
      </form>

      <template #footer>
        <Button
          v-if="original"
          type="button"
          variant="danger"
          class="mr-auto"
          :disabled="testing || props.transitioning"
          @click="onRemove(original, form.name || form.model)"
        >{{ t('ai.chat.customDelete') }}</Button>
        <Button type="button" :disabled="testing || props.transitioning" @click="onTest">
          {{ testing ? t('ai.chat.customTesting') : t('ai.chat.customTest') }}
        </Button>
        <Button type="button" :disabled="testing || props.transitioning" @click="open = false">{{ t('ai.chat.customCancel') }}</Button>
        <Button form="custom-model-form" type="submit" variant="primary" :disabled="testing || props.transitioning">
          {{ t('ai.chat.customSave') }}
        </Button>
      </template>
    </Modal>
  </section>
</template>
