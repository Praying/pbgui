<script setup lang="ts">
/**
 * Live log terminal for the queue log dialog — Vue port of the legacy
 * LogViewerPanel (frontend/js/log_viewer_panel.js) restricted to the local
 * single-file mode the optimize log panel used (defaultHost 'local',
 * presets 'system', showRestart false):
 *
 *   - WS url: wsBase() + '/ws/vps' (token never on the URL; auth rides on
 *     the session, expiry arrives as close code 4001 -> redirect to '/')
 *   - onopen: send {cmd:'list_local_logs'} then subscribe_local_logs
 *     (lines 200, start_at_end false, sid bumped on every resubscribe)
 *   - fixed 2s reconnect after unexpected closes, none after unmount/4001
 *   - level detection/visibility from _extractLevel (DBG/INF/WRN/ERR/CRT)
 *   - system preset chips (Errors / Warnings / Errors + Warnings / Connection
 *     / Restart-Stop / Traceback) as single-select regex filters — the legacy
 *     panel drove them through a dropdown; chips keep the same filter values
 *   - search box: plain term (escaped, 300ms debounce) + Filter checkbox —
 *     filter mode hides non-matching lines, otherwise matches are highlighted
 *     with prev/next navigation, like the legacy search bar
 *
 * Not ported (unused by the optimize dialog): host/service sidebar, Lines
 * dropdown, file size, Fetch/Download, context-line grouping, ANSI colors.
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { PhCaretDown, PhCaretUp, PhPause, PhPlay, PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { getBoot, wsOrigin } from '@/shared/boot';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';

const props = defineProps<{ file: string }>();
const { t } = useI18n();

/** Legacy defaults: _getLines() reads the 200-entry dropdown, _MAX = 5000. */
const INITIAL_LINES = 200;
const MAX_LINES = 5000;
const RECONNECT_DELAY_MS = 2000;
const SEARCH_DEBOUNCE_MS = 300;

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

const LEVEL_SHORT: Record<LogLevel, string> = {
  DEBUG: 'DBG',
  INFO: 'INF',
  WARNING: 'WRN',
  ERROR: 'ERR',
  CRITICAL: 'CRT',
};

/** Legacy LogViewerPanel.PRESETS.system, labels switched to the shared.log.* keys. */
const SYSTEM_PRESETS = [
  { key: 'shared.log.errors', pattern: 'error|traceback|exception' },
  { key: 'shared.log.warnings', pattern: 'warning|warn' },
  { key: 'shared.log.errorsWarnings', pattern: 'error|warning|traceback' },
  { key: 'shared.log.connection', pattern: 'connect|disconnect|timeout|reconnect' },
  { key: 'shared.log.restartStop', pattern: 'restart|kill|stop|shutdown' },
  { key: 'shared.log.traceback', pattern: 'traceback|exception|raise' },
] as const;

const lines = ref<string[]>([]);
const conn = ref(t('shared.log.connConnecting'));
const streaming = ref(false);
const visibleLevels = ref(new Set<string>(LOG_LEVELS));
const filterMode = ref(true);
const presetIndex = ref(-1);
const searchText = ref('');
const currentMatch = ref(-1);
const terminalEl = ref<HTMLElement | null>(null);

let ws: WebSocket | null = null;
let sid = 0;
let closed = false;
let authExpired = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
/** Applied search term (preset pattern or escaped plain text) — refs so the
 *  computed search regexes re-evaluate when applySearch() lands. */
const activeTerm = ref('');
const activeIsRegex = ref(false);
let atBottom = true;

function wsBase(): string {
  return wsOrigin();
}

/** Legacy _stripAnsi, assembled without literal escape sequences so the
 *  source stays free of raw control characters (ESC = 0x1B). Template-literal
 *  backslash counts: `\\\\`→`\\`→regex `\`, `\\[`→`\[`→literal `[`. */
const ANSI_PATTERN = new RegExp(
  `${String.fromCharCode(27)}(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])`,
  'g',
);

