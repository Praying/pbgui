<script setup lang="ts">
/**
 * JsonViewer — shared read-only JSON display backed by vue-json-pretty.
 * Replaces the plain <pre>{{ JSON.stringify(...) }}</pre> / PBGuiJsonPanel
 * patterns on migrated pages with a syntax-coloured, collapsible tree plus
 * an Expand/Collapse + Copy toolbar.
 *
 * Behaviour notes:
 * - Objects and arrays render as the vue-json-pretty tree (default depth 3
 *   collapsed; the toolbar expands everything).
 * - Strings, numbers and booleans fall back to a plain <pre> so log lines,
 *   error messages and other non-JSON payloads keep their old look.
 * - `hide-empty` + `empty-text` restore the "no data" placeholder of pages
 *   that hid empty blocks (e.g. the HL data actions job modal).
 * - Documents larger than VIRTUAL_THRESHOLD bytes switch to virtual
 *   scrolling so big passivbot configs stay cheap to render.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import VueJsonPretty from 'vue-json-pretty';
import 'vue-json-pretty/lib/styles.css';
import { useI18n } from 'vue-i18n';

const props = withDefaults(
  defineProps<{
    /** The JSON value to display (any type; non-objects render as text). */
    data?: unknown;
    /** Initial expansion depth — deeper nodes render collapsed. */
    deep?: number;
    /** Scroll container max height in pixels. */
    maxHeight?: number;
    /** Hide empty objects/arrays/null and render emptyText instead. */
    hideEmpty?: boolean;
    /** Placeholder shown when hideEmpty and the value is empty. */
    emptyText?: string;
    /** Stretch to the parent's height (modal bodies) and drop the frame. */
    fill?: boolean;
  }>(),
  {
    data: undefined,
    deep: 3,
    maxHeight: 400,
    hideEmpty: false,
    emptyText: undefined,
    fill: false,
  }
);

/* useI18n() throws when the component is mounted without the vue-i18n
   plugin (isolated unit tests) — degrade to raw keys in that case. */
let t: (key: string) => string;
try {
  const i18n = useI18n();
  t = (key: string) => i18n.t(key);
} catch {
  t = (key: string) => key;
}

/** Switch to vue-json-pretty's virtual scroll above this serialised size. */
const VIRTUAL_THRESHOLD = 64 * 1024;

const expanded = ref(false);
const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

const isObjectValue = computed(() => props.data !== null && typeof props.data === 'object');
const isEmptyValue = computed(() => {
  const value = props.data;
  if (value === null || value === undefined) return true;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
});
const emptyLabel = computed(() => props.emptyText ?? t('shared.json.empty'));
const treeDeep = computed(() => (expanded.value ? Infinity : props.deep));

/** Serialised once for the copy action and the virtual-scroll heuristic. */
const serialized = computed(() => {
  try {
    return JSON.stringify(props.data ?? null, null, 2);
  } catch {
    return '';
  }
});
const useVirtual = computed(() => serialized.value.length > VIRTUAL_THRESHOLD && props.maxHeight > 0);

function toggleExpanded(): void {
  expanded.value = !expanded.value;
}

async function copyJson(): Promise<void> {
  const text = serialized.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API unavailable (older browsers / non-secure contexts) —
    // fall back to the legacy textarea + execCommand trick.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      /* both paths failed — just keep the old label */
    }
    document.body.removeChild(ta);
  }
  copied.value = true;
  if (copyTimer) clearTimeout(copyTimer);
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, 1500);
}

onBeforeUnmount(() => {
  if (copyTimer) clearTimeout(copyTimer);
});
</script>

<template>
  <div
    class="json-viewer flex min-h-0 min-w-0 flex-col overflow-hidden"
    :class="fill ? 'h-full rounded-none border-0 bg-transparent' : 'rounded-[5px] border border-border-default bg-page'"
  >
    <div v-if="isObjectValue" class="flex shrink-0 items-center justify-end gap-1 border-b border-border-default/60 px-1.5 py-1">
      <button type="button" class="json-viewer-btn" @click="toggleExpanded">
        {{ expanded ? t('shared.json.collapse') : t('shared.json.expand') }}
      </button>
      <button type="button" class="json-viewer-btn" @click="copyJson">
        {{ copied ? t('shared.json.copied') : t('shared.json.copy') }}
      </button>
    </div>
    <div
      v-if="isObjectValue"
      class="json-viewer-body min-h-0 min-w-0 flex-1 overflow-auto"
      :style="fill ? {} : { maxHeight: maxHeight + 'px' }"
    >
      <VueJsonPretty
        :data="data"
        :deep="treeDeep"
        :height="maxHeight"
        :virtual="useVirtual"
        theme="dark"
        :show-double-quotes="true"
        :show-line="true"
        :show-length="false"
        :collapsed-on-click-brackets="true"
      />
    </div>
    <div
      v-else-if="hideEmpty && isEmptyValue"
      class="json-viewer-empty px-2.5 py-2 text-xs text-muted"
    >
      {{ emptyLabel }}
    </div>
    <pre
      v-else
      class="json-viewer-text m-0 min-h-0 min-w-0 flex-1 overflow-auto whitespace-pre-wrap break-words px-2.5 py-2 font-mono text-xs leading-[1.45] text-primary"
      :style="fill ? {} : { maxHeight: maxHeight + 'px' }"
    >{{ String(data ?? '') }}</pre>
  </div>
</template>

<style scoped>
.json-viewer-btn {
  border: 1px solid var(--border-default);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 0.72rem;
  line-height: 1.5;
}

.json-viewer-btn:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

/* vue-json-pretty ships its own styles.css; these scoped overrides adapt the
   tree to the PBGui dark palette (the lib's dark mode only changes hover
   backgrounds, so key/value colours are set here). */
:deep(.vjs-tree) {
  font-size: 12px;
  line-height: 1.6;
  padding: 6px 10px;
}

:deep(.vjs-tree.dark) {
  background: transparent;
}

:deep(.vjs-key) {
  color: #7eb8f0;
}

:deep(.vjs-value-string) {
  color: #13ce66;
}

:deep(.vjs-value-number),
:deep(.vjs-value-boolean) {
  color: #38a8f0;
}

:deep(.vjs-value-null),
:deep(.vjs-value-undefined) {
  color: #d55fde;
}

:deep(.vjs-comment) {
  color: var(--text-muted);
}

:deep(.vjs-tree-node.dark.is-highlight),
:deep(.vjs-tree-node.dark:hover) {
  background-color: rgba(77, 166, 255, 0.12);
  border-radius: 4px;
}

:deep(.vjs-tree-brackets),
:deep(.vjs-colon) {
  color: var(--text-secondary);
}

:deep(.vjs-tree-brackets:hover) {
  color: var(--accent);
}

:deep(.vjs-indent-unit.has-line) {
  border-left: 1px dashed var(--border-default);
}
</style>
