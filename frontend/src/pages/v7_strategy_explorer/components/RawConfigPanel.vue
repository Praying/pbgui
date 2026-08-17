<script setup lang="ts">
/**
 * Raw Config stage — the PBGuiJsonPanel-backed editor (:260-264,
 * syncRawFromState :1702-1717, bindRawConfigEditor :1727-1765). The shared
 * /app/js/json_panel.js stays a script global: the panel chrome markup is
 * static (not server data), so the one-time innerHTML install matches the
 * legacy flow; the contenteditable pre debounces 450 ms, validates the
 * JSON object, syncs selectors/markets, and recalculates.
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ExplorerStore } from '../composables/useStrategyExplorer';

interface JsonPanelGlobal {
  createPanelHtml(options: { wrapId: string; preId: string; title: string; collapsedHeight: string }): string;
  setContent(preId: string, value: unknown): void;
}

const props = defineProps<{ store: ExplorerStore }>();
const { t } = useI18n();
const store = props.store;
const container = ref<HTMLElement | null>(null);
const status = ref<{ text: string; error: boolean } | null>(null);
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let editGeneration = 0;

function panel(): JsonPanelGlobal | undefined {
  return (window as unknown as { PBGuiJsonPanel?: JsonPanelGlobal }).PBGuiJsonPanel;
}

function setStatus(text: string, error: boolean): void {
  status.value = { text, error };
}

function pre(): HTMLPreElement | null {
  return document.getElementById('raw-config-json') as HTMLPreElement | null;
}

function syncFromState(): void {
  const p = pre();
  if (!dirty && document.activeElement !== p) panel()?.setContent('raw-config-json', store.state.config || {});
}

/** bindRawConfigEditor (:1727-1765). */
function bindEditor(): void {
  const p = pre();
  if (!p) return;
  p.contentEditable = 'true';
  p.spellcheck = false;
  p.addEventListener('input', onInput);
}

function onInput(): void {
  const generation = ++editGeneration;
  store.invalidateConfigRequests();
  dirty = true;
  setStatus(t('v7explore.validatingJson'), false);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (generation !== editGeneration) return;
    const p = pre();
    try {
      const parsed = JSON.parse(p?.textContent || '{}') as unknown;
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
        return store.recalculate({ preserveConfig: true, reportError: true }).then(() => true);
      }).then((updated) => {
        if (!updated || generation !== editGeneration) return;
        setStatus(t('v7explore.jsonValidSnapshotUpdated'), false);
      }).catch((err: Error) => {
        if (generation === editGeneration) setStatus(t('v7explore.jsonValidRecalcFailed', { error: err.message }), true);
      });
    } catch (err) {
      setStatus('Invalid JSON/config: ' + (err as Error).message, true);
    }
  }, 450);
}

onMounted(() => {
  const root = container.value;
  const jsonPanel = panel();
  if (!root || !jsonPanel) return;
  root.innerHTML = jsonPanel.createPanelHtml({ wrapId: 'raw-config-wrap', preId: 'raw-config-json', title: t('v7explore.config'), collapsedHeight: 'calc(50vh - 30px)' });
  bindEditor();
  syncFromState();
});

/* Keep the editor current unless the user is editing (:1716) — legacy called
   syncRawFromState from renderSnapshot/renderSideTuning; the config watcher
   covers both paths (applySnapshot replaces the config object). */
watch(
  () => store.state.config,
  () => syncFromState()
);

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  pre()?.removeEventListener('input', onInput);
});
</script>

<template>
  <div class="panel-card">
    <div id="raw-config-panel">
      <div ref="container"></div>
      <div v-if="status" :class="'raw-config-status' + (status.error ? ' error' : '')">{{ status.text }}</div>
    </div>
  </div>
</template>
