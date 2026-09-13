<script lang="ts">
/** Imperative surface a host can call through a template ref. */
export interface LogViewerHandle {
  /** Switch the local subscription target and restart streaming. */
  setFile(file: string): void;
  /** One-shot local fetch (rotated variant) — displays without subscribing. */
  fetchFile(file: string): void;
  /** Switch the remote host (keeping the current service). */
  setHost(host: string): void;
  /** Switch the remote service on the current host. */
  setService(service: string): void;
  /** Switch host and service in one subscription. */
  setTarget(host: string, service: string): void;
  /** Re-subscribe the current target. */
  reload(): void;
}
</script>

<script setup lang="ts">
/**
 * Shared Vue 3 + Tailwind log viewer.
 *
 * Replaces the legacy global `frontend/js/log_viewer_panel.js` DOM injection on
 * the pages that have finished their Vue migration. The transport lives in
 * `@/shared/log/useLogStream`; this component is presentation plus the
 * client-side filter/search model.
 *
 * Three layouts, driven by props:
 *   - `show-sidebar` (Logging Monitor): local file column + toolbar + terminal.
 *   - otherwise (API Keys): local file dropdown + toolbar + terminal.
 *   - `show-host` (VPS Monitor): host selector, then either the local file
 *     column or the remote service/bot column, plus remote restart.
 *
 * Every colour and size comes from the shared @theme tokens and the ten-step
 * type ladder — no arbitrary bracket values.
 */
import {
  PhArchive,
  PhArrowClockwise,
  PhArrowDown,
  PhCaretDown,
  PhCaretUp,
  PhDownloadSimple,
  PhFileText,
  PhGear,
  PhListNumbers,
  PhPause,
  PhPlay,
  PhRobot,
  PhTrash,
  PhWarning,
  PhX,
  PhArrowsClockwise,
} from '@phosphor-icons/vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import {
  LEVEL_SHORT,
  LOG_LEVELS,
  buildSearchRegex,
  extractLevel,
  splitLineParts,
  stripAnsi,
  type LinePart,
  type LogLevel,
} from '@/shared/log/logLine';
import { localServiceForFile, type LogPreset } from '@/shared/log/logViewerPresets';
import { useLogStream, LOCAL_LOG_HOST, type LogConnectionStatus, type LogRestartState } from '@/shared/log/useLogStream';
import {
  groupRemoteLogItems,
  remoteRestartBlocker,
  remoteRestartCommand,
  type ServiceCheckLike,
  type VpsLogItem,
} from '@/shared/log/vpsLogItems';

const props = withDefaults(
  defineProps<{
    /** Gate: the socket lives exactly while this is true. */
    active: boolean;
    /** Same-origin WebSocket origin, e.g. `ws://host:port`. */
    wsBase: string;
    /** Local file subscribed on connect. */
    defaultFile?: string;
    /** Initial server line window. */
    defaultLines?: number;
    /** Toolbar preset set (see `logViewerPresets.ts`). */
    presets?: readonly LogPreset[];
    /** Preset key activated on mount. */
    defaultPreset?: string;
    /** Render the target list as a column instead of a header dropdown. */
    showSidebar?: boolean;
    /** Render the remote host selector above the target list. */
    showHost?: boolean;
    /** Render the restart control. */
    showRestart?: boolean;
    /** REST-provided local file list; falls back to the WS `list_local_logs` reply. */
    files?: readonly string[];
    /** REST-provided local file sizes keyed by file name. */
    fileSizes?: Record<string, number>;
    /** `page` = full-height workspace, `card` = panel body. */
    variant?: 'page' | 'card';
    /** Remote host list; non-empty enables the host selector and remote mode. */
    hosts?: readonly string[];
    /** Remote log targets for the selected host (see `remoteLogItems`). */
    remoteItems?: readonly VpsLogItem[];
    /** Health checks for the selected host, used to gate remote restart. */
    serviceChecks?: Record<string, ServiceCheckLike>;
    /** Remote host selected on mount. */
    defaultHost?: string;
    /** Remote service selected on mount. */
    defaultService?: string;
  }>(),
  {
    defaultFile: '',
    defaultLines: 200,
    presets: () => [],
    defaultPreset: '',
    showSidebar: false,
    showHost: false,
    showRestart: false,
    files: () => [],
    fileSizes: () => ({}),
    variant: 'card',
    hosts: () => [],
    remoteItems: () => [],
    serviceChecks: () => ({}),
    defaultHost: LOCAL_LOG_HOST,
    defaultService: '',
  }
);

