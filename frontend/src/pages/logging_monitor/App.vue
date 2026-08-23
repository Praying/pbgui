<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { apiFetch, ApiError } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import AppShell from '@/shared/components/AppShell.vue';
import type { PageSection } from '@/shared/navigation';
import EmptyState from '@/shared/components/EmptyState.vue';
import ErrorState from '@/shared/components/ErrorState.vue';
import LoadingSkeleton from '@/shared/components/LoadingSkeleton.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { loggingApiBase, loggingWsBase } from './config';
import type { LogFilesPayload, ManagedRotationRule, RotationPayload, RotationRule } from './types';

type PageView = 'logs' | 'settings';
type Viewer = { open(): void; close(): void; setFile?(name: string): void; fetchFile?(name: string): void };
type ViewerCtor = new (options: Record<string, unknown>) => Viewer;

const { t } = useI18n();
const view = ref<PageView>('logs');
const sections = computed<PageSection[]>(() => [
  { key: 'logs', label: t('sysmon.logViewer') },
  { key: 'settings', label: t('sysmon.settings') },
]);
function onSectionSelect(key: string): void {
  if (key === 'logs' || key === 'settings') view.value = key;
}
const files = ref<LogFilesPayload>({ files: [], sizes: {}, rotated: {} });
const rotation = ref<RotationPayload>({ default: { max_mb: 10, backup_count: 0 }, per_service: {}, managed_scopes: {} });
const currentFile = ref('');
const selectedVariant = ref('current');
const loading = ref(true);
const error = ref('');
const viewerUnavailable = ref(false);
const purgeOpen = ref(false);
const purging = ref(false);
const savingScope = ref('');
const messages = ref<Record<string, string>>({});
const messageTimers = new Map<string, number>();
let viewer: Viewer | null = null;

const variants = computed(() => files.value.rotated[currentFile.value] || []);
const managedRows = computed(() => Object.entries(rotation.value.managed_scopes).sort(([a], [b]) => a.localeCompare(b)));
const serviceRows = computed(() => Object.entries(rotation.value.per_service).sort(([a], [b]) => a.localeCompare(b)));

function detail(errorValue: unknown): string {
  if (errorValue instanceof ApiError) return errorValue.detail;
  return errorValue instanceof Error ? errorValue.message : String(errorValue);
}
function normalizedRule(rule: RotationRule): RotationRule {
  const maxMb = Number(rule.max_mb);
  const copies = Number(rule.backup_count);
  return {
    max_mb: Number.isFinite(maxMb) ? Math.max(1, Math.trunc(maxMb)) : 10,
    backup_count: Number.isFinite(copies) ? Math.max(0, Math.trunc(copies)) : 0,
  };
}
async function loadFiles(): Promise<void> {
  files.value = await apiFetch<LogFilesPayload>(loggingApiBase());
}
async function loadRotation(): Promise<void> {
  rotation.value = await apiFetch<RotationPayload>(`${loggingApiBase()}/rotation`);
}
async function initialize(): Promise<void> {
  loading.value = true;
  error.value = '';
  try { await Promise.all([loadFiles(), loadRotation()]); }
  catch (caught) { error.value = detail(caught); }
  finally { loading.value = false; }
}
function showMessage(scope: string, text: string): void {
  messages.value = { ...messages.value, [scope]: text };
  const existing = messageTimers.get(scope);
  if (existing !== undefined) window.clearTimeout(existing);
  messageTimers.set(scope, window.setTimeout(() => {
    const next = { ...messages.value };
    delete next[scope];
    messages.value = next;
    messageTimers.delete(scope);
  }, 2500));
}
async function saveRule(scope: string, rule: RotationRule): Promise<void> {
  savingScope.value = scope;
  error.value = '';
  try {
    const normalized = normalizedRule(rule);
    rule.max_mb = normalized.max_mb;
    rule.backup_count = normalized.backup_count;
    const result = await apiFetch<{ success: boolean; apply?: { message?: string } }>(`${loggingApiBase()}/rotation`, {
      method: 'POST',
      body: JSON.stringify({ scope, ...normalized }),
    });
    if (result.success) showMessage(scope, result.apply?.message ? serverMsg(result.apply.message) : t('sysmon.saved'));
  } catch (caught) { error.value = detail(caught); }
  finally { savingScope.value = ''; }
}
function onFileChange(filename: string): void {
  currentFile.value = filename;
  selectedVariant.value = 'current';
}
function selectVariant(value: string): void {
  selectedVariant.value = value;
  if (!viewer || !currentFile.value) return;
  if (value === 'current') viewer.setFile?.(currentFile.value);
  else viewer.fetchFile?.(value);
}
async function confirmPurge(): Promise<void> {
  if (!currentFile.value) return;
  purging.value = true;
  error.value = '';
  try {
    await apiFetch(`${loggingApiBase()}/purge/${encodeURIComponent(currentFile.value)}`, { method: 'POST', body: '{}' });
    purgeOpen.value = false;
    await loadFiles();
    viewer?.setFile?.(currentFile.value);
  } catch (caught) { error.value = detail(caught); }
  finally { purging.value = false; }
}
function installViewer(): void {
  const Ctor = (window as Window & { LogViewerPanel?: ViewerCtor }).LogViewerPanel;
  if (typeof Ctor !== 'function') { viewerUnavailable.value = true; return; }
  viewer = new Ctor({
    containerId: 'logging-viewer-target',
    wsBase: loggingWsBase(),
    defaultHost: 'local',
    presets: 'system',
    showRestart: true,
    height: '100%',
    onFileChange,
  });
  viewer.open();
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && purgeOpen.value) purgeOpen.value = false;
}

