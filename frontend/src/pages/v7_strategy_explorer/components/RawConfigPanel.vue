<script setup lang="ts">
/**
 * Raw Config stage — a focused Vue editor for the active strategy config.
 * The contenteditable pre preserves the legacy 450 ms validate → sync
 * markets → recalculate flow while providing an integrated IDE-style toolbar,
 * real-time validation tone badges, formatting/reset actions, Tab indentation,
 * and adaptive viewport height.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  PhArrowCounterClockwise,
  PhArrowsIn,
  PhArrowsOut,
  PhCheck,
  PhCopy,
  PhFileCode,
  PhMinus,
  PhPlus,
  PhSparkle,
  PhSpinnerGap,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { serverMsg } from '@/shared/i18n';
import type { ExplorerStore } from '../composables/useStrategyExplorer';

const props = defineProps<{ store: ExplorerStore }>();
const { t } = useI18n();
const store = props.store;
const editor = ref<HTMLPreElement | null>(null);
const status = ref<{ text: string; error: boolean } | null>(null);
const copied = ref(false);
const copyFailed = ref(false);
const expanded = ref(false);
const editorFontSize = ref(12);
const isJsonInvalid = ref(false);
const lineCount = ref(1);
const charCount = ref(0);
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let copyTimer: ReturnType<typeof setTimeout> | null = null;
let editGeneration = 0;

function setStatus(text: string, error: boolean): void {
  status.value = { text, error };
}

function localizedErrorMessage(error: Error): string {
  let message = error.message;
  try {
    const parsed = JSON.parse(message) as { detail?: unknown };
    if (typeof parsed.detail === 'string') message = parsed.detail;
  } catch {
    // Non-JSON errors are already in the expected display form.
  }
  return serverMsg(message);
}

function currentRecalculationError(): string | null {
  const snapshot = store.state.snapshot;
  const errorMessage = (snapshot?.messages || []).find((message) => String(message.level || '').toLowerCase() === 'error');
  if (errorMessage) return serverMsg(String(errorMessage.text || errorMessage.message || ''));
  const engineStatus = String(snapshot?.market?.engine_status || '');
  return engineStatus.toLowerCase().includes('failed') ? serverMsg(engineStatus) : null;
}

const statusText = computed(() => status.value?.text || t('v7explore.jsonValid'));
const statusTone = computed(() => {
  if (status.value?.error) return 'danger';
  const currentText = status.value?.text;
  if (
    currentText === t('v7explore.validatingJson') ||
    currentText === t('v7explore.jsonValidRecalculating') ||
    currentText === t('v7explore.jsonValidUpdatingSelectors')
  ) {
    return 'recalc';
  }
  return 'ready';
});

function updateCounts(): void {
  const text = editor.value?.textContent || '';
  charCount.value = text.length;
  lineCount.value = text ? text.split('\n').length : 1;
}

function syncFromState(): void {
  const editorElement = editor.value;
  if (!editorElement || dirty || document.activeElement === editorElement) return;
  editorElement.textContent = JSON.stringify(store.state.config || {}, null, 4);
  updateCounts();
}

/** bindRawConfigEditor (:1727-1765). */
function bindEditor(): void {
  if (!editor.value) return;
  editor.value.addEventListener('input', onInput);
}

