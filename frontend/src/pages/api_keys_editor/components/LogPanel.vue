<script setup lang="ts">
/**
 * Modern Vue 3 + Tailwind CSS Log Panel for "系统 / API 密钥 / 日志".
 * Replaces the legacy LogViewerPanel DOM injection with a reactive component
 * styled using @theme tokens, shadcn-vue style UI components and Phosphor icons.
 *
 * Connects to /ws/vps via WebSocket:
 *   - Auto-lists local log files on open via { cmd: 'list_local_logs' }
 *   - Subscribes to PBGui.log by default (which contains [ApiKeys] activity)
 *   - Default active preset is '[ApiKeys]' to filter API key operational logs
 *   - Supports switching log files, presets, search text, level toggles,
 *     filter mode, streaming/pause, clear, line numbers, and log download.
 */
import {
  PhArrowClockwise,
  PhArrowDown,
  PhCaretDown,
  PhCaretUp,
  PhDownloadSimple,
  PhListNumbers,
  PhPause,
  PhPlay,
  PhScroll,
  PhTrash,
  PhX,
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
import BackButton from './BackButton.vue';
import { wsBase } from '../config';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();

const INITIAL_LINES = 200;
const MAX_LINES = 5000;
const RECONNECT_DELAY_MS = 2000;

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];
const LEVEL_SHORT: Record<LogLevel, string> = {
  DEBUG: 'DBG',
  INFO: 'INF',
  WARNING: 'WRN',
  ERROR: 'ERR',
  CRITICAL: 'CRT',
};

interface LinePart {
  text: string;
  hit: boolean;
}

interface VisibleEntry {
  index: number;
  line: {
    text: string;
    level: LogLevel;
    parts: LinePart[];
  };
}

const selectedFile = ref('PBGui.log');
const availableFiles = ref<string[]>(['PBGui.log']);
const lines = ref<string[]>([]);
const conn = ref(t('shared.log.connecting'));
const connStatus = ref<'connected' | 'connecting' | 'disconnected'>('connecting');
const streaming = ref(false);
const visibleLevels = ref(new Set<LogLevel>(LOG_LEVELS));
const activePreset = ref<'all' | 'apikeys' | 'errors' | 'warnings'>('apikeys');
const searchText = ref('');
const activeTerm = ref('\\[ApiKeys\\]');
const activeIsRegex = ref(true);
const filterMode = ref(true);
const showLineNumbers = ref(false);
const isRefreshing = ref(false);
const currentMatch = ref(-1);
const isScrolledUp = ref(false);
const terminalEl = ref<HTMLElement | null>(null);

let ws: WebSocket | null = null;
let sid = 0;
let closed = false;
let authExpired = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let atBottom = true;

/** Strip ANSI control codes from incoming log lines. */
function stripAnsi(line: string): string {
  return line.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Extract log level with standard PBGui regex order and precedence. */
function extractLevel(clean: string): LogLevel {
  if (/\b(fatal|failed)\s*:/i.test(clean) || /\b(unreachable|failed)=\s*[1-9]\d*\b/i.test(clean)) return 'ERROR';
  if (/\[WARNING\]:/i.test(clean) || /\bWARNING\b/i.test(clean)) return 'WARNING';
  if (/\bchanged\s*:/i.test(clean) || /\bchanged=\s*[1-9]\d*\b/i.test(clean)) return 'WARNING';
  const bracket = clean.match(/\[(DEBUG|INFO|WARNING|ERROR|CRITICAL)\]/i);
  if (bracket) return bracket[1]!.toUpperCase() as LogLevel;
  const word = clean.match(/\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL)\b/i);
  if (word) {
    const level = word[1]!.toUpperCase();
    return (level === 'WARN' ? 'WARNING' : level) as LogLevel;
  }
  return 'INFO';
}

function normalizeIncoming(raw: unknown[]): string[] {
  return raw.map((line) => String(line ?? '').replace(/\r\n?/g, '\n'));
}

const searchTestRe = computed<RegExp | null>(() => {
  const term = activeTerm.value;
  if (!term) return null;
  try {
    return activeIsRegex.value ? new RegExp(term, 'i') : new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  } catch {
    return null;
  }
});

const searchSplitRe = computed<RegExp | null>(() => {
  const term = activeTerm.value;
  if (!term) return null;
  try {
    return activeIsRegex.value ? new RegExp(`(${term})`, 'gi') : new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  } catch {
    return null;
  }
});