function stripAnsi(line: string): string {
  return line.replace(ANSI_PATTERN, '');
}

/** Legacy _extractLevel — same regex order and precedence. */
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

/** Legacy _normalizeIncomingLines reduced to the CRLF pass. */
function normalizeIncoming(raw: unknown[]): string[] {
  return raw.map((line) => String(line ?? '').replace(/\r\n?/g, '\n'));
}

function send(obj: Record<string, unknown>): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

/** Legacy _subscribe for local files: clear, bump sid, subscribe. */
function subscribe(): void {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (streaming.value) send({ cmd: 'unsubscribe_local_logs' });
  lines.value = [];
  sid += 1;
  send({
    cmd: 'subscribe_local_logs',
    file: props.file,
    lines: INITIAL_LINES,
    sid,
    start_at_end: false,
  });
  streaming.value = true;
}

function handleMsg(msg: { type?: string; sid?: number; lines?: unknown[]; streaming?: boolean }): void {
  if (msg.sid !== undefined && msg.sid !== sid) return;
  if (msg.type === 'local_logs') {
    lines.value = normalizeIncoming(msg.lines ?? []);
    streaming.value = !!msg.streaming;
  } else if (msg.type === 'local_log_lines') {
    const appended = [...lines.value, ...normalizeIncoming(msg.lines ?? [])];
    lines.value = appended.slice(-MAX_LINES);
  }
}

function connect(): void {
  if (authExpired) return;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  disconnect();
  const sock: WebSocket = new WebSocket(`${wsBase()}/ws/vps`);
  ws = sock;
  sock.onopen = () => {
    conn.value = t('shared.log.connected');
    send({ cmd: 'list_local_logs' });
    subscribe();
  };
  sock.onmessage = (evt: MessageEvent) => {
    try {
      handleMsg(JSON.parse(String(evt.data)));
    } catch {
      /* legacy ignored parse errors */
    }
  };
  sock.onerror = () => {
    conn.value = t('shared.log.connError');
  };
  sock.onclose = (evt: CloseEvent) => {
    if (ws !== sock) return; // legacy: stale sockets from a fresh _connect are ignored
    ws = null;
    streaming.value = false;
    if (evt.code === 4001) {
      authExpired = true;
      closed = true;
      conn.value = t('shared.log.connSessionExpired');
      window.location.replace('/');
      return;
    }
    conn.value = t('shared.log.disconnected');
    if (!authExpired && !closed && reconnectTimer === null) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (!authExpired && !closed) connect();
      }, RECONNECT_DELAY_MS);
    }
  };
}

/** Legacy _disconnect — close and drop the reference. */
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

/** Legacy _toggleStream. */
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

function toggleLevel(level: string): void {
  const next = new Set(visibleLevels.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  visibleLevels.value = next;
}

/** Legacy _onPresetChange — chip click: select (regex mode) or clear. */
function togglePreset(index: number): void {
  presetIndex.value = presetIndex.value === index ? -1 : index;
  applySearch();
}

/** Legacy _onSearchInput — plain term, debounced, chip cleared. */
function onSearchInput(): void {
  presetIndex.value = -1;
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(applySearch, SEARCH_DEBOUNCE_MS);
}

function applySearch(): void {
  searchTimer = null;
  currentMatch.value = -1;
  if (presetIndex.value >= 0) {
    activeTerm.value = SYSTEM_PRESETS[presetIndex.value]!.pattern;
    activeIsRegex.value = true;
  } else {
    activeTerm.value = searchText.value.trim();
    activeIsRegex.value = false;
  }
}

/** Legacy _getSearchRe pair: a test regex (no g) and a split regex with a
 *  capture group so split() keeps the matched text as odd-index segments. */
const searchTestRe = computed<RegExp | null>(() => {
  const term = activeTerm.value;
  if (!term) return null;
  const pattern = activeIsRegex.value ? term : term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
});

const searchSplitRe = computed<RegExp | null>(() => {
  const test = searchTestRe.value;
  if (!test) return null;
  try {
    return new RegExp(`(${test.source})`, 'gi');
  } catch {
    return null;
  }
});

interface RenderedLine {
  text: string;
  level: LogLevel;
  /** Highlight segments when a search is active (odd indices are matches). */
  parts: { text: string; hit: boolean }[];
  match: boolean;
}

const rendered = computed<RenderedLine[]>(() =>
  lines.value.map((line) => {
    const text = stripAnsi(line);
    const re = searchSplitRe.value;
    let parts: { text: string; hit: boolean }[] = [{ text, hit: false }];
    let match = false;
    if (re && text) {
      const raw = text.split(re);
      match = raw.length > 1;
      parts = raw.map((chunk, index) => ({ text: chunk, hit: index % 2 === 1 }));
    } else if (re) {
      match = re.test(text);
    }
    return { text, level: extractLevel(text), parts, match };
  }),
);

const visible = computed(() =>
  rendered.value
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => visibleLevels.value.has(line.level) && (!filterMode.value || !searchTestRe.value || line.match)),
);

