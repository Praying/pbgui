<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
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
const selectedArchive = ref('');
const selectedPath = ref('');
const collision = ref<'error' | 'copy' | 'overwrite'>('error');
const error = ref('');

watch(() => props.open, (open) => {
  if (!open) return;
  source.value = 'local'; name.value = ''; raw.value = ''; selectedPath.value = ''; error.value = '';
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
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  raw.value = await file.text();
  name.value = file.name.replace(/\.json$/i, '');
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
  <div v-if="open" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop">
    <section class="flex w-[min(900px,calc(100vw-30px))] max-h-[min(760px,calc(100vh-30px))] max-h-[min(760px,calc(100dvh-30px))] flex-col rounded-lg border border-border-default bg-panel shadow-[0_20px_50px_rgba(5,8,14,0.45)]" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-default px-3.5 py-3"><h2>{{ t('v7optimize.importOptimizeConfig') }}</h2><button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="opt-source-tabs flex gap-1"><button :class="{ active: source === 'local' }" @click="source = 'local'">{{ t('v7optimize.pasteOrFile') }}</button><button :class="{ active: source === 'archive' }" @click="source = 'archive'">{{ t('v7optimize.backtestArchive') }}</button></div>
      <div class="grid min-h-0 gap-3 overflow-auto p-3.5">
        <label class="grid gap-1.5 text-xs text-secondary">{{ t('v7optimize.configName') }}<input v-model="name" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary" /></label>
        <template v-if="source === 'local'">
          <input type="file" accept="application/json,.json" @change="readFile" />
          <textarea v-model="raw" class="w-full min-h-[220px] resize-y rounded-sm border border-border-default bg-page p-2.5 font-mono text-xs leading-[1.45] text-primary" :placeholder="t('editor.optimize.importPlaceholder', { version: 'PB' })" />
        </template>
        <template v-else>
          <label class="grid gap-1.5 text-xs text-secondary">{{ t('v7optimize.backtestArchive') }}<select class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary" :value="selectedArchive" @change="chooseArchive(($event.target as HTMLSelectElement).value)"><option value="">{{ t('v7optimize.chooseArchive') }}</option><option v-for="archive in archives" :key="archive.name" :value="archive.name">{{ archive.name }} ({{ archive.optimize_configs || 0 }})</option></select></label>
          <label class="grid gap-1.5 text-xs text-secondary">{{ t('v7optimize.archivedConfig') }}<select v-model="selectedPath" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary"><option value="">{{ t('v7optimize.chooseConfig') }}</option><option v-for="item in configs" :key="item.path" :value="item.path">{{ item.name || item.relative_path || item.path }}</option></select></label>
          <label class="grid gap-1.5 text-xs text-secondary">Collision<select v-model="collision" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary"><option value="error">Ask on conflict</option><option value="copy">{{ t('v7optimize.importAsCopy') }}</option><option value="overwrite">{{ t('v7optimize.overwrite') }}</option></select></label>
        </template>
        <p v-if="error" class="text-danger-soft">{{ error }}</p>
      </div>
      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-3.5 py-3"><button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" @click="emit('close')">{{ t('common.cancel') }}</button><button class="min-h-[30px] cursor-pointer rounded-sm border border-accent/55 bg-accent/18 px-2.5 py-1.25 text-accent" :disabled="busy" @click="submit">{{ t('v7optimize.importToEditor') }}</button></footer>
    </section>
  </div>
</template>

<style scoped>
/* Source tab strip ported from styles/optimize.css. */
.opt-source-tabs button {
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-secondary);
  padding: 9px 10px;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.opt-source-tabs button:hover { color: var(--text-primary); }

.opt-source-tabs button.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
}
</style>
