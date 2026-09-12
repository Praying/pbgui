<script setup lang="ts">
/**
 * Vue3 replacement for the legacy PB8 parameter-help overlay.
 *
 * The catalog is loaded only when the reference is opened, so PB7 pages and
 * normal PB8 page loads do not pay for documentation they do not display.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Modal } from '@/shared/components/ui/modal';

interface ParameterHelpEntry {
  text?: string;
  source?: string;
  heading?: string;
}

interface ParameterHelpResponse {
  entries?: Record<string, ParameterHelpEntry>;
}

const props = defineProps<{
  editor: 'backtest' | 'optimize';
}>();

const { t } = useI18n();
const isOpen = ref(false);
const isLoading = ref(false);
const loadError = ref('');
const searchText = ref('');
const entries = ref<Array<{ path: string; entry: ParameterHelpEntry }>>([]);
let hasLoaded = false;

const filteredEntries = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  const matchingEntries = query
    ? entries.value.filter(({ path, entry }) => `${path} ${entry.text || ''}`.toLowerCase().includes(query))
    : entries.value;
  return matchingEntries.slice(0, 250);
});

function plainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/([^\n])\n(?=[A-Za-z`(])/g, '$1 ')
    .trim();
}

async function loadEntries(): Promise<void> {
  if (hasLoaded || isLoading.value) return;
  isLoading.value = true;
  loadError.value = '';
  try {
    const basePrefix = getBoot().base_prefix;
    const response = await apiFetch<ParameterHelpResponse>(`${basePrefix}/api/v8/parameter-help`);
    entries.value = Object.entries(response.entries || {})
      .map(([path, entry]) => ({ path, entry }))
      .sort((left, right) => left.path.localeCompare(right.path));
    hasLoaded = true;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoading.value = false;
  }
}

function openReference(): void {
  isOpen.value = true;
}

function closeReference(): void {
  isOpen.value = false;
}

watch(isOpen, (open) => {
  if (open) void loadEntries();
});
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="sm"
    class="h-8.5 shrink-0 gap-1.5 text-compact font-medium"
    data-test="pb8-parameter-help-open"
    @click="openReference"
  >
    {{ t('pb8ParameterHelp.open') }}
  </Button>

  <Modal
    :open="isOpen"
    :title="t('pb8ParameterHelp.title')"
    :description="t('pb8ParameterHelp.description')"
    :panel-class="'w-[min(900px,96vw)]'"
    :close-label="t('common.close')"
    @update:open="isOpen = $event"
    @cancel="closeReference"
  >
    <div class="grid min-h-0 gap-3">
      <p class="text-sm leading-relaxed text-secondary">{{ t(`pb8ParameterHelp.${props.editor}Description`) }}</p>
      <Input
        v-model="searchText"
        type="search"
        :placeholder="t('pb8ParameterHelp.searchPlaceholder')"
        :aria-label="t('pb8ParameterHelp.searchPlaceholder')"
        data-test="pb8-parameter-help-search"
      />
      <div v-if="isLoading" class="rounded-lg border border-border-subtle bg-card p-4 text-sm text-secondary" role="status">
        {{ t('pb8ParameterHelp.loading') }}
      </div>
      <div v-else-if="loadError" class="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger-soft" role="alert">
        {{ loadError }}
      </div>
      <div v-else-if="!filteredEntries.length" class="rounded-lg border border-border-subtle bg-card p-4 text-sm text-secondary">
        {{ t('pb8ParameterHelp.empty') }}
      </div>
      <div v-else class="grid max-h-[56dvh] min-h-0 gap-2 overflow-y-auto pr-1" data-test="pb8-parameter-help-list">
        <article v-for="item in filteredEntries" :key="item.path" class="rounded-lg border border-border-subtle bg-card px-3.5 py-3">
          <code class="break-all text-xs font-semibold text-accent-soft">{{ item.path }}</code>
          <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-secondary">{{ plainText(item.entry.text || '') }}</p>
          <p v-if="item.entry.source" class="mt-1 text-micro text-disabled">{{ item.entry.source }}<span v-if="item.entry.heading"> · {{ item.entry.heading }}</span></p>
        </article>
      </div>
    </div>

    <template #footer>
      <Button type="button" variant="ghost" @click="closeReference">{{ t('common.close') }}</Button>
    </template>
  </Modal>
</template>
