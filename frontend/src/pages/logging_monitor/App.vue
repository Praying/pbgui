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
import LogViewer, { type LogViewerHandle } from '@/shared/components/LogViewer.vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import StatusStrip from '@/shared/components/StatusStrip.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Table, Th } from '@/shared/components/ui/table';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import { useAiPageContext } from '@/shared/ai/context';
import { SYSTEM_PRESETS } from '@/shared/log/logViewerPresets';
import { loggingApiBase, loggingWsBase } from './config';
import type { LogFilesPayload, ManagedRotationRule, RotationPayload, RotationRule } from './types';
import { vFocusTrap } from '@/shared/directives/focusTrap';

type PageView = 'logs' | 'settings';

const { t } = useI18n();
const initialView = new URLSearchParams(window.location.search).get('view');
const view = ref<PageView>(initialView === 'settings' ? 'settings' : 'logs');

/* AI drawer page context — Vue port of the legacy logging registration. */
useAiPageContext({ id: 'logging', getContext: () => ({ section: 'Logging' }) });
const sections = computed<PageSection[]>(() => [
  { key: 'logs', label: t('sysmon.logViewer') },
  { key: 'settings', label: t('sysmon.settings') },
]);
function onSectionSelect(key: string): void {
  if (key !== 'logs' && key !== 'settings') return;
  view.value = key;
  const destination = new URL(window.location.href);
  destination.searchParams.set('view', key);
  window.history.replaceState(window.history.state, '', destination);
  void synchronize();
}
const files = ref<LogFilesPayload>({ files: [], sizes: {}, rotated: {} });
const rotation = ref<RotationPayload>({ default: { max_mb: 10, backup_count: 0 }, per_service: {}, managed_scopes: {} });
const currentFile = ref('');
const selectedVariant = ref('current');
const loading = ref(true);
const rotationLoaded = ref(false);
const error = ref('');
const purgeOpen = ref(false);
const purging = ref(false);
const savingScopes = ref(new Set<string>());
const messages = ref<Record<string, string>>({});
const messageErrors = ref<Record<string, boolean>>({});
const messageTimers = new Map<string, number>();
const saveRequests = new Map<string, AbortController>();
let disposed = false;
let rotationBaseline = '';
let synchronizationPending = false;
let synchronizationTimer: number | undefined;
const readRequests = new Set<AbortController>();
const logViewer = ref<LogViewerHandle | null>(null);

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
  if (String(rule.max_mb).trim() === '' || !Number.isInteger(maxMb) || maxMb < 1 || maxMb > 10240) throw new Error(t('sysmon.rotationInvalidSize'));
  if (String(rule.backup_count).trim() === '' || !Number.isInteger(copies) || copies < 0 || copies > 20) throw new Error(t('sysmon.rotationInvalidCopies'));
  return { max_mb: maxMb, backup_count: copies };
}

async function readSnapshot<Payload>(url: string): Promise<Payload> {
  const controller = new AbortController();
  readRequests.add(controller);
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    return await apiFetch<Payload>(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    readRequests.delete(controller);
  }
}

async function loadFiles(): Promise<void> {
  const snapshot = await readSnapshot<LogFilesPayload>(loggingApiBase());
  if (!disposed) files.value = snapshot;
}
async function loadRotation(): Promise<void> {
  const draftBeforeRead = JSON.stringify(rotation.value);
  const snapshot = await readSnapshot<RotationPayload>(`${loggingApiBase()}/rotation`);
  if (disposed) return;
  normalizedRule(snapshot.default);
  const draftUnchanged = JSON.stringify(rotation.value) === draftBeforeRead;
  const hasUnsavedEdits = rotationLoaded.value && draftBeforeRead !== rotationBaseline;
  if (draftUnchanged && !hasUnsavedEdits && savingScopes.value.size === 0) {
    rotation.value = structuredClone(snapshot);
    rotationBaseline = JSON.stringify(snapshot);
  }
  rotationLoaded.value = true;
}
async function initialize(): Promise<void> {
  loading.value = true;
  error.value = '';
  try { await Promise.all([loadFiles(), loadRotation()]); }
  catch (caught) { error.value = detail(caught); }
  finally { loading.value = false; }
}

