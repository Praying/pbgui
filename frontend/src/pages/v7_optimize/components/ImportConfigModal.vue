<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { PhDownloadSimple, PhFileText, PhX } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import type { ArchiveConfig, ArchiveSummary } from '../composables/useOptimizeActions';

const props = defineProps<{ open: boolean; archives: ArchiveSummary[]; configs: ArchiveConfig[]; archiveName: string; busy: boolean }>();
const emit = defineEmits<{
  close: [];
  loadArchives: [];
  loadConfigs: [archive: string];
  localImport: [config: Record<string, unknown>, name: string];
  archiveImport: [archive: string, path: string, name: string, collision: 'error' | 'copy' | 'overwrite'];
}>();
const { t } = useI18n();
const source = ref<'local' | 'archive'>('local');
const name = ref('');
const raw = ref('');
const fileName = ref('');
const selectedArchive = ref('');
const selectedPath = ref('');
const collision = ref<'error' | 'copy' | 'overwrite'>('error');
const error = ref('');

watch(() => props.open, (open) => {
  if (!open) return;
  source.value = 'local'; name.value = ''; raw.value = ''; fileName.value = ''; selectedPath.value = ''; error.value = '';
  selectedArchive.value = props.archiveName;
  emit('loadArchives');
});
watch(() => props.archiveName, (value) => { if (value && !selectedArchive.value) selectedArchive.value = value; });

function chooseArchive(value: string): void {
  selectedArchive.value = value;
  selectedPath.value = '';
  emit('loadConfigs', value);
}

async function readFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  raw.value = await file.text();
  fileName.value = file.name;
  name.value = file.name.replace(/\.json$/i, '');
  // Allow re-picking the same file after an edit elsewhere.
  input.value = '';
}