const visible = computed<VisibleEntry[]>(() => {
  const re = searchTestRe.value;
  const splitRe = searchSplitRe.value;
  const levels = visibleLevels.value;
  const isFilter = filterMode.value;
  const result: VisibleEntry[] = [];

  for (let i = 0; i < lines.value.length; i++) {
    const raw = lines.value[i]!;
    const clean = stripAnsi(raw);
    const level = extractLevel(clean);
    if (!levels.has(level)) continue;

    const matches = re ? re.test(clean) : false;
    if (re && isFilter && !matches) continue;

    let parts: LinePart[] = [];
    if (splitRe && re && matches) {
      const activeRe = re;
      parts = clean.split(splitRe).filter(Boolean).map((t) => ({
        text: t,
        hit: activeRe.test(t),
      }));
    } else {
      parts = [{ text: clean, hit: false }];
    }

    result.push({
      index: i,
      line: {
        text: clean,
        level,
        parts,
      },
    });
  }
  return result;
});

const matchPositions = computed<VisibleEntry[]>(() => {
  if (!searchTestRe.value) return [];
  return visible.value.filter((entry) => entry.line.parts.some((p) => p.hit));
});

const matchCount = computed<number>(() => matchPositions.value.length);

function searchMatchStep(direction: number): void {
  const matches = matchPositions.value;
  if (matches.length === 0) {
    currentMatch.value = -1;
    return;
  }
  const pos = matches.findIndex((m) => m.index === currentMatch.value);
  const next = matches[(pos + direction + matches.length) % matches.length]!;
  currentMatch.value = next.index;
  void nextTick(() => {
    terminalEl.value
      ?.querySelector(`[data-line="${next.index}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function toggleLevel(level: LogLevel): void {
  const next = new Set(visibleLevels.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  visibleLevels.value = next;
}

function togglePreset(preset: 'all' | 'apikeys' | 'errors' | 'warnings'): void {
  activePreset.value = preset;
  searchText.value = '';
  currentMatch.value = -1;
  if (preset === 'all') {
    activeTerm.value = '';
    activeIsRegex.value = false;
  } else if (preset === 'apikeys') {
    activeTerm.value = '\\[ApiKeys\\]';
    activeIsRegex.value = true;
  } else if (preset === 'errors') {
    activeTerm.value = 'error|traceback|exception';
    activeIsRegex.value = true;
  } else if (preset === 'warnings') {
    activeTerm.value = 'warning|warn';
    activeIsRegex.value = true;
  }
}

function onSearchInput(): void {
  activePreset.value = 'all';
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
  activeTerm.value = '';
  activeIsRegex.value = false;
  currentMatch.value = -1;
  activePreset.value = 'all';
}

function send(obj: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function subscribe(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (streaming.value) send({ cmd: 'unsubscribe_local_logs' });
  lines.value = [];
  sid += 1;
  send({
    cmd: 'subscribe_local_logs',
    file: selectedFile.value,
    lines: INITIAL_LINES,
    sid,
    start_at_end: false,
  });
  streaming.value = true;
}

function toggleStream(): void {
  if (streaming.value) {
    send({ cmd: 'unsubscribe_local_logs' });
    streaming.value = false;
  } else {
    subscribe();
  }
}

function clearTerminal(): void {
  lines.value = [];
  currentMatch.value = -1;
}

function handleMsg(msg: {
  type?: string;
  files?: string[];
  sid?: number;
  lines?: unknown[];
  streaming?: boolean;
}): void {
  if (msg.type === 'local_log_files') {
    const list = Array.isArray(msg.files) ? msg.files.filter(Boolean) : [];
    if (!list.includes('PBGui.log')) list.unshift('PBGui.log');
    availableFiles.value = list;
    return;
  }
  if (msg.sid !== undefined && msg.sid !== sid) return;
  if (msg.type === 'local_logs') {
    lines.value = normalizeIncoming(msg.lines ?? []);
    streaming.value = Boolean(msg.streaming);
  } else if (msg.type === 'local_log_lines') {
    const appended = [...lines.value, ...normalizeIncoming(msg.lines ?? [])];
    lines.value = appended.slice(-MAX_LINES);
  }
}

function connect(): void {
  if (authExpired || closed) return;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  disconnect();
  conn.value = t('shared.log.connecting');
  connStatus.value = 'connecting';
  const sock = new WebSocket(`${wsBase()}/ws/vps`);
  ws = sock;
  sock.onopen = () => {
    if (ws !== sock) return;
    conn.value = t('shared.log.connected');
    connStatus.value = 'connected';
    send({ cmd: 'list_local_logs' });
    subscribe();
  };
  sock.onmessage = (evt: MessageEvent) => {
    try {
      handleMsg(JSON.parse(String(evt.data)));
    } catch {
      /* ignore JSON parse error */
    }
  };
  sock.onerror = () => {
    if (ws !== sock) return;
    conn.value = t('shared.log.connError');
    connStatus.value = 'disconnected';
  };
  sock.onclose = (evt: CloseEvent) => {
    if (ws !== sock) return;
    ws = null;
    streaming.value = false;
    if (evt.code === 4001) {
      authExpired = true;
      closed = true;
      conn.value = t('shared.log.connSessionExpired');
      connStatus.value = 'disconnected';
      window.location.replace('/');
      return;
    }
    conn.value = t('shared.log.disconnected');
    connStatus.value = 'disconnected';
    if (!authExpired && !closed && reconnectTimer === null && props.visible) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!authExpired && !closed && props.visible) connect();
      }, RECONNECT_DELAY_MS);
    }
  };
}

function disconnect(): void {
  if (ws) {
    try {
      ws.close();
    } catch {
      /* ignore */
    }
    ws = null;
  }
  streaming.value = false;
}

function onFileChange(file: string): void {
  if (!file || file === selectedFile.value) return;
  selectedFile.value = file;
  lines.value = [];
  currentMatch.value = -1;
  if (file !== 'PBGui.log' && activePreset.value === 'apikeys') {
    togglePreset('all');
  } else if (file === 'PBGui.log' && activePreset.value === 'all') {
    togglePreset('apikeys');
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    subscribe();
  }
}

function reloadLog(): void {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  lines.value = [];
  currentMatch.value = -1;
  if (ws && ws.readyState === WebSocket.OPEN) {
    subscribe();
  } else {
    connect();
  }
  setTimeout(() => {
    isRefreshing.value = false;
  }, 600);
}

function downloadLog(): void {
  if (!lines.value.length) return;
  const content = lines.value.join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.download = `${selectedFile.value.replace(/\.log$/i, '')}_${timestamp}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function onTerminalScroll(): void {
  const el = terminalEl.value;
  if (!el) return;
  atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
  isScrolledUp.value = !atBottom && lines.value.length > 20;
}

function scrollToBottom(): void {
  atBottom = true;
  isScrolledUp.value = false;
  const el = terminalEl.value;
  if (el) {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }
}

watch(
  () => lines.value.length,
  () => {
    if (!atBottom) return;
    void nextTick(() => {
      const el = terminalEl.value;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      closed = false;
      connect();
    } else {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      disconnect();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  closed = true;
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  if (searchTimer !== null) clearTimeout(searchTimer);
  reconnectTimer = null;
  searchTimer = null;
  disconnect();
});

function levelClass(lvl: LogLevel): string {
  if (!visibleLevels.value.has(lvl)) {
    return 'opacity-40 border-border-default bg-elevated/20 text-muted';
  }
  switch (lvl) {
    case 'DEBUG':
      return 'border-border-default bg-elevated text-secondary';
    case 'INFO':
      return 'border-info/40 bg-info/15 text-info-soft';
    case 'WARNING':
      return 'border-warning/40 bg-warning/15 text-warning-soft';
    case 'ERROR':
      return 'border-danger/40 bg-danger/15 text-danger-soft';
    case 'CRITICAL':
      return 'border-danger/60 bg-danger/25 text-danger-soft ring-1 ring-danger/40';
  }
}

function lineLevelBorder(lvl: LogLevel): string {
  switch (lvl) {
    case 'DEBUG':
      return 'text-muted border-transparent';
    case 'INFO':
      return 'text-secondary border-transparent';
    case 'WARNING':
      return 'border-l-2 border-warning/70 bg-warning/5 text-warning-soft pl-2';
    case 'ERROR':
      return 'border-l-2 border-danger/80 bg-danger/5 text-danger-soft pl-2';
    case 'CRITICAL':
      return 'border-l-2 border-danger bg-danger/15 text-danger-soft font-bold pl-2';
  }
}

const connDotClass = computed<string>(() => {
  switch (connStatus.value) {
    case 'connected':
      return 'bg-success shadow-[0_0_8px_rgba(74,222,128,0.6)] animate-pulse';
    case 'connecting':
      return 'bg-warning shadow-[0_0_8px_rgba(250,204,21,0.6)] animate-ping';
    case 'disconnected':
      return 'bg-danger';
  }
});

const connBadgeClass = computed<string>(() => {
  switch (connStatus.value) {
    case 'connected':
      return 'border-success/30 bg-success/10 text-success-soft';
    case 'connecting':
      return 'border-warning/30 bg-warning/10 text-warning-soft';
    case 'disconnected':
      return 'border-danger/30 bg-danger/10 text-danger-soft';
  }
});
</script>

<template>
  <div
    id="logPanel"
    v-show="visible"
    class="hl-expiry-panel mx-auto mb-5 flex h-[calc(100dvh-100px)] w-[min(100%,1500px)] flex-col rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3 shadow-sm select-none"
  >
    <!-- Card Header -->
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3 mb-3">
      <div class="flex items-center gap-3">
        <BackButton @back="emit('back')" />
        <div class="flex items-center gap-2">
          <h3 class="m-0 flex items-center gap-2 text-lg font-semibold tracking-tight text-primary">
            <PbIcon :icon="PhScroll" class="text-accent" />
            <span>{{ t('misc.apikeys.logs') }}</span>
          </h3>
          <span class="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 font-mono text-xs font-medium text-accent-soft">
            {{ selectedFile }}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-secondary hidden sm:inline">{{ t('shared.log.files') }}:</span>
          <SelectRoot :model-value="selectedFile" @update:model-value="onFileChange(String($event))">
            <SelectTrigger class="h-8 min-w-[170px] text-xs font-mono" data-test="log-file-select">
              <span>{{ selectedFile }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="file in availableFiles" :key="file" :value="file">
                <span class="font-mono text-xs">{{ file }}</span>
              </SelectItem>
            </SelectContent>
          </SelectRoot>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs"
          :title="t('shared.log.fetch')"
          data-test="log-reload"
          @click="reloadLog"
        >
          <PbIcon :icon="PhArrowClockwise" :size="14" :class="{ 'animate-spin': isRefreshing }" />
          <span class="hidden md:inline">{{ t('shared.log.fetch') }}</span>
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          class="h-8 gap-1.5 text-xs"
          :title="t('shared.log.download')"
          :disabled="!lines.length"
          data-test="log-download"
          @click="downloadLog"
        >
          <PbIcon :icon="PhDownloadSimple" :size="14" />
          <span class="hidden md:inline">{{ t('shared.log.download') }}</span>
        </Button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-workspace/60 px-2.5 py-1.5 mb-2.5">
      <!-- Level buttons -->
      <Button
        v-for="lvl in LOG_LEVELS"
        :key="lvl"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 font-mono text-[11px] font-bold transition-all"
        :class="levelClass(lvl)"
        :data-lvl="lvl"
        :aria-pressed="visibleLevels.has(lvl)"
        @click="toggleLevel(lvl)"
      >
        {{ LEVEL_SHORT[lvl] }}
      </Button>

      <span class="mx-1 h-4 w-px bg-border-default"></span>

      <!-- Presets -->
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="activePreset === 'all' ? 'border-accent/40 bg-accent/15 text-accent-soft ring-1 ring-accent/30 font-semibold' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="preset-all"
        @click="togglePreset('all')"
      >
        {{ t('common.all') }}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px] font-mono"
        :class="activePreset === 'apikeys' ? 'border-accent/40 bg-accent/15 text-accent-soft ring-1 ring-accent/30 font-bold' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="preset-apikeys"
        @click="togglePreset('apikeys')"
      >
        [ApiKeys]
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="activePreset === 'errors' ? 'border-danger/40 bg-danger/15 text-danger-soft ring-1 ring-danger/30 font-semibold' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="preset-errors"
        @click="togglePreset('errors')"
      >
        {{ t('shared.log.errors') }}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="activePreset === 'warnings' ? 'border-warning/40 bg-warning/15 text-warning-soft ring-1 ring-warning/30 font-semibold' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="preset-warnings"
        @click="togglePreset('warnings')"
      >
        {{ t('shared.log.warnings') }}
      </Button>

      <span class="mx-1 h-4 w-px bg-border-default"></span>

      <!-- Search Input -->
      <div class="relative flex items-center">
        <Input
          v-model="searchText"
          class="h-6 w-36 sm:w-44 pr-6 text-xs"
          :placeholder="t('shared.log.searchLogs')"
          data-test="log-search"
          type="text"
          @input="onSearchInput"
          @keydown.enter.prevent="searchMatchStep($event.shiftKey ? -1 : 1)"
        />
        <button
          v-if="searchText"
          type="button"
          class="absolute right-1.5 text-muted hover:text-primary cursor-pointer"
          @click="clearSearch"
        >
          <PbIcon :icon="PhX" :size="12" />
        </button>
      </div>

      <!-- Filter checkbox -->
      <label class="flex cursor-pointer items-center gap-1.5 text-[11px] text-secondary">
        <Checkbox :model-value="filterMode" data-test="log-filter" @update:model-value="filterMode = Boolean($event)" />
        <span>{{ t('shared.log.filter') }}</span>
      </label>

      <!-- Match counter -->
      <span v-if="searchTestRe" class="flex items-center gap-1 text-[11px] whitespace-nowrap text-muted" data-test="log-matches">
        {{ t('shared.log.matches', { count: matchCount }) }}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-5 w-5 p-0"
          :title="t('shared.log.prevMatch')"
          :aria-label="t('shared.log.prevMatch')"
          @click="searchMatchStep(-1)"
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
          @click="searchMatchStep(1)"
        >
          <PbIcon :icon="PhCaretDown" :size="12" />
        </Button>
      </span>

      <span class="flex-1"></span>

      <!-- Line numbers button -->
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="showLineNumbers ? 'border-accent/40 bg-accent/15 text-accent-soft' : 'border-border-default bg-elevated/40 text-muted'"
        :title="t('shared.log.linesBtn')"
        data-test="log-linenums"
        @click="showLineNumbers = !showLineNumbers"
      >
        <PbIcon :icon="PhListNumbers" :size="13" />
        <span class="hidden sm:inline">{{ t('shared.log.linesBtn') }}</span>
      </Button>

      <!-- Stream / Pause button -->
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px] transition-colors"
        :class="streaming ? 'border-success/40 bg-success/15 text-success-soft' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="log-stream"
        @click="toggleStream"
      >
        <PbIcon :icon="streaming ? PhPause : PhPlay" :size="12" />
        <span>{{ streaming ? t('shared.log.pause') : t('shared.log.stream') }}</span>
      </Button>

      <!-- Clear button -->
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px] hover:border-danger/36 hover:bg-danger/15 hover:text-danger-soft"
        data-test="log-clear"
        @click="clearTerminal"
      >
        <PbIcon :icon="PhTrash" :size="12" />
        <span>{{ t('shared.log.clear') }}</span>
      </Button>

      <!-- Connection status badge -->
      <div
        class="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
        :class="connBadgeClass"
        data-test="log-conn"
      >
        <span class="inline-block h-1.5 w-1.5 rounded-full" :class="connDotClass"></span>
        <span>{{ conn }}</span>
      </div>
    </div>

    <!-- Terminal Box -->
    <div class="relative flex-1 min-h-0 overflow-hidden rounded-lg border border-border-default bg-page">
      <div
        ref="terminalEl"
        class="h-full overflow-y-auto p-2.5 font-mono text-xs leading-relaxed select-text"
        data-test="log-terminal"
        @scroll="onTerminalScroll"
      >
        <div
          v-for="entry in visible"
          :key="entry.index"
          :data-line="entry.index"
          class="flex min-h-[1.5em] items-start rounded-sm py-0.5 hover:bg-accent/7 transition-colors"
          :class="[lineLevelBorder(entry.line.level), { 'bg-accent/15 ring-1 ring-accent/40': entry.index === currentMatch }]"
        >
          <span
            v-if="showLineNumbers"
            class="mr-3 w-10 shrink-0 select-none text-right font-mono text-[11px] text-muted/60"
          >
            {{ entry.index + 1 }}
          </span>
          <div class="min-w-0 flex-1 break-all">
            <template v-if="searchTestRe">
              <span v-for="(part, idx) in entry.line.parts" :key="idx">
                <mark v-if="part.hit" class="rounded-sm bg-warning/30 px-0.5 text-primary">{{ part.text }}</mark>
                <template v-else>{{ part.text }}</template>
              </span>
            </template>
            <template v-else>
              {{ entry.line.text }}
            </template>
          </div>
        </div>

        <div
          v-if="!visible.length"
          class="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-center text-muted"
          data-test="log-empty"
        >
          <span v-if="connStatus === 'connecting'" class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-secondary border-t-accent"></span>
          <span class="text-xs">{{ connStatus === 'connecting' ? t('shared.log.connecting') : t('common.noData') }}</span>
        </div>
      </div>

      <!-- Scroll to bottom button -->
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
        <span>↓</span>
      </Button>
    </div>
  </div>
</template>