onMounted(() => {
  document.title = t('sysmon.loggingTitle');
  installViewer();
  void initialize();
  window.addEventListener('keydown', onKeydown);
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = () => (window as Window & { PBGuiSharedHelp?: { open?: (topic: string) => void } }).PBGuiSharedHelp?.open?.('logging');
});
onBeforeUnmount(() => {
  viewer?.close();
  messageTimers.forEach((timer) => window.clearTimeout(timer));
  window.removeEventListener('keydown', onKeydown);
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="operations-shell operations-shell--logging"
    page-key="system_logging"
    :page-title="t('sysmon.loggingTitle')"
    :page-description="t('sysmon.logging')"
    :sections="sections"
    :active-section="view"
    @update:section="onSectionSelect"
  >
    <template #status>
      <StatusStrip
        :label="t('sysmon.status')"
        :value="loading ? t('sysmon.loading') : error ? t('common.error') : t('sysmon.connected')"
        :tone="loading ? 'warning' : error ? 'danger' : 'success'"
      />
    </template>

  <div id="page-body" class="logging-page">
    <div class="logging-main">
      <section v-show="view === 'logs'" class="logging-view">
        <div v-if="currentFile" class="logging-toolbar">
          <label v-if="variants.length">{{ t('sysmon.version') }}
            <select data-field="rotation-version" :value="selectedVariant" @change="selectVariant(($event.target as HTMLSelectElement).value)">
              <option value="current">{{ t('sysmon.current') }}</option>
              <option v-for="variant in variants" :key="variant" :value="variant">{{ variant.slice(currentFile.length) }}</option>
            </select>
          </label>
          <button data-action="purge" class="logging-btn danger" @click="purgeOpen = true"><PbIcon :icon="PhTrash" /> {{ t('sysmon.purge') }}</button>
        </div>
        <ErrorState
          v-if="viewerUnavailable"
          class="logging-error"
          :title="t('common.error')"
          :message="t('sysmon.logViewerUnavailable', { v: 'LogViewerPanel' })"
        />
        <div id="logging-viewer-target" class="logging-viewer-target"></div>
      </section>

      <section v-show="view === 'settings'" class="logging-settings">
        <LoadingSkeleton v-if="loading" class="logging-muted" :label="t('sysmon.loading')" />
        <ErrorState
          v-if="error"
          class="logging-error"
          :title="t('common.error')"
          :message="error"
          :retry-label="t('common.refresh')"
          @retry="initialize"
        />

        <article class="logging-card">
          <h2>{{ t('sysmon.defaultRotation') }}</h2>
          <div class="logging-form-row">
            <label>{{ t('sysmon.maxFileSizeMb') }}<input v-model.number="rotation.default.max_mb" data-field="default-max-mb" type="number" min="1" max="10240" /></label>
            <label>{{ t('sysmon.rotatedCopies') }}<input v-model.number="rotation.default.backup_count" data-field="default-backup-count" type="number" min="0" max="20" /></label>
            <button class="logging-btn primary" data-save-scope="default" :disabled="savingScope === 'default'" @click="saveRule('default', rotation.default)">{{ t('common.save') }}</button>
            <span class="logging-saved">{{ messages.default || '' }}</span>
          </div>
        </article>

        <article class="logging-card">
          <h2>{{ t('sysmon.managedLogs') }}</h2>
          <p class="logging-muted">{{ t('sysmon.managedLogsHint') }}</p>
          <div class="logging-table-wrap"><table class="logging-table"><thead><tr><th>{{ t('sysmon.scope') }}</th><th>{{ t('sysmon.path') }}</th><th>{{ t('sysmon.maxMb') }}</th><th>{{ t('sysmon.copies') }}</th><th>{{ t('sysmon.action') }}</th><th></th></tr></thead><tbody>
            <tr v-for="[scopeId, rule] in managedRows" :key="scopeId">
              <td class="logging-name">{{ (rule as ManagedRotationRule).label || scopeId }}</td><td>{{ (rule as ManagedRotationRule).description }}</td>
              <td><input v-model.number="rule.max_mb" type="number" min="1" max="10240" /></td><td><input v-model.number="rule.backup_count" type="number" min="0" max="20" /></td>
              <td><button class="logging-btn" :data-save-scope="`managed:${scopeId}`" @click="saveRule(`managed:${scopeId}`, rule)">{{ t('common.save') }}</button></td><td class="logging-saved">{{ messages[`managed:${scopeId}`] || '' }}</td>
            </tr>
          </tbody></table></div>
        </article>

        <article class="logging-card">
          <h2>{{ t('sysmon.perLogRotation') }}</h2>
          <p class="logging-muted">{{ t('sysmon.perLogRotationHint') }}</p>
          <div class="logging-table-wrap"><table v-if="serviceRows.length" class="logging-table"><thead><tr><th>{{ t('sysmon.logFile') }}</th><th>{{ t('sysmon.maxMb') }}</th><th>{{ t('sysmon.copies') }}</th><th>{{ t('sysmon.action') }}</th><th></th></tr></thead><tbody>
            <tr v-for="[service, rule] in serviceRows" :key="service">
              <td class="logging-name">{{ service }}</td><td><input v-model.number="rule.max_mb" type="number" min="1" max="10240" /></td><td><input v-model.number="rule.backup_count" type="number" min="0" max="20" /></td>
              <td><button class="logging-btn" :data-save-scope="service" @click="saveRule(service, rule)">{{ t('common.save') }}</button></td><td class="logging-saved">{{ messages[service] || '' }}</td>
            </tr>
          </tbody></table><EmptyState v-else-if="!loading" :title="t('sysmon.noLogFilesFound')" /></div>
        </article>
      </section>
    </div>
  </div>

  <div v-if="purgeOpen" class="log-modal-backdrop">
    <section class="log-modal" role="dialog" aria-modal="true" aria-labelledby="purge-title">
      <h2 id="purge-title">{{ t('sysmon.purgeLogFile') }}</h2>
      <p>{{ t('sysmon.purgeConfirmMsg', { file: currentFile }) }}</p>
      <p class="logging-muted">{{ t('sysmon.purgeConfirmDetail') }}</p>
      <div class="log-modal-actions"><button class="logging-btn" data-action="cancel-purge" @click="purgeOpen = false">{{ t('common.cancel') }}</button><button class="logging-btn danger" data-confirm="purge" :disabled="purging" @click="confirmPurge">{{ t('sysmon.purge') }}</button></div>
    </section>
  </div>
</AppShell>
</template>