const matchCount = computed(
  () => rendered.value.filter((line) => line.match && visibleLevels.value.has(line.level)).length,
);

const connClass = computed(() => {
  const value = conn.value;
  if (value === t('shared.log.connected')) return 'border-success/35 bg-success/10 text-success-soft';
  if (value === t('shared.log.connError') || value === t('shared.log.disconnected')) {
    return 'border-danger/35 bg-danger/10 text-danger-soft';
  }
  return 'border-warning/35 bg-warning/10 text-warning-soft';
});

/* Off-state dimming plus the per-level .on tones from the legacy toolbar. */
function levelClass(level: LogLevel): string {
  if (!visibleLevels.value.has(level)) return 'border-border-default bg-elevated/40 text-muted opacity-55 hover:opacity-90';
  if (level === 'DEBUG') return 'border-secondary/35 bg-secondary/14 text-secondary';
  if (level === 'INFO') return 'border-success/38 bg-success/13 text-success-soft';
  if (level === 'WARNING') return 'border-warning/40 bg-warning/16 text-warning-soft';
  return 'border-danger/42 bg-danger/17 text-danger-soft';
}

function lineClass(level: LogLevel): string {
  if (level === 'DEBUG') return 'text-muted';
  if (level === 'INFO') return 'text-secondary';
  if (level === 'WARNING') return 'text-warning-soft';
  if (level === 'ERROR') return 'text-danger-soft';
  return 'text-danger-soft font-bold';
}