function onInput(): void {
  const generation = ++editGeneration;
  updateCounts();
  store.invalidateConfigRequests();
  dirty = true;
  isJsonInvalid.value = false;
  setStatus(t('v7explore.validatingJson'), false);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (generation !== editGeneration) return;
    const editorElement = editor.value;
    try {
      const parsed = JSON.parse(editorElement?.textContent || '{}') as unknown;
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('v7explore.configJsonMustBeObject'));
      store.state.config = parsed as Record<string, unknown>;
      const revision = store.generations.configRevision;
      dirty = false;
      setStatus(t('v7explore.jsonValidUpdatingSelectors'), false);
      store.syncControlsFromConfig(store.state.config);
      void store.populateMarkets().then((updated) => {
        if (revision !== store.generations.configRevision || generation !== editGeneration) return false;
        store.syncControlsFromConfig(store.state.config);
        setStatus(t('v7explore.jsonValidRecalculating'), false);
        return store.recalculate({ preserveConfig: true, reportError: true }).then(() => {
          const recalculationError = currentRecalculationError();
          if (recalculationError) throw new Error(recalculationError);
          return true;
        });
      }).then((updated) => {
        if (!updated || generation !== editGeneration) return;
        setStatus(t('v7explore.jsonValidSnapshotUpdated'), false);
      }).catch((err: Error) => {
        if (generation === editGeneration) setStatus(t('v7explore.jsonValidRecalcFailed', { error: localizedErrorMessage(err) }), true);
      });
    } catch (err) {
      isJsonInvalid.value = true;
      setStatus(t('editor.json.invalid') + ': ' + (err as Error).message, true);
    }
  }, 450);
}

function insertPlainText(text: string): void {
  const editorElement = editor.value;
  if (!editorElement) return;
  const selection = window.getSelection();
  const hasEditorSelection = selection && selection.rangeCount > 0 && editorElement.contains(selection.anchorNode);
  if (!hasEditorSelection) {
    editorElement.append(document.createTextNode(text));
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Tab') {
    event.preventDefault();
    insertPlainText('    ');
    onInput();
  }
}

function onPaste(event: ClipboardEvent): void {
  insertPlainText(event.clipboardData?.getData('text/plain') || '');
  onInput();
}

function onDrop(event: DragEvent): void {
  insertPlainText(event.dataTransfer?.getData('text/plain') || '');
  onInput();
}

function formatJson(): void {
  const editorElement = editor.value;
  if (!editorElement) return;
  try {
    const text = editorElement.textContent || '{}';
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(t('v7explore.configJsonMustBeObject'));
    editorElement.textContent = JSON.stringify(parsed, null, 4);
    isJsonInvalid.value = false;
    updateCounts();
    onInput();
  } catch (err) {
    isJsonInvalid.value = true;
    setStatus(t('editor.json.invalid') + ': ' + (err as Error).message, true);
  }
}

function resetConfig(): void {
  dirty = false;
  isJsonInvalid.value = false;
  if (editor.value) {
    editor.value.textContent = JSON.stringify(store.state.config || {}, null, 4);
    updateCounts();
  }
  setStatus(t('v7explore.editJsonHint'), false);
}

async function copyConfig(): Promise<void> {
  const text = editor.value?.textContent || '';
  if (!text) return;
  let copiedSuccessfully = false;
  const previouslyFocusedElement = document.activeElement as HTMLElement | null;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
    await navigator.clipboard.writeText(text);
    copiedSuccessfully = true;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      copiedSuccessfully = document.execCommand('copy');
    } catch {
      copiedSuccessfully = false;
    } finally {
      textarea.remove();
      previouslyFocusedElement?.focus();
    }
  }
  if (!copiedSuccessfully) {
    copyFailed.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyFailed.value = false;
    }, 1400);
    return;
  }
  copied.value = true;
  copyFailed.value = false;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 1400);
}

function changeFontSize(delta: number): void {
  editorFontSize.value = Math.min(18, Math.max(10, editorFontSize.value + delta));
}

onMounted(() => {
  bindEditor();
  syncFromState();
});

/* Keep the editor current unless the user is editing (:1716) — legacy called
   syncRawFromState from renderSnapshot/renderSideTuning; the config watcher
   covers both paths (applySnapshot replaces the config object). */
watch(
  () => store.state.config,
  () => syncFromState(),
  { deep: true }
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  if (copyTimer) clearTimeout(copyTimer);
  editor.value?.removeEventListener('input', onInput);
});
</script>