async function synchronize(): Promise<void> {
  if (disposed || synchronizationPending || document.hidden || loading.value) return;
  synchronizationPending = true;
  try {
    await Promise.all([loadFiles(), loadRotation()]);
    if (!disposed) error.value = '';
  } catch (caught) {
    if (!disposed) error.value = detail(caught);
  } finally {
    synchronizationPending = false;
  }
}
function showMessage(scope: string, text: string, isError = false): void {
  messages.value = { ...messages.value, [scope]: text };
  messageErrors.value = { ...messageErrors.value, [scope]: isError };
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
  if (!rotationLoaded.value || savingScopes.value.has(scope) || disposed) return;
  const controller = new AbortController();
  const priorTimer = messageTimers.get(scope);
  if (priorTimer !== undefined) window.clearTimeout(priorTimer);
  messages.value = { ...messages.value, [scope]: '' };
  savingScopes.value.add(scope);
  saveRequests.set(scope, controller);
  const timeout = window.setTimeout(() => controller.abort(), 15000);
  try {
    const normalized = normalizedRule(rule);
    const result = await apiFetch<{ success: boolean; apply?: { message?: string } }>(`${loggingApiBase()}/rotation`, {
      method: 'POST',
      body: JSON.stringify({ scope, ...normalized }),
      signal: controller.signal,
    });
    if (disposed) return;
    if (!result.success) throw new Error(t('sysmon.rotationSaveFailed'));
    showMessage(scope, result.apply?.message ? serverMsg(result.apply.message) : t('sysmon.saved'));
  } catch (caught) {
    if (!disposed) showMessage(scope, detail(caught), true);
  } finally {
    window.clearTimeout(timeout);
    saveRequests.delete(scope);
    savingScopes.value.delete(scope);
  }
}
function onFileChange(filename: string): void {
  currentFile.value = filename;
  selectedVariant.value = 'current';
}
function selectVariant(value: string): void {
  selectedVariant.value = value;
  if (!currentFile.value) return;
  if (value === 'current') logViewer.value?.setFile(currentFile.value);
  else logViewer.value?.fetchFile(value);
}
async function confirmPurge(): Promise<void> {
  if (!currentFile.value) return;
  purging.value = true;
  error.value = '';
  try {
    await apiFetch(`${loggingApiBase()}/purge/${encodeURIComponent(currentFile.value)}`, { method: 'POST', body: '{}' });
    purgeOpen.value = false;
    await loadFiles();
    logViewer.value?.setFile(currentFile.value);
  } catch (caught) { error.value = detail(caught); }
  finally { purging.value = false; }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && purgeOpen.value) purgeOpen.value = false;
}

onMounted(() => {
  document.title = t('sysmon.loggingTitle');
  void initialize();
  synchronizationTimer = window.setInterval(() => { void synchronize(); }, 5000);
  window.addEventListener('pageshow', synchronize);
  document.addEventListener('visibilitychange', synchronize);
  window.addEventListener('keydown', onKeydown);
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = () => {
    window.location.href = '/api/help/main_page?topic=31_logging';
  };
});
onBeforeUnmount(() => {
  disposed = true;
  window.clearInterval(synchronizationTimer);
  window.removeEventListener('pageshow', synchronize);
  document.removeEventListener('visibilitychange', synchronize);
  readRequests.forEach((controller) => controller.abort());
  saveRequests.forEach((controller) => controller.abort());
  messageTimers.forEach((timer) => window.clearTimeout(timer));
  window.removeEventListener('keydown', onKeydown);
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});
</script>

