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
import { useAiPageContext } from '@/shared/ai/context';
import { loggingApiBase, loggingWsBase } from './config';
import type { LogFilesPayload, ManagedRotationRule, RotationPayload, RotationRule } from './types';

type PageView = 'logs' | 'settings';
type Viewer = { open(): void; close(): void; setFile?(name: string): void; fetchFile?(name: string): void };
type ViewerCtor = new (options: Record<string, unknown>) => Viewer;

const { t } = useI18n();
const view = ref<PageView>('logs');

/* AI drawer page context — Vue port of the legacy logging registration. */
useAiPageContext({ id: 'logging', getContext: () => ({ section: 'Logging' }) });
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

  <div id="page-body" class="flex flex-1 min-h-0 overflow-hidden">
    <div class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
      <section v-show="view === 'logs'" class="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div v-if="currentFile" class="flex shrink-0 items-center gap-2.5 px-3.5 pt-1.75">
          <label v-if="variants.length" class="flex items-center gap-1.5 text-xs text-secondary">{{ t('sysmon.version') }}
            <select class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary" data-field="rotation-version" :value="selectedVariant" @change="selectVariant(($event.target as HTMLSelectElement).value)">
              <option value="current">{{ t('sysmon.current') }}</option>
              <option v-for="variant in variants" :key="variant" :value="variant">{{ variant.slice(currentFile.length) }}</option>
            </select>
          </label>
          <button data-action="purge" class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-danger bg-danger-deep text-[#f2f5fb]" @click="purgeOpen = true"><PbIcon :icon="PhTrash" /> {{ t('sysmon.purge') }}</button>
        </div>
        <ErrorState
          v-if="viewerUnavailable"
          class="mx-3.5 my-2 text-danger-soft"
          :title="t('common.error')"
          :message="t('sysmon.logViewerUnavailable', { v: 'LogViewerPanel' })"
        />
        <div id="logging-viewer-target" class="flex flex-1 min-h-0 overflow-hidden"></div>
      </section>

      <section v-show="view === 'settings'" class="flex-1 min-h-0 overflow-y-auto px-6 py-5 max-[700px]:p-3">
        <LoadingSkeleton v-if="loading" class="text-sm text-secondary" :label="t('sysmon.loading')" />
        <ErrorState
          v-if="error"
          class="mx-3.5 my-2 text-danger-soft"
          :title="t('common.error')"
          :message="error"
          :retry-label="t('common.refresh')"
          @retry="initialize"
        />

        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.defaultRotation') }}</h2>
          <div class="flex flex-wrap items-end gap-3">
            <label>{{ t('sysmon.maxFileSizeMb') }}<input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary" v-model.number="rotation.default.max_mb" data-field="default-max-mb" type="number" min="1" max="10240" /></label>
            <label>{{ t('sysmon.rotatedCopies') }}<input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary" v-model.number="rotation.default.backup_count" data-field="default-backup-count" type="number" min="0" max="20" /></label>
            <button class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-accent-deep bg-accent-deep text-[#f2f5fb]" data-save-scope="default" :disabled="savingScope === 'default'" @click="saveRule('default', rotation.default)">{{ t('common.save') }}</button>
            <span class="text-xs text-success-soft">{{ messages.default || '' }}</span>
          </div>
        </article>

        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.managedLogs') }}</h2>
          <p class="text-sm text-secondary">{{ t('sysmon.managedLogsHint') }}</p>
          <div class="overflow-x-auto"><table class="w-full border-collapse"><thead><tr><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.scope') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.path') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.maxMb') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.copies') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.action') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary"></th></tr></thead><tbody>
            <tr v-for="[scopeId, rule] in managedRows" :key="scopeId">
              <td class="font-mono text-primary">{{ (rule as ManagedRotationRule).label || scopeId }}</td><td class="px-2.5 py-2 border-b border-border-subtle">{{ (rule as ManagedRotationRule).description }}</td>
              <td class="px-2.5 py-2 border-b border-border-subtle"><input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary w-[90px]" v-model.number="rule.max_mb" type="number" min="1" max="10240" /></td><td class="px-2.5 py-2 border-b border-border-subtle"><input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary w-[90px]" v-model.number="rule.backup_count" type="number" min="0" max="20" /></td>
              <td class="px-2.5 py-2 border-b border-border-subtle"><button class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-border-strong bg-elevated text-primary" :data-save-scope="`managed:${scopeId}`" @click="saveRule(`managed:${scopeId}`, rule)">{{ t('common.save') }}</button></td><td class="text-xs text-success-soft">{{ messages[`managed:${scopeId}`] || '' }}</td>
            </tr>
          </tbody></table></div>
        </article>

        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.perLogRotation') }}</h2>
          <p class="text-sm text-secondary">{{ t('sysmon.perLogRotationHint') }}</p>
          <div class="overflow-x-auto"><table v-if="serviceRows.length" class="w-full border-collapse"><thead><tr><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.logFile') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.maxMb') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.copies') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary">{{ t('sysmon.action') }}</th><th class="sticky top-0 border-b-2 border-border-default bg-elevated px-2.5 py-2 text-left text-xs text-secondary"></th></tr></thead><tbody>
            <tr v-for="[service, rule] in serviceRows" :key="service">
              <td class="font-mono text-primary">{{ service }}</td><td class="px-2.5 py-2 border-b border-border-subtle"><input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary w-[90px]" v-model.number="rule.max_mb" type="number" min="1" max="10240" /></td><td class="px-2.5 py-2 border-b border-border-subtle"><input class="h-8 rounded-sm border border-border-default bg-elevated px-2 py-1 text-primary w-[90px]" v-model.number="rule.backup_count" type="number" min="0" max="20" /></td>
              <td class="px-2.5 py-2 border-b border-border-subtle"><button class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-border-strong bg-elevated text-primary" :data-save-scope="service" @click="saveRule(service, rule)">{{ t('common.save') }}</button></td><td class="text-xs text-success-soft">{{ messages[service] || '' }}</td>
            </tr>
          </tbody></table><EmptyState v-else-if="!loading" :title="t('sysmon.noLogFilesFound')" /></div>
        </article>
      </section>
    </div>
  </div>

  <div v-if="purgeOpen" class="log-modal-backdrop fixed inset-0 z-[2500] grid place-items-center bg-backdrop">
    <section class="w-[min(480px,calc(100vw-32px))] rounded-xl border border-border-strong bg-panel p-5 shadow-[0_20px_60px_rgba(5,8,14,0.55)]" role="dialog" aria-modal="true" aria-labelledby="purge-title">
      <h2 id="purge-title" class="m-0 mb-3">{{ t('sysmon.purgeLogFile') }}</h2>
      <p class="my-2">{{ t('sysmon.purgeConfirmMsg', { file: currentFile }) }}</p>
      <p class="text-sm text-secondary">{{ t('sysmon.purgeConfirmDetail') }}</p>
      <div class="mt-4.5 flex justify-end gap-2"><button class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-border-strong bg-elevated text-primary" data-action="cancel-purge" @click="purgeOpen = false">{{ t('common.cancel') }}</button><button class="inline-flex items-center gap-1.5 min-h-8 rounded-[5px] border px-[11px] py-1 cursor-pointer hover:border-accent disabled:opacity-55 disabled:cursor-not-allowed border-danger bg-danger-deep text-[#f2f5fb]" data-confirm="purge" :disabled="purging" @click="confirmPurge">{{ t('sysmon.purge') }}</button></div>
    </section>
  </div>
</AppShell>
</template>

<style>
/* Root rules ported from styles/logging-monitor.css — html/body/#app have no
   scope attribute, so these must live in an unscoped block. */
html, body, #app {
  height: 100%;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
}
</style>

<style scoped>
/* Page-level AppShell overrides for the fixed-height workbench layout —
   ported from styles/logging-monitor.css at the Tailwind migration. */
.operations-shell--logging {
  height: 100%;
  min-height: 0;
}

.operations-shell--logging :deep(.app-shell__workspace) {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
}

.operations-shell--logging :deep(.app-shell__main) {
  width: 100%;
  max-width: none;
  min-height: 0;
  flex: 1;
  padding: 0;
}

.operations-shell--logging :deep(.app-shell__primary) {
  display: flex;
  min-height: 0;
  flex-direction: column;
}
</style>