<template>
  <section id="raw-config-panel" class="raw-config-panel overflow-hidden rounded-xl border border-border-default bg-panel shadow-[var(--shadow-panel)]">
    <!-- Streamlined modern IDE editor toolbar -->
    <header class="raw-config-header flex flex-wrap items-center justify-between gap-3 border-b border-border-default/80 bg-panel px-4 py-2.5 max-[640px]:px-3">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
        <div class="flex items-center gap-2">
          <PhFileCode :size="18" class="text-accent-soft shrink-0" aria-hidden="true" />
          <h2 class="m-0 text-sm font-semibold tracking-tight text-primary whitespace-nowrap">{{ t('v7explore.rawConfig') }}</h2>
          <span class="inline-flex items-center rounded border border-border-subtle bg-page/90 px-1.5 py-0.5 font-mono text-[10px] font-medium text-secondary">JSON</span>
        </div>

        <!-- Real-time status indicator tag -->
        <div
          class="raw-config-status-tag inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors duration-150"
          :class="statusTone === 'danger'
            ? 'border-danger/40 bg-danger/10 text-danger-soft'
            : statusTone === 'recalc'
              ? 'border-accent/40 bg-accent/10 text-accent-soft'
              : 'border-success/30 bg-success/8 text-success-soft'"
          role="status"
          aria-live="polite"
        >
          <PhSpinnerGap v-if="statusTone === 'recalc'" :size="12" class="animate-spin text-accent shrink-0" aria-hidden="true" />
          <span v-else-if="statusTone === 'danger'" class="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" aria-hidden="true"></span>
          <PhCheck v-else :size="11" weight="bold" class="text-success shrink-0" aria-hidden="true" />
          <span class="truncate max-w-[380px] max-[768px]:max-w-[200px]" :title="statusText">{{ statusText }}</span>
        </div>
      </div>

      <!-- Action tools -->
      <div class="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="raw-config-tool"
          :title="t('v7explore.formatJsonTip')"
          :aria-label="t('v7explore.formatJson')"
          @click="formatJson"
        >
          <PhSparkle :size="13" aria-hidden="true" />
          <span>{{ t('v7explore.formatJson') }}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="raw-config-tool"
          :title="t('v7explore.resetConfigTip')"
          :aria-label="t('v7explore.resetConfig')"
          @click="resetConfig"
        >
          <PhArrowCounterClockwise :size="13" aria-hidden="true" />
          <span>{{ t('v7explore.resetConfig') }}</span>
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="raw-config-tool"
          :aria-label="t('shared.json.copyToClipboard')"
          @click="copyConfig"
        >
          <PhCheck v-if="copied" :size="13" weight="bold" class="text-success" aria-hidden="true" />
          <PhCopy v-else :size="13" aria-hidden="true" />
          <span>{{ copied ? t('shared.json.copied') : copyFailed ? t('v7run.copyFailed') : t('shared.json.copy') }}</span>
        </Button>

        <div class="raw-config-font-controls" :aria-label="t('shared.json.largerFont')" role="group">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            class="raw-config-icon-tool"
            :aria-label="t('shared.json.smallerFont')"
            :disabled="editorFontSize <= 10"
            @click="changeFontSize(-1)"
          >
            <PhMinus :size="12" aria-hidden="true" />
          </Button>
          <span class="min-w-7 text-center font-mono text-[10px] text-muted">{{ editorFontSize }}px</span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            class="raw-config-icon-tool"
            :aria-label="t('shared.json.largerFont')"
            :disabled="editorFontSize >= 18"
            @click="changeFontSize(1)"
          >
            <PhPlus :size="12" aria-hidden="true" />
          </Button>
        </div>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="raw-config-tool"
          :aria-label="expanded ? t('shared.json.collapse') : t('shared.json.expand')"
          :aria-expanded="expanded"
          aria-controls="raw-config-json"
          @click="expanded = !expanded"
        >
          <PhArrowsIn v-if="expanded" :size="13" aria-hidden="true" />
          <PhArrowsOut v-else :size="13" aria-hidden="true" />
          <span>{{ expanded ? t('shared.json.collapse') : t('shared.json.expand') }}</span>
        </Button>
      </div>
    </header>

    <div class="raw-config-editor-wrap bg-deep p-3 max-[640px]:p-2">
      <pre
        id="raw-config-json"
        ref="editor"
        class="raw-config-editor m-0 overflow-auto rounded-lg border border-border-subtle bg-page px-4 py-3.5 font-mono text-primary caret-accent max-[640px]:px-3"
        :class="[{ 'raw-config-editor--expanded': expanded, 'raw-invalid': isJsonInvalid }]"
        :style="{ fontSize: editorFontSize + 'px' }"
        contenteditable="plaintext-only"
        role="textbox"
        aria-multiline="true"
        :aria-label="t('v7explore.rawConfig')"
        :aria-invalid="isJsonInvalid ? 'true' : 'false'"
        spellcheck="false"
        @keydown="onKeydown"
        @paste.prevent="onPaste"
        @drop.prevent="onDrop"
      ></pre>
    </div>

    <footer class="raw-config-footer flex flex-wrap items-center justify-between gap-3 border-t border-border-default/70 bg-page/50 px-4 py-2 text-xs text-secondary">
      <div class="flex min-w-0 items-center gap-2">
        <span class="text-muted">{{ t('v7explore.editJsonHint') }}</span>
      </div>
      <div class="flex items-center gap-2.5 font-mono text-[11px] text-muted">
        <span>{{ t('v7explore.lines', { count: lineCount }) }}</span>
        <span aria-hidden="true" class="text-border-default">•</span>
        <span>{{ t('v7explore.characters', { count: charCount }) }}</span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.raw-config-header {
  background:
    linear-gradient(110deg, rgb(var(--accent-rgb) / 0.06), transparent 40%),
    var(--bg-panel);
}

