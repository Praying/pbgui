<script setup lang="ts">
/*
 * Log stream viewer, ported from the shared legacy
 * frontend/js/log_viewer_panel.js (LogViewerPanel) - connection lifecycle,
 * message protocol, reconnect semantics and level rendering are replicated
 * 1:1 for the local-file mode the services page uses:
 *
 *   - WS url: wsBase() + '/ws/vps' (token is NEVER on the URL; the legacy
 *     `token` option is stored by LogViewerPanel but never sent - auth rides
 *     on the session, expiry arrives as close code 4001 -> redirect to '/')
 *   - onopen: send {cmd:'list_local_logs'} then subscribe_local_logs
 *   - fixed 2s reconnect after unexpected closes, none after unmount/4001
 *   - level classes from _extractLevel/_levelClass, DBG/INF/WRN/ERR/CRT
 *     visibility toggles, Pause/Stream + Clear controls, 5000-line cap
 *
 * Out of scope (not used by services_monitor): host/service sidebar, search,
 * presets and ANSI color rendering - ANSI is stripped like the legacy
 * level-detection pass.
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { PhPause, PhPlay, PhTrash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { wsBase } from '../config';

const props = defineProps<{ file: string }>();

const { t } = useI18n();

/** Legacy defaults: _getLines() reads the 200-entry dropdown, _MAX = 5000. */
const INITIAL_LINES = 200;
const MAX_LINES = 5000;
const RECONNECT_DELAY_MS = 2000;

const LOG_LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'] as const;
type LogLevel = (typeof LOG_LEVELS)[number];

interface RenderedLine {
  text: string;
  level: LogLevel;
}

const lines = ref<string[]>([]);
const conn = ref(t('shared.log.connecting'));
const streaming = ref(false);
const visibleLevels = ref(new Set<string>(LOG_LEVELS));

let ws: WebSocket | null = null;
let sid = 0;
let closed = false;
let authExpired = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Legacy _stripAnsi. */
function stripAnsi(line: string): string {
  return line.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/** Legacy _extractLevel - same regex order and precedence. */
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

/** Legacy _subscribe for local files: unsubscribe, clear, bump sid, subscribe. */
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

/** Legacy _disconnect - close and drop the reference. */
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
}

function toggleLevel(level: string): void {
  const next = new Set(visibleLevels.value);
  if (next.has(level)) next.delete(level);
  else next.add(level);
  visibleLevels.value = next;
}

const rendered = computed<RenderedLine[]>(() =>
  lines.value.map((line) => {
    const text = stripAnsi(line);
    return { text, level: extractLevel(text) };
  })
);

const levelShort: Record<LogLevel, string> = {
  DEBUG: 'DBG',
  INFO: 'INF',
  WARNING: 'WRN',
  ERROR: 'ERR',
  CRITICAL: 'CRT',
};

watch(
  () => props.file,
  () => {
    // Legacy setFile -> _selectItem -> _subscribe (resubscribe + clear).
    if (ws && ws.readyState === WebSocket.OPEN) subscribe();
    else lines.value = [];
  }
);

connect();

onUnmounted(() => {
  closed = true;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  disconnect();
});
</script>

<template>
  <div class="lvp-root lvp-vue">
    <div class="lvp-viewer">
      <div class="lvp-toolbar">
        <button
          v-for="level in LOG_LEVELS"
          :key="level"
          class="lvp-lvl-btn"
          :class="{ on: visibleLevels.has(level) }"
          :data-lvl="level"
          type="button"
          @click="toggleLevel(level)"
        >
          {{ levelShort[level] }}
        </button>
        <button
          class="lvp-ctrl-btn lvp-stream-btn"
          :class="{ 'lvp-stream-on': streaming }"
          type="button"
          @click="toggleStream"
        >
          <PbIcon :icon="streaming ? PhPause : PhPlay" />
          {{ streaming ? t('shared.log.pause') : t('shared.log.stream') }}
        </button>
        <button class="lvp-ctrl-btn lvp-clear-btn" type="button" @click="clearTerminal">
          <PbIcon :icon="PhTrash" /> {{ t('shared.log.clear') }}
        </button>
        <span class="lvp-conn-badge">{{ conn }}</span>
      </div>
      <div class="lvp-terminal">
        <div
          v-for="(line, i) in rendered"
          :key="i"
          :class="[`lvp-log-${line.level.toLowerCase()}`, { 'lvp-level-hidden': !visibleLevels.has(line.level) }]"
          :data-level="line.level"
        >{{ line.text }}</div>
      </div>
    </div>
  </div>