<template>
  <AppShell
    class="core-workbench-shell operations-shell operations-shell--logging"
    page-key="system_logging"
    :page-title="t('sysmon.loggingTitle')"
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

  <div id="page-body" class="pbgui-ambient flex flex-1 min-h-0 overflow-hidden">
    <div class="flex flex-1 min-w-0 min-h-0 overflow-hidden">
      <section v-show="view === 'logs'" class="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div v-if="currentFile" class="flex shrink-0 items-center gap-2.5 px-3.5 pt-1.75">
          <div v-if="variants.length" class="flex items-center gap-1.5 text-xs text-secondary">
            <span id="rotation-version-label">{{ t('sysmon.version') }}</span>
            <SelectRoot :model-value="selectedVariant" @update:model-value="selectVariant">
              <SelectTrigger data-field="rotation-version" class="w-auto min-w-[120px]" aria-labelledby="rotation-version-label">
                <span>{{ selectedVariant === 'current' ? t('sysmon.current') : selectedVariant.slice(currentFile.length) }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">{{ t('sysmon.current') }}</SelectItem>
                <SelectItem v-for="variant in variants" :key="variant" :value="variant">{{ variant.slice(currentFile.length) }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
          <Button data-action="purge" type="button" variant="danger" @click="purgeOpen = true"><PbIcon :icon="PhTrash" /> {{ t('sysmon.purge') }}</Button>
        </div>
        <div class="flex min-h-0 flex-1 flex-col px-3.5 pb-3.5 pt-2">
          <LogViewer
            ref="logViewer"
            :active="view === 'logs'"
            :ws-base="loggingWsBase()"
            :default-file="currentFile"
            show-sidebar
            show-restart
            :files="files.files"
            :file-sizes="files.sizes"
            :presets="SYSTEM_PRESETS"
            @file-change="onFileChange"
          />
        </div>
      </section>

      <section v-show="view === 'settings'" class="flex-1 min-h-0 overflow-y-auto p-[var(--page-padding)]">
        <LoadingSkeleton v-if="loading" class="text-sm text-secondary" :label="t('sysmon.loading')" />
        <ErrorState
          v-if="error"
          class="mx-3.5 my-2 text-danger-soft"
          :title="t('common.error')"
          :message="error"
        />

        <fieldset :disabled="!rotationLoaded" class="contents">
        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.defaultRotation') }}</h2>
          <div class="flex flex-wrap items-end gap-3">
            <label class="grid gap-1 text-sm text-secondary">{{ t('sysmon.maxFileSizeMb') }}<Input class="w-auto" v-model.number="rotation.default.max_mb" data-field="default-max-mb" type="number" min="1" max="10240"  /></label>
            <label class="grid gap-1 text-sm text-secondary">{{ t('sysmon.rotatedCopies') }}<Input class="w-auto" v-model.number="rotation.default.backup_count" data-field="default-backup-count" type="number" min="0" max="20"  /></label>
            <Button type="button" variant="primary" data-save-scope="default" :disabled="!rotationLoaded || savingScopes.has('default')" @click="saveRule('default', rotation.default)">{{ t('common.save') }}</Button>
            <span class="text-xs" :class="messageErrors.default ? 'text-danger-soft' : 'text-success-soft'" role="status" aria-live="polite">{{ messages.default || '' }}</span>
          </div>
        </article>

        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.managedLogs') }}</h2>
          <p class="text-sm text-secondary">{{ t('sysmon.managedLogsHint') }}</p>
          <div class="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{{ t('sysmon.scope') }}</Th>
                  <Th>{{ t('sysmon.path') }}</Th>
                  <Th>{{ t('sysmon.maxMb') }}</Th>
                  <Th>{{ t('sysmon.copies') }}</Th>
                  <Th>{{ t('sysmon.action') }}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="[scopeId, rule] in managedRows" :key="scopeId">
                  <td class="font-mono text-primary">{{ (rule as ManagedRotationRule).label || scopeId }}</td><td class="px-2.5 py-2 border-b border-border-subtle">{{ (rule as ManagedRotationRule).description }}</td>
                  <td class="px-2.5 py-2 border-b border-border-subtle"><Input class="w-[90px]" v-model.number="rule.max_mb" type="number" min="1" max="10240"  /></td><td class="px-2.5 py-2 border-b border-border-subtle"><Input class="w-[90px]" v-model.number="rule.backup_count" type="number" min="0" max="20"  /></td>
                  <td class="px-2.5 py-2 border-b border-border-subtle"><Button type="button" variant="default" :data-save-scope="`managed:${scopeId}`" :disabled="loading || savingScopes.has(`managed:${scopeId}`)" @click="saveRule(`managed:${scopeId}`, rule)">{{ t('common.save') }}</Button></td><td class="text-xs" :class="messageErrors[`managed:${scopeId}`] ? 'text-danger-soft' : 'text-success-soft'">{{ messages[`managed:${scopeId}`] || '' }}</td>
                </tr>
              </tbody>
            </Table>
          </div>
        </article>

        <article class="mb-5 rounded-lg border border-border-default bg-panel px-5 py-4 max-[700px]:p-3">
          <h2 class="mb-3 border-b border-border-default pb-2 text-md font-semibold text-primary">{{ t('sysmon.perLogRotation') }}</h2>
          <p class="text-sm text-secondary">{{ t('sysmon.perLogRotationHint') }}</p>
          <div class="overflow-x-auto">
            <Table v-if="serviceRows.length">
              <thead>
                <tr>
                  <Th>{{ t('sysmon.logFile') }}</Th>
                  <Th>{{ t('sysmon.maxMb') }}</Th>
                  <Th>{{ t('sysmon.copies') }}</Th>
                  <Th>{{ t('sysmon.action') }}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                <tr v-for="[service, rule] in serviceRows" :key="service">
                  <td class="font-mono text-primary">{{ service }}</td><td class="px-2.5 py-2 border-b border-border-subtle"><Input class="w-[90px]" v-model.number="rule.max_mb" type="number" min="1" max="10240"  /></td><td class="px-2.5 py-2 border-b border-border-subtle"><Input class="w-[90px]" v-model.number="rule.backup_count" type="number" min="0" max="20"  /></td>
                  <td class="px-2.5 py-2 border-b border-border-subtle"><Button type="button" variant="default" :data-save-scope="service" :disabled="loading || savingScopes.has(service)" @click="saveRule(service, rule)">{{ t('common.save') }}</Button></td><td class="text-xs" :class="messageErrors[service] ? 'text-danger-soft' : 'text-success-soft'">{{ messages[service] || '' }}</td>
                </tr>
              </tbody>
            </Table>
            <EmptyState v-else-if="!loading" :title="t('sysmon.noLogFilesFound')" />
          </div>
        </article>
        </fieldset>
      </section>
    </div>
  </div>

  <div v-if="purgeOpen" class="log-modal-backdrop modal-backdrop">
    <section class="w-[min(480px,calc(100vw-32px))] rounded-xl border border-border-strong bg-panel p-5 shadow-modal" role="dialog" v-focus-trap aria-modal="true" aria-labelledby="purge-title">
      <h2 id="purge-title" class="m-0 mb-3">{{ t('sysmon.purgeLogFile') }}</h2>
      <p class="my-2">{{ t('sysmon.purgeConfirmMsg', { file: currentFile }) }}</p>
      <p class="text-sm text-secondary">{{ t('sysmon.purgeConfirmDetail') }}</p>
      <div class="mt-4.5 flex justify-end gap-2"><Button type="button" variant="default" data-action="cancel-purge" @click="purgeOpen = false">{{ t('common.cancel') }}</Button><Button type="button" variant="danger" data-confirm="purge" :disabled="purging" @click="confirmPurge">{{ t('sysmon.purge') }}</Button></div>
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
/* The fixed-height chain is the shared `.core-workbench-shell` contract in
   components.css (shell → workspace → main → primary → #page-body). This page
   used to override only `.app-shell__workspace`, which left
   `.app-shell__primary` a block box, so #page-body collapsed to the log's
   content height and the viewer's bottom edge moved with every file. */

/* Keep settings cards at the same elevation as the shared workbench panels. */
.operations-shell--logging article {
  box-shadow: var(--shadow-panel);
}
</style>