/** Legacy _searchNav — step to the previous/next match and center it. */
function searchMatchStep(direction: -1 | 1): void {
  const matches = visible.value.filter((entry) => entry.line.match);
  if (!matches.length) return;
  const position = matches.findIndex((entry) => entry.index === currentMatch.value);
  const next = matches[(position + direction + matches.length) % matches.length]!;
  currentMatch.value = next.index;
  void nextTick(() => {
    terminalEl.value
      ?.querySelector(`[data-line="${next.index}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

function onTerminalScroll(): void {
  const el = terminalEl.value;
  if (!el) return;
  atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
}

/* Keep the view pinned to the bottom while streaming, like the legacy terminal. */
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
  () => props.file,
  () => {
    // Legacy setFile -> _selectItem -> _subscribe (resubscribe + clear).
    lines.value = [];
    if (ws && ws.readyState === WebSocket.OPEN) subscribe();
  },
);

connect();

onUnmounted(() => {
  closed = true;
  if (reconnectTimer !== null) clearTimeout(reconnectTimer);
  if (searchTimer !== null) clearTimeout(searchTimer);
  reconnectTimer = null;
  searchTimer = null;
  disconnect();
});
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden" data-test="log-terminal">
    <div class="flex flex-shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-border-subtle bg-panel px-2 py-1.5">
      <Button
        v-for="level in LOG_LEVELS"
        :key="level"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 font-mono text-[11px] font-bold"
        :class="levelClass(level)"
        :data-lvl="level"
        :aria-pressed="visibleLevels.has(level)"
        @click="toggleLevel(level)"
      >{{ LEVEL_SHORT[level] }}</Button>

      <span class="mx-1 h-4 w-px bg-border-default"></span>

      <Button
        v-for="(preset, index) in SYSTEM_PRESETS"
        :key="preset.key"
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="presetIndex === index ? 'border-accent/40 bg-accent/12 text-accent-soft' : 'border-border-default bg-elevated/40 text-muted'"
        :aria-pressed="presetIndex === index"
        :data-preset="preset.pattern"
        @click="togglePreset(index)"
      >{{ t(preset.key) }}</Button>

      <span class="mx-1 h-4 w-px bg-border-default"></span>

      <Input
        v-model="searchText"
        class="h-6 w-44 text-xs"
        :placeholder="t('shared.log.searchLogs')"
        data-test="log-search"
        type="text"
        @input="onSearchInput"
        @keydown.enter.prevent="searchMatchStep($event.shiftKey ? -1 : 1)"
      />

      <label class="flex cursor-pointer items-center gap-1.5 text-[11px] text-secondary" data-test="log-filter-label">
        <Checkbox :model-value="filterMode" data-test="log-filter" @update:model-value="filterMode = Boolean($event)" />
        {{ t('shared.log.filter') }}
      </label>

      <span v-if="searchTestRe" class="text-[11px] whitespace-nowrap text-muted" data-test="log-match-count">
        {{ t('shared.log.matches', { count: matchCount }) }}
        <Button type="button" variant="ghost" size="sm" class="h-5 w-5 px-0" :title="t('shared.log.prevMatch')" :aria-label="t('shared.log.prevMatch')" @click="searchMatchStep(-1)"><PbIcon :icon="PhCaretUp" :size="12" /></Button>
        <Button type="button" variant="ghost" size="sm" class="h-5 w-5 px-0" :title="t('shared.log.nextMatch')" :aria-label="t('shared.log.nextMatch')" @click="searchMatchStep(1)"><PbIcon :icon="PhCaretDown" :size="12" /></Button>
      </span>

      <span class="flex-1"></span>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-6 px-1.5 text-[11px]"
        :class="streaming ? 'border-success/40 bg-success/16 text-success-soft' : 'border-border-default bg-elevated/40 text-muted'"
        data-test="log-stream"
        @click="toggleStream"
      >
        <PbIcon :icon="streaming ? PhPause : PhPlay" :size="12" />
        {{ streaming ? t('shared.log.pause') : t('shared.log.stream') }}
      </Button>
      <Button type="button" variant="ghost" size="sm" class="h-6 px-1.5 text-[11px] hover:border-danger/36 hover:bg-danger/16 hover:text-danger-soft" data-test="log-clear" @click="clearTerminal">
        <PbIcon :icon="PhTrash" :size="12" />
        {{ t('shared.log.clear') }}
      </Button>

      <span class="rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap" :class="connClass" data-test="log-conn">{{ conn }}</span>
    </div>

    <div
      ref="terminalEl"
      class="min-h-0 flex-1 overflow-y-auto rounded-md border border-border-default bg-page px-1 py-1.5 font-mono text-xs leading-relaxed"
      @scroll="onTerminalScroll"
    >
      <div
        v-for="entry in visible"
        :key="entry.index"
        :data-line="entry.index"
        class="min-h-[1.55em] rounded-sm px-2 py-px transition-colors hover:bg-accent/7"
        :class="[lineClass(entry.line.level), { 'bg-accent/15 ring-1 ring-accent/40': entry.index === currentMatch }]"
      ><template v-if="searchTestRe"><span v-for="(part, i) in entry.line.parts" :key="i"><mark v-if="part.hit" class="rounded-sm bg-warning/30 px-px text-primary">{{ part.text }}</mark><template v-else>{{ part.text }}</template></span></template><template v-else>{{ entry.line.text }}</template></div>
      <div v-if="!visible.length" class="px-2 py-6 text-center text-muted" data-test="log-empty">{{ t('shared.log.connecting') }}</div>
    </div>
  </div>
</template>