.raw-config-tool,
.raw-config-icon-tool {
  display: inline-flex;
  min-height: 28px;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid var(--border-default);
  border-radius: 6px;
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    border-color var(--motion-fast) var(--ease-standard),
    background-color var(--motion-fast) var(--ease-standard),
    color var(--motion-fast) var(--ease-standard),
    transform var(--motion-fast) var(--ease-standard);
}

.raw-config-tool {
  padding: 2px 8px;
  font-size: 11px;
}

.raw-config-icon-tool {
  width: 26px;
  padding: 0;
}

.raw-config-tool:hover,
.raw-config-icon-tool:hover:not(:disabled) {
  border-color: rgb(var(--accent-rgb) / 0.58);
  background: rgb(var(--accent-rgb) / 0.09);
  color: var(--accent-soft);
}

.raw-config-tool:active,
.raw-config-icon-tool:active:not(:disabled) {
  transform: translateY(1px);
}

.raw-config-tool:focus-visible,
.raw-config-icon-tool:focus-visible,
.raw-config-editor:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.raw-config-icon-tool:disabled {
  color: var(--text-disabled);
  cursor: not-allowed;
  opacity: 0.55;
}

.raw-config-font-controls {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border-radius: 6px;
  background: var(--bg-panel);
}

.raw-config-font-controls .raw-config-icon-tool:first-child {
  border-radius: 6px 0 0 6px;
}

.raw-config-font-controls .raw-config-icon-tool:last-child {
  border-radius: 0 6px 6px 0;
}

.raw-config-editor {
  height: clamp(440px, 62dvh, 820px);
  min-height: 380px;
  tab-size: 4;
  line-height: 1.6;
  white-space: pre;
  overflow-wrap: normal;
  scrollbar-gutter: stable;
  transition:
    border-color var(--motion-normal) var(--ease-standard),
    box-shadow var(--motion-normal) var(--ease-standard),
    height var(--motion-slow) var(--ease-standard);
}

.raw-config-editor:hover {
  border-color: var(--border-default);
}

.raw-config-editor--expanded {
  height: calc(100dvh - 180px);
  min-height: 560px;
}

.raw-config-editor.raw-invalid {
  border-color: rgb(var(--danger-rgb) / 0.7);
  color: var(--danger-soft);
  box-shadow: 0 0 0 3px rgb(var(--danger-rgb) / 0.08);
}

@media (max-width: 640px) {
  .raw-config-editor,
  .raw-config-editor--expanded {
    height: 60dvh;
    min-height: 340px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .raw-config-tool,
  .raw-config-icon-tool,
  .raw-config-editor {
    transition: none;
  }
}
</style>