function submit(): void {
  error.value = '';
  if (source.value === 'archive') {
    if (!selectedArchive.value || !selectedPath.value) { error.value = t('v7optimize.chooseArchivedOptimizeConfigFirst'); return; }
    emit('archiveImport', selectedArchive.value, selectedPath.value, name.value, collision.value);
    return;
  }
  try {
    const parsed: unknown = JSON.parse(raw.value || '');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('v7optimize.invalidJson'));
    emit('localImport', parsed as Record<string, unknown>, name.value);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop p-3">
    <section
      class="flex max-h-full w-[min(720px,100%)] flex-col overflow-hidden rounded-xl border border-border-default bg-panel shadow-[var(--shadow-modal)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="opt-import-title"
    >
      <header class="flex shrink-0 items-start justify-between gap-4 border-b border-border-default bg-surface-deep/40 px-5 py-3.5 max-[600px]:px-4">
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent" aria-hidden="true">
            <PbIcon :icon="PhDownloadSimple" :size="17" />
          </div>
          <div class="min-w-0">
            <h2 id="opt-import-title" class="m-0 truncate text-[15px] font-bold tracking-tight text-primary">{{ t('v7optimize.importOptimizeConfig') }}</h2>
            <p class="mt-0.5 text-xs leading-snug text-secondary">{{ t('v7optimize.importConfigHint') }}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="size-8 shrink-0 p-0 text-secondary transition-colors hover:text-primary"
          :title="t('common.close')"
          :aria-label="t('common.close')"
          @click="emit('close')"
        ><PbIcon :icon="PhX" :size="17" /></Button>
      </header>

      <div class="shrink-0 border-b border-border-default bg-surface-deep/50 px-5 py-3 max-[600px]:px-4">
        <p class="opt-import-eyebrow m-0 mb-2">{{ t('v7optimize.importSource') }}</p>
        <nav class="opt-source-tabs flex items-center gap-1.5 overflow-x-auto" :aria-label="t('v7optimize.importSource')">
          <button type="button" :class="{ active: source === 'local' }" @click="source = 'local'">{{ t('v7optimize.pasteOrFile') }}</button>
          <button type="button" :class="{ active: source === 'archive' }" @click="source = 'archive'">{{ t('v7optimize.backtestArchive') }}</button>
        </nav>
      </div>

      <div class="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-5 max-[600px]:p-4">
        <label class="grid gap-1.5">
          <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.configName') }}</span>
          <Input v-model="name" class="h-9 text-[13.5px]" />
        </label>

        <template v-if="source === 'local'">
          <div class="grid gap-1.5">
            <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.importJsonFile') }}</span>
            <label class="flex h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg border border-border-default/70 bg-surface-deep/40 px-3 transition-colors hover:border-border-default hover:bg-surface-deep">
              <PbIcon :icon="PhFileText" :size="16" class="shrink-0 text-secondary" />
              <span class="min-w-0 flex-1 truncate text-[13px] font-medium" :class="fileName ? 'text-primary' : 'text-placeholder'">{{ fileName || t('v7optimize.importChooseJsonFile') }}</span>
              <input type="file" accept="application/json,.json" class="sr-only" @change="readFile" />
            </label>
          </div>
          <label class="grid gap-1.5">
            <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.importPasteJson') }}</span>
            <Textarea v-model="raw" class="min-h-[200px] text-[13px]" :placeholder="t('editor.optimize.importPlaceholder', { version: 'PB' })" />
          </label>
        </template>

        <template v-else>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid min-w-0 gap-1.5">
              <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.backtestArchive') }}</span>
              <SelectRoot :model-value="selectedArchive" @update:model-value="chooseArchive(String($event))">
                <SelectTrigger :aria-label="t('v7optimize.backtestArchive')"><span :class="selectedArchive ? undefined : 'text-placeholder'">{{ selectedArchive || t('v7optimize.chooseArchive') }}</span></SelectTrigger>
                <SelectContent><SelectItem v-for="archive in archives" :key="archive.name" :value="archive.name">{{ archive.name }} ({{ archive.optimize_configs || 0 }})</SelectItem></SelectContent>
              </SelectRoot>
            </label>
            <label class="grid min-w-0 gap-1.5">
              <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.archivedConfig') }}</span>
              <SelectRoot v-model="selectedPath">
                <SelectTrigger :aria-label="t('v7optimize.archivedConfig')"><span :class="selectedPath ? undefined : 'text-placeholder'">{{ selectedPath ? (configs.find((item) => item.path === selectedPath)?.name || configs.find((item) => item.path === selectedPath)?.relative_path || selectedPath) : t('v7optimize.chooseConfig') }}</span></SelectTrigger>
                <SelectContent><SelectItem v-for="item in configs" :key="item.path" :value="item.path">{{ item.name || item.relative_path || item.path }}</SelectItem></SelectContent>
              </SelectRoot>
            </label>
            <label class="grid min-w-0 gap-1.5">
              <span class="text-[13px] font-medium text-primary">{{ t('v7optimize.importCollision') }}</span>
              <SelectRoot v-model="collision">
                <SelectTrigger :aria-label="t('v7optimize.importCollision')"><span>{{ collision === 'error' ? t('v7optimize.importAskOnConflict') : collision === 'copy' ? t('v7optimize.importAsCopy') : t('v7optimize.overwrite') }}</span></SelectTrigger>
                <SelectContent><SelectItem value="error">{{ t('v7optimize.importAskOnConflict') }}</SelectItem><SelectItem value="copy">{{ t('v7optimize.importAsCopy') }}</SelectItem><SelectItem value="overwrite">{{ t('v7optimize.overwrite') }}</SelectItem></SelectContent>
              </SelectRoot>
            </label>
          </div>
        </template>

        <p v-if="error" class="m-0 rounded-lg border-l-2 border-danger bg-danger/15 px-3 py-2.5 text-[13px] leading-snug text-danger-soft" role="alert">{{ error }}</p>
      </div>

      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-5 py-3.5 max-[600px]:px-4">
        <Button type="button" variant="default" class="h-9 min-w-[104px] text-[13.5px] font-medium" @click="emit('close')">{{ t('common.cancel') }}</Button>
        <Button type="button" variant="info" class="h-9 min-w-[104px] text-[13.5px] font-medium" :disabled="busy" @click="submit">{{ t('v7optimize.importToEditor') }}</Button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
/* Eyebrow above the source switch — same accent-bar treatment as the
   ConfigEditorModal section headings, so both modals read as one system. */
.opt-import-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.opt-import-eyebrow::before {
  content: '';
  display: inline-block;
  width: 3.5px;
  height: 13px;
  border-radius: var(--radius-full);
  background: var(--accent);
}

/* Source switch: pill tabs, ported from the .opt-editor-tabs rules so
   the two modals share one tab language. */
.opt-source-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 34px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13.5px;
  font-weight: 500;
  padding: 0 14px;
  white-space: nowrap;
  transition: all var(--motion-fast) var(--ease-standard);
}

.opt-source-tabs button:hover {
  background: rgb(255 255 255 / 0.05);
  color: var(--text-primary);
}

.opt-source-tabs button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.opt-source-tabs button.active {
  background: rgb(var(--accent-rgb) / 0.16);
  border-color: rgb(var(--accent-rgb) / 0.35);
  color: var(--accent-soft);
  font-weight: 600;
}
</style>
