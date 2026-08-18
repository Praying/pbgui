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
  <div v-if="open" class="opt-modal-backdrop">
    <section class="opt-modal" role="dialog" aria-modal="true">
      <header class="opt-modal-head"><h2>{{ t('v7optimize.importOptimizeConfig') }}</h2><button class="opt-btn" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="opt-source-tabs"><button :class="{ active: source === 'local' }" @click="source = 'local'">{{ t('v7optimize.pasteOrFile') }}</button><button :class="{ active: source === 'archive' }" @click="source = 'archive'">{{ t('v7optimize.backtestArchive') }}</button></div>
      <div class="opt-modal-body">
        <label class="opt-form-label">{{ t('v7optimize.configName') }}<input v-model="name" class="opt-input" /></label>
        <template v-if="source === 'local'">
          <input type="file" accept="application/json,.json" @change="readFile" />
          <textarea v-model="raw" class="opt-json medium" :placeholder="t('editor.optimize.importPlaceholder', { version: 'PB' })" />
        </template>
        <template v-else>
          <label class="opt-form-label">{{ t('v7optimize.backtestArchive') }}<select class="opt-input" :value="selectedArchive" @change="chooseArchive(($event.target as HTMLSelectElement).value)"><option value="">{{ t('v7optimize.chooseArchive') }}</option><option v-for="archive in archives" :key="archive.name" :value="archive.name">{{ archive.name }} ({{ archive.optimize_configs || 0 }})</option></select></label>
          <label class="opt-form-label">{{ t('v7optimize.archivedConfig') }}<select v-model="selectedPath" class="opt-input"><option value="">{{ t('v7optimize.chooseConfig') }}</option><option v-for="item in configs" :key="item.path" :value="item.path">{{ item.name || item.relative_path || item.path }}</option></select></label>
          <label class="opt-form-label">Collision<select v-model="collision" class="opt-input"><option value="error">Ask on conflict</option><option value="copy">{{ t('v7optimize.importAsCopy') }}</option><option value="overwrite">{{ t('v7optimize.overwrite') }}</option></select></label>
        </template>
        <p v-if="error" class="opt-error">{{ error }}</p>
      </div>
      <footer class="opt-modal-actions"><button class="opt-btn" @click="emit('close')">{{ t('common.cancel') }}</button><button class="opt-btn primary" :disabled="busy" @click="submit">{{ t('v7optimize.importToEditor') }}</button></footer>
    </section>
  </div>
</template>