const emit = defineEmits<{
  (event: 'fileChange', file: string): void;
  (event: 'serviceChange', service: string): void;
  (event: 'hostChange', host: string): void;
  (event: 'connection', status: LogConnectionStatus): void;
}>();

const { t } = useI18n();

const LINE_OPTIONS = [200, 500, 1000, 2000, 5000, 10000, 25000, 50000] as const;

const lineLimit = ref(props.defaultLines);
const visibleLevels = ref<Set<LogLevel>>(new Set(LOG_LEVELS));
const activePreset = ref(props.defaultPreset);
const searchText = ref('');
const activeTerm = ref('');
const activeIsRegex = ref(false);
const filterMode = ref(true);
const showLineNumbers = ref(false);
const isRefreshing = ref(false);
const currentMatch = ref(-1);
const isScrolledUp = ref(false);
const terminalEl = ref<HTMLElement | null>(null);

let atBottom = true;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const stream = useLogStream({
  active: () => props.active,
  wsBase: () => props.wsBase,
  defaultFile: props.defaultFile,
  defaultHost: props.defaultHost,
  defaultService: props.defaultService,
  lines: () => lineLimit.value,
});

const isLocalTarget = computed(() => stream.host.value === LOCAL_LOG_HOST);

/* ── local file list ───────────────────────────────────────────────── */

const fileList = computed<string[]>(() => {
  const restProvided = props.files.filter(Boolean);
  const fromServer = stream.serverFiles.value;
  const base = restProvided.length ? restProvided : fromServer;
  const merged = [...base];
  if (props.defaultFile && !merged.includes(props.defaultFile)) merged.unshift(props.defaultFile);
  return merged;
});

function formatBytes(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value < 0) return '';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let scaled = value / 1024;
  let unitIndex = 0;
  while (scaled >= 1024 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex += 1;
  }
  return `${scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)} ${units[unitIndex]}`;
}

const targetSize = computed(() => formatBytes(stream.fileSize.value));

/* ── remote item list ──────────────────────────────────────────────── */

const remoteGroups = computed(() => groupRemoteLogItems(props.remoteItems));
const remoteHasItems = computed(() => props.remoteItems.length > 0);

function isActiveTarget(item: VpsLogItem): boolean {
  if (!isLocalTarget.value) return item.value === stream.remoteService.value;
  return item.value === stream.streamFile.value;
}

/* ── presets ───────────────────────────────────────────────────────── */

function presetLabel(preset: LogPreset): string {
  return preset.labelKey ? t(preset.labelKey) : preset.label ?? preset.key;
}

function applyPreset(key: string): void {
  activePreset.value = key;
  currentMatch.value = -1;
  searchText.value = '';
  const preset = props.presets.find((candidate) => candidate.key === key);
  activeTerm.value = preset?.pattern ?? '';
  activeIsRegex.value = Boolean(preset);
}

function clearPreset(): void {
  activePreset.value = '';
  currentMatch.value = -1;
  activeTerm.value = '';
  activeIsRegex.value = false;
}

/* ── search ────────────────────────────────────────────────────────── */

const searchRegex = computed(() => buildSearchRegex(activeTerm.value, activeIsRegex.value));

interface VisibleEntry {
  index: number;
  level: LogLevel;
  text: string;
  parts: LinePart[];
}

const visibleEntries = computed<VisibleEntry[]>(() => {
  const matcher = searchRegex.value;
  const levels = visibleLevels.value;
  const entries: VisibleEntry[] = [];
  for (let index = 0; index < stream.lines.value.length; index += 1) {
    const clean = stripAnsi(stream.lines.value[index]!);
    const level = extractLevel(clean);
    if (!levels.has(level)) continue;
    const matched = matcher ? matcher.test(clean) : false;
    if (matcher && filterMode.value && !matched) continue;
    const parts = matcher && matched ? splitLineParts(clean, activeTerm.value, activeIsRegex.value, matcher) : [{ text: clean, hit: false }];
    entries.push({ index, level, text: clean, parts });
  }
  return entries;
});