</template>

<!-- Styles ported from frontend/js/log_viewer_panel.js (toolbar, level buttons,
     terminal and line colors); scoped under .lvp-vue to stay page-local. -->
<style scoped>
.lvp-vue {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.lvp-viewer {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.lvp-toolbar {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.lvp-lvl-btn {
  padding: 3px 7px;
  border-radius: 3px;
  border: 1px solid #333640;
  background: #28252b;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  font-family: monospace;
  transition: all 0.15s;
  opacity: 0.4;
  color: #aaa;
}
.lvp-lvl-btn.on {
  opacity: 1;
}
.lvp-lvl-btn[data-lvl='DEBUG'].on {
  background: #3a3f4b;
  border-color: #555;
  color: #eae7ea;
}
.lvp-lvl-btn[data-lvl='INFO'].on {
  background: #0d3b20;
  border-color: #21c354;
  color: #21c354;
}
.lvp-lvl-btn[data-lvl='WARNING'].on {
  background: #3b2700;
  border-color: #ff8c00;
  color: #ff8c00;
}
.lvp-lvl-btn[data-lvl='ERROR'].on {
  background: #3b0d0d;
  border-color: #ff4b4b;
  color: #ff4b4b;
}
.lvp-lvl-btn[data-lvl='CRITICAL'].on {
  background: #2d0040;
  border-color: #b39ddb;
  color: #b39ddb;
}
.lvp-ctrl-btn {
  padding: 3px 9px;
  background: #28252b;
  border: 1px solid #333640;
  border-radius: 4px;
  color: #eae7ea;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  line-height: 1.6;
}
.lvp-ctrl-btn:hover {
  background: #4da6ff;
  color: #000;
  border-color: #4da6ff;
}
.lvp-ctrl-btn.lvp-stream-on {
  background: #21c354;
  color: #000;
  border-color: #21c354;
}
.lvp-conn-badge {
  font-size: 11px;
  color: #716b75;
}
.lvp-terminal {
  overflow-y: auto;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.45;
  background: #000;
  color: #b0b0b0;
  padding: 10px 12px;
  border: 1px solid #1e293b;
  border-radius: 5px;
  white-space: pre-wrap;
  word-break: break-all;
  flex: 1;
  min-height: 0;
}
.lvp-log-debug {
  color: #808080;
}
.lvp-log-info {
  color: #b0b0b0;
}
.lvp-log-warning {
  color: #ff8c00;
}
.lvp-log-error {
  color: #ff4b4b;
}
.lvp-log-critical {
  color: #b39ddb;
  font-weight: 600;
}
.lvp-level-hidden {
  display: none !important;
}

/* ── Log terminal refinement ────────────────────────────────────────────── */
.lvp-viewer {
  gap: 8px;
}

.lvp-toolbar {
  min-height: 40px;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgba(162, 156, 166, 0.13);
  border-radius: 9px;
  background:
    linear-gradient(90deg, rgba(24, 38, 59, 0.76), rgba(14, 23, 37, 0.72)),
    #171619;
  box-shadow: 0 1px rgba(255, 255, 255, 0.025) inset;
}

.lvp-lvl-btn {
  min-width: 39px;
  min-height: 27px;
  padding: 0 8px;
  border-color: rgba(162, 156, 166, 0.17);
  border-radius: 6px;
  background: rgba(162, 156, 166, 0.07);
  color: #8fa5be;
  opacity: 0.48;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, opacity 0.16s ease, transform 0.16s ease;
}

.lvp-lvl-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(162, 156, 166, 0.36);
  background: rgba(162, 156, 166, 0.14);
  color: #edf4fc;
  opacity: 0.9;
}

.lvp-lvl-btn.on {
  opacity: 1;
}

.lvp-lvl-btn[data-lvl='DEBUG'].on {
  border-color: rgba(162, 156, 166, 0.35);
  background: rgba(162, 156, 166, 0.14);
  color: #cbd5e1;
}

.lvp-lvl-btn[data-lvl='INFO'].on {
  border-color: rgba(52, 211, 153, 0.38);
  background: rgba(16, 185, 129, 0.13);
  color: #86efac;
}

.lvp-lvl-btn[data-lvl='WARNING'].on {
  border-color: rgba(251, 191, 36, 0.4);
  background: rgba(180, 83, 9, 0.16);
  color: #fde68a;
}

.lvp-lvl-btn[data-lvl='ERROR'].on {
  border-color: rgba(248, 113, 113, 0.42);
  background: rgba(185, 28, 28, 0.17);
  color: #fca5a5;
}

.lvp-lvl-btn[data-lvl='CRITICAL'].on {
  border-color: rgba(196, 181, 253, 0.4);
  background: rgba(109, 40, 217, 0.18);
  color: #ddd6fe;
}

.lvp-ctrl-btn {
  min-height: 29px;
  padding: 0 10px;
  border-color: rgba(162, 156, 166, 0.17);
  border-radius: 7px;
  background: rgba(162, 156, 166, 0.08);
  color: #b7c6d8;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}

.lvp-ctrl-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(96, 165, 250, 0.38);
  background: rgba(37, 99, 235, 0.16);
  color: #edf4fc;
}

.lvp-ctrl-btn.lvp-stream-on {
  border-color: rgba(52, 211, 153, 0.4);
  background: rgba(16, 185, 129, 0.16);
  color: #a7f3d0;
}

.lvp-clear-btn:hover {
  border-color: rgba(248, 113, 113, 0.36);
  background: rgba(185, 28, 28, 0.16);
  color: #fecaca;
}

.lvp-conn-badge {
  margin-left: auto;
  padding: 4px 9px;
  border: 1px solid rgba(162, 156, 166, 0.13);
  border-radius: 999px;
  background: rgba(6, 13, 24, 0.4);
  color: #8fa5be;
  font-size: 11px;
  white-space: nowrap;
}

.lvp-terminal {
  padding: 14px 16px;
  border-color: rgba(96, 165, 250, 0.16);
  border-radius: 10px;
  background:
    linear-gradient(180deg, rgba(3, 9, 17, 0.98), rgba(2, 6, 12, 0.98)),
    #000;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.24), 0 1px rgba(255, 255, 255, 0.025) inset;
  color: #bdc9d8;
  font-size: 12px;
  line-height: 1.55;
  scrollbar-color: rgba(96, 165, 250, 0.32) rgba(162, 156, 166, 0.04);
}

.lvp-terminal > div {
  min-height: 1.55em;
  padding: 1px 7px;
  border-left: 2px solid transparent;
  border-radius: 3px;
  transition: background 0.12s ease;
}

.lvp-terminal > div:hover {
  background: rgba(96, 165, 250, 0.07);
}

.lvp-log-debug {
  color: #71849b;
}

.lvp-log-info {
  color: #c5d1df;
}

.lvp-log-warning {
  border-left-color: rgba(251, 191, 36, 0.65) !important;
  color: #fcd34d;
}

.lvp-log-error {
  border-left-color: rgba(248, 113, 113, 0.72) !important;
  color: #fca5a5;
}

.lvp-log-critical {
  border-left-color: rgba(196, 181, 253, 0.72) !important;
  color: #ddd6fe;
  font-weight: 700;
}

@media (max-width: 720px) {
  .lvp-toolbar {
    align-items: stretch;
  }

  .lvp-conn-badge {
    width: 100%;
    margin-left: 0;
    text-align: center;
  }

  .lvp-terminal {
    padding: 11px 10px;
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
</style>