const matchPositions = computed<number[]>(() =>
  searchRegex.value
    ? visibleEntries.value.filter((entry) => entry.parts.some((part) => part.hit)).map((entry) => entry.index)
    : []
);

const matchCount = computed(() => matchPositions.value.length);

function stepMatch(direction: number): void {
  const matches = matchPositions.value;
  if (!matches.length) {
    currentMatch.value = -1;
    return;
  }
  const position = matches.indexOf(currentMatch.value);
  const next = matches[(position + direction + matches.length) % matches.length]!;
  currentMatch.value = next;
  void nextTick(() => {
    terminalEl.value?.querySelector(`[data-line="${next}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function onSearchInput(): void {
  activePreset.value = '';
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    currentMatch.value = -1;
    activeTerm.value = searchText.value.trim();
    activeIsRegex.value = false;
  }, 200);
}

function clearSearch(): void {
  searchText.value = '';
  clearPreset();
}

/* ── levels ────────────────────────────────────────────────────────── */

function toggleLevel(level: LogLevel): void {
  const next = new Set(visibleLevels.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  visibleLevels.value = next;
}

/* ── host actions ──────────────────────────────────────────────────── */

function onFileSelect(file: string): void {
  if (!file || file === stream.streamFile.value) return;
  stream.setFile(file);
  emit('fileChange', file);
}

function onRemoteItemSelect(item: VpsLogItem): void {
  if (item.value === stream.remoteService.value) return;
  stream.setService(item.value);
  emit('serviceChange', item.value);
}

function onHostSelect(host: string): void {
  if (!host || host === stream.host.value) return;
  stream.setHost(host);
  emit('hostChange', host);
}

function reloadLog(): void {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  currentMatch.value = -1;
  if (stream.connectionStatus.value === 'connected') stream.subscribe();
  else stream.connect();
  setTimeout(() => {
    isRefreshing.value = false;
  }, 600);
}

function downloadLog(): void {
  if (!stream.lines.value.length) return;
  const blob = new Blob([stream.lines.value.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const baseName = (isLocalTarget.value ? stream.viewFile.value : stream.remoteService.value.replace(/[:/]/g, '_')) || 'log';
  anchor.download = `${baseName.replace(/\.log$/i, '')}_${timestamp}.log`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function onTerminalScroll(): void {
  const element = terminalEl.value;
  if (!element) return;
  atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 40;
  isScrolledUp.value = !atBottom && stream.lines.value.length > 20;
}

function scrollToBottom(): void {
  atBottom = true;
  isScrolledUp.value = false;
  const element = terminalEl.value;
  if (element) element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
}

watch(
  () => stream.lines.value.length,
  () => {
    if (!atBottom) return;
    void nextTick(() => {
      const element = terminalEl.value;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }
);

/* Local-only hosts pin no default file: once the file list arrives, open the
   first entry so the terminal is never blank. Remote targets are chosen by the
   host page (Instances / Services actions) or by the sidebar. */
watch(
  fileList,
  (list) => {
    if (!isLocalTarget.value || stream.streamFile.value || !list.length) return;
    const first = list[0]!;
    stream.setFile(first);
    emit('fileChange', first);
  },
  { immediate: true }
);

/* Keep the API-keys behaviour: the [ApiKeys] preset only applies to the file
   it was written for; any other target falls back to the unfiltered view, and
   returning to the default file re-arms it. */
watch(
  () => stream.streamFile.value,
  (file) => {
    if (!props.defaultPreset) return;
    if (file === props.defaultFile) applyPreset(props.defaultPreset);
    else clearPreset();
  }
);

watch(
  () => stream.connectionStatus.value,
  (status) => emit('connection', status)
);

if (props.defaultPreset) applyPreset(props.defaultPreset);

onBeforeUnmount(() => {
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = null;
});

/* ── presentation helpers ──────────────────────────────────────────── */

function levelButtonClass(level: LogLevel): string {
  if (!visibleLevels.value.has(level)) {
    return 'opacity-40 border-border-default bg-elevated/20 text-muted';
  }
  switch (level) {
    case 'DEBUG':
      return 'border-border-default bg-elevated text-secondary';
    case 'INFO':
      return 'border-accent/40 bg-accent/15 text-accent-soft';
    case 'WARNING':
      return 'border-warning/40 bg-warning/15 text-warning-soft';
    case 'ERROR':
      return 'border-danger/40 bg-danger/15 text-danger-soft';
    case 'CRITICAL':
      return 'border-danger/60 bg-danger/25 text-danger-soft ring-1 ring-danger/40';
  }
}

function lineClass(level: LogLevel): string {
  switch (level) {
    case 'DEBUG':
      return 'text-muted';
    case 'WARNING':
      return 'border-l-2 border-warning/70 bg-warning/5 pl-2 text-warning-soft';
    case 'ERROR':
      return 'border-l-2 border-danger/80 bg-danger/5 pl-2 text-danger-soft';
    case 'CRITICAL':
      return 'border-l-2 border-danger bg-danger/15 pl-2 font-bold text-danger-soft';
    default:
      return '';
  }
}

function itemIconClass(item: VpsLogItem): string {
  switch (item.kind) {
    case 'bot':
      return 'text-accent';
    case 'error':
      return 'text-danger';
    case 'archive':
      return 'text-secondary';
    default:
      return 'text-muted';
  }
}

function itemIcon(item: VpsLogItem) {
  switch (item.kind) {
    case 'bot':
      return PhRobot;
    case 'error':
      return PhWarning;
    case 'archive':
      return PhArchive;
    case 'file':
      return PhFileText;
    default:
      return PhGear;
  }
}

const connectionText = computed<string>(() => {
  if (stream.connectionIssue.value === 'session-expired') return t('shared.log.connSessionExpired');
  if (stream.connectionIssue.value === 'error') return t('shared.log.connError');
  switch (stream.connectionStatus.value) {
    case 'connected':
      return t('shared.log.connected');
    case 'connecting':
      return t('shared.log.connecting');
    default:
      return t('shared.log.disconnected');
  }
});

const connectionBadgeClass = computed<string>(() => {
  if (stream.connectionStatus.value === 'connected' && stream.connectionIssue.value === 'none') {
    return 'border-success/30 bg-success/10 text-success-soft';
  }
  if (stream.connectionStatus.value === 'connecting') return 'border-warning/30 bg-warning/10 text-warning-soft';
  return 'border-danger/30 bg-danger/10 text-danger-soft';
});

const connectionDotClass = computed<string>(() => {
  if (stream.connectionStatus.value === 'connected' && stream.connectionIssue.value === 'none') {
    return 'bg-success';
  }
  if (stream.connectionStatus.value === 'connecting') return 'bg-warning';
  return 'bg-danger';
});

const restartLabel = computed<string>(() => {
  const state: LogRestartState = stream.restartState.value;
  if (state === 'restarting') return t('shared.log.restarting');
  if (state === 'restarted') return t('shared.log.restarted');
  if (state === 'failed') return t('shared.log.failed');
  return t('shared.log.restart');
});

const restartButtonClass = computed<string>(() => {
  const state = stream.restartState.value;
  if (state === 'restarted') return 'border-success/40 bg-success/15 text-success-soft';
  if (state === 'failed') return 'border-danger/40 bg-danger/15 text-danger-soft';
  return '';
});

/** Remote restart is hidden when the service is disabled or not expected. */
const restartAvailable = computed<boolean>(() => {
  if (!props.showRestart) return false;
  if (isLocalTarget.value) return Boolean(localServiceForFile(stream.streamFile.value));
  if (remoteRestartBlocker(stream.remoteService.value, props.serviceChecks)) return false;
  return Boolean(remoteRestartCommand(stream.host.value, stream.remoteService.value));
});

const hasContent = computed(() => visibleEntries.value.length > 0);

defineExpose({
  setFile: (file: string) => stream.setFile(file),
  fetchFile: (file: string) => stream.fetchFile(file),
  setHost: (host: string) => stream.setHost(host),
  setService: (service: string) => stream.setService(service),
  setTarget: (host: string, service: string) => stream.setTarget(host, service),
  reload: reloadLog,
});
</script>

<template>
  <div class="log-viewer flex min-h-0 min-w-0 flex-1 overflow-hidden" :class="variant === 'card' ? 'gap-3' : 'gap-0'">
    <!-- Target column (full-page layout) -->
    <aside
      v-if="showSidebar && (isLocalTarget ? fileList.length : remoteHasItems)"
      class="log-viewer__files flex w-[clamp(190px,18vw,270px)] shrink-0 flex-col gap-1 overflow-y-auto rounded-lg border border-border-subtle bg-page/60 p-2"
      data-test="log-file-list"
    >
      <template v-if="isLocalTarget">
        <div class="px-1 pb-1 text-micro font-bold uppercase tracking-label text-muted">{{ t('shared.log.files') }}</div>
        <button
          v-for="file in fileList"
          :key="file"
          type="button"
          class="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left font-mono text-compact transition-colors"
          :class="
            file === stream.streamFile.value
              ? 'border-accent/24 bg-accent/12 text-primary'
              : 'border-transparent bg-transparent text-secondary hover:bg-accent/8'
          "
          :data-test="`log-file-item-${file}`"
          :aria-pressed="file === stream.streamFile.value"
          @click="onFileSelect(file)"
        >
          <span class="truncate">{{ file }}</span>
          <span v-if="fileSizes[file]" class="shrink-0 text-micro text-muted">{{ formatBytes(fileSizes[file] ?? null) }}</span>
        </button>
      </template>

      <template v-else>
        <template v-for="group in ([
          { key: 'services', label: t('shared.log.services'), items: remoteGroups.services },
          { key: 'bots', label: t('shared.log.bots'), items: remoteGroups.bots },
          { key: 'files', label: t('shared.log.files'), items: remoteGroups.files },
        ] as const)" :key="group.key">
          <template v-if="group.items.length">
            <div class="px-1 pb-1 pt-1.5 text-micro font-bold uppercase tracking-label text-muted">{{ group.label }}</div>
            <button
              v-for="item in group.items"
              :key="item.value"
              type="button"
              class="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-compact transition-colors"
              :class="
                isActiveTarget(item)
                  ? 'border-accent/24 bg-accent/12 text-primary'
                  : 'border-transparent bg-transparent text-secondary hover:bg-accent/8'
              "
              :data-test="`log-remote-item-${item.value}`"
              :title="item.value"
              :aria-pressed="isActiveTarget(item)"
              @click="onRemoteItemSelect(item)"
            >
              <PbIcon :icon="itemIcon(item)" :size="12" :class="itemIconClass(item)" />
              <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
              <span v-if="item.detail" class="shrink-0 text-micro text-muted">{{ item.detail }}</span>
            </button>
          </template>
        </template>
      </template>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <!-- Header row: host selector (remote-capable) and/or the local file dropdown -->
      <div v-if="showHost || !showSidebar" class="flex shrink-0 flex-wrap items-center gap-2">
        <template v-if="showHost">
          <span class="text-xs text-secondary">{{ t('shared.log.host') }}</span>
          <SelectRoot :model-value="stream.host.value" @update:model-value="onHostSelect(String($event))">
            <SelectTrigger class="h-8 w-auto min-w-[130px] text-xs" data-test="log-host-select">
              <span>{{ stream.host.value === LOCAL_LOG_HOST ? t('shared.log.local') : stream.host.value }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="LOCAL_LOG_HOST">{{ t('shared.log.local') }}</SelectItem>
              <SelectItem v-for="host in hosts" :key="host" :value="host">{{ host }}</SelectItem>
            </SelectContent>
          </SelectRoot>
        </template>

        <template v-if="!showSidebar && isLocalTarget">
          <span class="text-xs text-secondary">{{ t('shared.log.files') }}:</span>
          <SelectRoot :model-value="stream.streamFile.value" @update:model-value="onFileSelect(String($event))">
            <SelectTrigger class="h-8 min-w-[170px] font-mono text-xs" data-test="log-file-select">
              <span>{{ stream.streamFile.value || t('shared.log.noFile') }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="file in fileList" :key="file" :value="file">
                <span class="font-mono text-xs">{{ file }}</span>
              </SelectItem>
            </SelectContent>
          </SelectRoot>
        </template>
      </div>

      <!-- Toolbar -->
      <div
        class="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-border-subtle bg-page/60 px-2.5 py-1.5"
        data-test="log-toolbar"
      >
        <span class="text-micro text-secondary">{{ t('shared.log.lines') }}</span>
        <SelectRoot v-model="lineLimit">
          <SelectTrigger class="h-6 w-auto min-w-[72px] font-mono text-micro" data-test="log-lines">
            <span>{{ lineLimit === 50000 ? 'Max' : lineLimit }}</span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="option in LINE_OPTIONS" :key="option" :value="option">
              {{ option === 50000 ? 'Max (50,000)' : option }}
            </SelectItem>
          </SelectContent>
        </SelectRoot>

        <span v-if="targetSize" class="font-mono text-micro text-muted" data-test="log-size">{{ targetSize }}</span>

        <span class="mx-1 h-4 w-px bg-border-default" />

        <Button
          v-for="level in LOG_LEVELS"
          :key="level"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 font-mono text-micro font-bold transition-all"
          :class="levelButtonClass(level)"
          :data-lvl="level"
          :aria-pressed="visibleLevels.has(level)"
          @click="toggleLevel(level)"
        >
          {{ LEVEL_SHORT[level] }}
        </Button>

        <span class="mx-1 h-4 w-px bg-border-default" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :class="
            activePreset === ''
              ? 'border-accent/40 bg-accent/15 font-semibold text-accent-soft ring-1 ring-accent/30'
              : 'border-border-default bg-elevated/40 text-muted'
          "
          data-test="preset-all"
          @click="clearPreset"
        >
          {{ t('common.all') }}
        </Button>
        <Button
          v-for="preset in presets"
          :key="preset.key"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :class="
            activePreset === preset.key
              ? 'border-accent/40 bg-accent/15 font-semibold text-accent-soft ring-1 ring-accent/30'
              : 'border-border-default bg-elevated/40 text-muted'
          "
          :data-test="`preset-${preset.key}`"
          @click="applyPreset(preset.key)"
        >
          {{ presetLabel(preset) }}
        </Button>

        <span class="mx-1 h-4 w-px bg-border-default" />

        <div class="relative flex items-center">
          <Input
            v-model="searchText"
            class="h-6 w-36 pr-6 text-xs sm:w-44"
            :placeholder="t('shared.log.searchLogs')"
            data-test="log-search"
            type="text"
            @input="onSearchInput"
            @keydown.enter.prevent="stepMatch($event.shiftKey ? -1 : 1)"
          />
          <button
            v-if="searchText"
            type="button"
            class="absolute right-1.5 cursor-pointer text-muted hover:text-primary"
            @click="clearSearch"
          >
            <PbIcon :icon="PhX" :size="12" />
          </button>
        </div>

        <label class="flex cursor-pointer items-center gap-1.5 text-micro text-secondary">
          <Checkbox :model-value="filterMode" data-test="log-filter" @update:model-value="filterMode = Boolean($event)" />
          <span>{{ t('shared.log.filter') }}</span>
        </label>

        <span v-if="searchRegex" class="flex items-center gap-1 whitespace-nowrap text-micro text-muted" data-test="log-matches">
          {{ t('shared.log.matches', { count: matchCount }) }}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-5 w-5 p-0"
            :title="t('shared.log.prevMatch')"
            :aria-label="t('shared.log.prevMatch')"
            @click="stepMatch(-1)"
          >
            <PbIcon :icon="PhCaretUp" :size="12" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-5 w-5 p-0"
            :title="t('shared.log.nextMatch')"
            :aria-label="t('shared.log.nextMatch')"
            @click="stepMatch(1)"
          >
            <PbIcon :icon="PhCaretDown" :size="12" />
          </Button>
        </span>

        <span class="flex-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :class="showLineNumbers ? 'border-accent/40 bg-accent/15 text-accent-soft' : 'border-border-default bg-elevated/40 text-muted'"
          :title="t('shared.log.linesBtn')"
          data-test="log-linenums"
          @click="showLineNumbers = !showLineNumbers"
        >
          <PbIcon :icon="PhListNumbers" :size="13" />
          <span class="hidden sm:inline">{{ t('shared.log.linesBtn') }}</span>
        </Button>

        <Button
          v-if="restartAvailable"
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :class="restartButtonClass"
          :disabled="stream.restartState.value === 'restarting'"
          :title="t('shared.log.restart')"
          data-test="log-restart"
          @click="stream.restart()"
        >
          <PbIcon :icon="PhArrowsClockwise" :size="12" />
          <span>{{ restartLabel }}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro transition-colors"
          :class="stream.streaming.value ? 'border-success/40 bg-success/15 text-success-soft' : 'border-border-default bg-elevated/40 text-muted'"
          data-test="log-stream"
          @click="stream.toggleStream()"
        >
          <PbIcon :icon="stream.streaming.value ? PhPause : PhPlay" :size="12" />
          <span>{{ stream.streaming.value ? t('shared.log.pause') : t('shared.log.stream') }}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :title="t('shared.log.fetch')"
          data-test="log-reload"
          @click="reloadLog"
        >
          <PbIcon :icon="PhArrowClockwise" :size="12" :class="{ 'animate-spin': isRefreshing }" />
          <span>{{ t('shared.log.fetch') }}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro hover:border-danger/36 hover:bg-danger/15 hover:text-danger-soft"
          data-test="log-clear"
          @click="stream.clearLines()"
        >
          <PbIcon :icon="PhTrash" :size="12" />
          <span>{{ t('shared.log.clear') }}</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-6 px-1.5 text-micro"
          :title="t('shared.log.download')"
          :disabled="!stream.lines.value.length"
          data-test="log-download"
          @click="downloadLog"
        >
          <PbIcon :icon="PhDownloadSimple" :size="12" />
          <span>{{ t('shared.log.download') }}</span>
        </Button>

        <div
          class="flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-micro font-medium"
          :class="connectionBadgeClass"
          data-test="log-conn"
        >
          <span class="inline-block h-1.5 w-1.5 rounded-full" :class="connectionDotClass" />
          <span>{{ connectionText }}</span>
        </div>
      </div>

      <!-- Terminal -->
      <div class="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border-default bg-page">
        <div
          ref="terminalEl"
          class="h-full select-text overflow-y-auto p-2.5 font-mono text-xs leading-relaxed"
          data-test="log-terminal"
          @scroll="onTerminalScroll"
        >
          <div
            v-for="entry in visibleEntries"
            :key="entry.index"
            :data-line="entry.index"
            class="flex min-h-[1.5em] items-start rounded-sm py-0.5 transition-colors hover:bg-accent/7"
            :class="[lineClass(entry.level), { 'bg-accent/15 ring-1 ring-accent/40': entry.index === currentMatch }]"
          >
            <span
              v-if="showLineNumbers"
              class="mr-3 w-10 shrink-0 select-none text-right font-mono text-micro text-muted/60"
            >
              {{ entry.index + 1 }}
            </span>
            <div class="min-w-0 flex-1 break-all">
              <template v-if="searchRegex">
                <span v-for="(part, partIndex) in entry.parts" :key="partIndex">
                  <mark v-if="part.hit" class="rounded-sm bg-warning/30 px-0.5 text-primary">{{ part.text }}</mark>
                  <template v-else>{{ part.text }}</template>
                </span>
              </template>
              <template v-else>{{ entry.text }}</template>
            </div>
          </div>

          <div
            v-if="!hasContent"
            class="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-muted"
            data-test="log-empty"
          >
            <span
              v-if="stream.connectionStatus.value === 'connecting'"
              class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-accent"
            />
            <span class="text-xs">{{ stream.connectionStatus.value === 'connecting' ? t('shared.log.connecting') : t('common.noData') }}</span>
          </div>
        </div>

        <Button
          v-if="isScrolledUp"
          type="button"
          variant="secondary"
          size="sm"
          class="absolute bottom-3 right-4 h-7 gap-1 border-border-default bg-panel/90 text-xs shadow-md backdrop-blur-sm hover:bg-elevated"
          data-test="scroll-bottom"
          @click="scrollToBottom"
        >
          <PbIcon :icon="PhArrowDown" :size="12" />
          <span aria-hidden="true">↓</span>
        </Button>
      </div>
    </div>
  </div>
</template>
