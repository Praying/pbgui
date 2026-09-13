/**
 * WebSocket log stream + model for the shared log viewer.
 *
 * Owns the single `/ws/vps` connection, the log subscription lifecycle and the
 * line buffer, for both transports the backend exposes:
 *
 *   Local files (Logging Monitor, API Keys):
 *     -> { cmd: 'list_local_logs' }                        => { type: 'local_logs_list', files }
 *     -> { cmd: 'subscribe_local_logs', file, lines, sid } => { type: 'local_logs', … } + { type: 'local_log_lines', … }
 *     -> { cmd: 'unsubscribe_local_logs' }
 *     -> { cmd: 'get_local_logs', file, lines, sid }       => { type: 'local_logs', … }  (one-shot, rotated files)
 *
 *   Remote VPS services (VPS Monitor):
 *     -> { cmd: 'subscribe_logs', host, service, lines, sid } => { type: 'logs', … } + { type: 'log_lines', … }
 *     -> { cmd: 'unsubscribe_logs' }
 *     -> { cmd: 'get_logs', host, service, lines, sid }       => { type: 'logs', … }
 *     -> { cmd: 'get_log_info', host, service, sid }          => { type: 'log_info', size }
 *
 *   Restart (both):
 *     -> { cmd: 'restart_service', host, service } | { cmd: 'kill_instance', host, name, pb_version }
 *        => { type: 'result', cmd: 'restart_service'|'kill_instance', success }
 */

import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { normalizeIncoming } from './logLine';
import { localServiceForFile } from './logViewerPresets';
import { remoteRestartCommand } from './vpsLogItems';

/** Hard cap on buffered lines — matches the legacy LogViewerPanel. */
export const LOG_STREAM_MAX_LINES = 50000;

/** Delay before an unexpected close reconnects while the host stays active. */
const RECONNECT_DELAY_MS = 2000;

/** How long the restart button reports its last outcome before resetting. */
const RESTART_FEEDBACK_MS = 3000;

/** Host identifier that selects the local-file transport. */
export const LOCAL_LOG_HOST = 'local';

export type LogConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export type LogConnectionIssue = 'none' | 'error' | 'session-expired';
export type LogRestartState = 'idle' | 'restarting' | 'restarted' | 'failed';

export interface UseLogStreamOptions {
  /** Reactive gate: the socket lives exactly while this is true. */
  active: () => boolean;
  /** Same-origin WS origin, e.g. `ws://host:port`. */
  wsBase: () => string;
  /** Local subscription target at mount time. */
  defaultFile: string;
  /** Remote host selected at mount time (`'local'` for the file transport). */
  defaultHost?: string;
  /** Remote service selected at mount time. */
  defaultService?: string;
  /** Line window requested from the server for each subscribe/fetch. */
  lines: () => number;
}

export interface LogStreamController {
  /** Buffered lines (ANSI stripped at render time, kept raw here). */
  lines: Ref<string[]>;
  /** File list reported by the WS (`list_local_logs`). */
  serverFiles: Ref<string[]>;
  /** Active host: `'local'` or a VPS hostname. */
  host: Ref<string>;
  /** Local file currently subscribed (the sidebar selection). */
  streamFile: Ref<string>;
  /** Remote service currently subscribed. */
  remoteService: Ref<string>;
  /** Local file whose content is on screen — equals `streamFile` or a fetched variant. */
  viewFile: Ref<string>;
  /** Size in bytes of the subscribed target, when the server reports it. */
  fileSize: Ref<number | null>;
  connectionStatus: Ref<LogConnectionStatus>;
  connectionIssue: Ref<LogConnectionIssue>;
  streaming: Ref<boolean>;
  restartState: Ref<LogRestartState>;
  connect(): void;
  disconnect(): void;
  requestFileList(): void;
  subscribe(): void;
  toggleStream(): void;
  clearLines(): void;
  /** Switch host (and keep the current remote service). */
  setHost(host: string): void;
  /** Switch the remote service on the current host. */
  setService(service: string): void;
  /** Switch host and service in one subscription. */
  setTarget(host: string, service: string): void;
  /** Switch the local subscription target and restart streaming. */
  setFile(file: string): void;
  /** One-shot local fetch (rotated variant) — displays without subscribing. */
  fetchFile(file: string): void;
  restart(): void;
}

interface ServerMessage {
  type?: string;
  cmd?: string;
  files?: unknown[];
  lines?: unknown[];
  sid?: number;
  streaming?: boolean;
  success?: boolean;
  size?: number;
  file_size?: number;
}

export function useLogStream(options: UseLogStreamOptions): LogStreamController {
  const lines = ref<string[]>([]);
  const serverFiles = ref<string[]>([]);
  const host = ref(options.defaultHost ?? LOCAL_LOG_HOST);
  const streamFile = ref(options.defaultFile);
  const remoteService = ref(options.defaultService ?? '');
  const viewFile = ref(options.defaultFile);
  const fileSize = ref<number | null>(null);
  const connectionStatus = ref<LogConnectionStatus>('connecting');
  const connectionIssue = ref<LogConnectionIssue>('none');
  const streaming = ref(false);
  const restartState = ref<LogRestartState>('idle');

  let socket: WebSocket | null = null;
  let sessionId = 0;
  let closed = false;
  let authExpired = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  function isLocal(): boolean {
    return host.value === LOCAL_LOG_HOST;
  }

  function send(payload: Record<string, unknown>): boolean {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  function clearLines(): void {
    lines.value = [];
    fileSize.value = null;
  }

  function requestFileList(): void {
    send({ cmd: 'list_local_logs' });
  }

  function unsubscribe(): void {
    send({ cmd: isLocal() ? 'unsubscribe_local_logs' : 'unsubscribe_logs' });
  }

  function subscribe(): void {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    // Only cancel a live subscription; a plain first subscribe needs no
    // unsubscribe frame (matches the legacy panel's wire traffic).
    if (isLocal()) {
      if (!streamFile.value) return;
      if (streaming.value) unsubscribe();
      clearLines();
      sessionId += 1;
      viewFile.value = streamFile.value;
      send({
        cmd: 'subscribe_local_logs',
        file: streamFile.value,
        lines: options.lines(),
        sid: sessionId,
        start_at_end: false,
      });
    } else {
      if (!remoteService.value) return;
      if (streaming.value) unsubscribe();
      clearLines();
      sessionId += 1;
      send({
        cmd: 'subscribe_logs',
        host: host.value,
        service: remoteService.value,
        lines: options.lines(),
        sid: sessionId,
        start_at_end: false,
      });
      send({ cmd: 'get_log_info', host: host.value, service: remoteService.value, sid: sessionId });
    }
    streaming.value = true;
  }

  function toggleStream(): void {
    if (streaming.value) {
      unsubscribe();
      streaming.value = false;
    } else {
      subscribe();
    }
  }

  function setFile(file: string): void {
    if (!file) return;
    // Re-subscribe when returning to the streamed file from a one-shot variant:
    // the target is unchanged but the view still shows the fetched file.
    if (file === streamFile.value && viewFile.value === streamFile.value) return;
    streamFile.value = file;
    clearLines();
    viewFile.value = file;
    subscribe();
  }

  function setHost(nextHost: string): void {
    if (!nextHost || nextHost === host.value) return;
    unsubscribe();
    host.value = nextHost;
    clearLines();
    streaming.value = false;
    subscribe();
  }

  function setService(nextService: string): void {
    if (!nextService || nextService === remoteService.value) return;
    remoteService.value = nextService;
    clearLines();
    subscribe();
  }

  function setTarget(nextHost: string, nextService: string): void {
    if (!nextHost) return;
    unsubscribe();
    host.value = nextHost;
    remoteService.value = nextService;
    clearLines();
    streaming.value = false;
    subscribe();
  }

  function fetchFile(file: string): void {
    if (!file || !isLocal()) return;
    unsubscribe();
    clearLines();
    viewFile.value = file;
    streaming.value = false;
    sessionId += 1;
    send({ cmd: 'get_local_logs', file, lines: options.lines(), sid: sessionId });
  }

  function restart(): void {
    const command =
      host.value === LOCAL_LOG_HOST
        ? (() => {
            const service = localServiceForFile(streamFile.value);
            if (!service) return null;
            if (service.startsWith('Bot:')) {
              const [name, pbVersion] = service.slice('Bot:'.length).split(':');
              return { cmd: 'kill_instance', host: LOCAL_LOG_HOST, name, pb_version: pbVersion || '7' };
            }
            return { cmd: 'restart_service', host: LOCAL_LOG_HOST, service };
          })()
        : remoteRestartCommand(host.value, remoteService.value);
    if (!command) return;
    restartState.value = 'restarting';
    if (restartTimer !== null) clearTimeout(restartTimer);
    if (!send(command as Record<string, unknown>)) restartState.value = 'failed';
    restartTimer = setTimeout(() => {
      restartTimer = null;
      restartState.value = 'idle';
    }, RESTART_FEEDBACK_MS);
  }

  function handleMessage(message: ServerMessage): void {
    if (message.type === 'local_logs_list') {
      serverFiles.value = Array.isArray(message.files)
        ? message.files.map((file) => String(file)).filter(Boolean)
        : [];
      return;
    }
    // Restart results are not session-scoped.
    if (message.cmd === 'restart_service' || message.cmd === 'kill_instance') {
      restartState.value = message.success === false ? 'failed' : 'restarted';
      if (restartTimer !== null) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        restartTimer = null;
        restartState.value = 'idle';
      }, RESTART_FEEDBACK_MS);
      return;
    }
    if (message.sid !== undefined && message.sid !== sessionId) return;

    if (message.type === 'local_logs' || message.type === 'logs') {
      lines.value = normalizeIncoming(message.lines ?? []);
      if (message.type === 'local_logs') streaming.value = Boolean(message.streaming);
      else if (message.streaming) streaming.value = true;
      if (typeof message.file_size === 'number') fileSize.value = message.file_size;
      return;
    }
    if (message.type === 'local_log_lines' || message.type === 'log_lines') {
      const appended = [...lines.value, ...normalizeIncoming(message.lines ?? [])];
      lines.value = appended.slice(-LOG_STREAM_MAX_LINES);
      return;
    }
    if (message.type === 'log_info' && typeof message.size === 'number') {
      fileSize.value = message.size;
    }
  }

  function disconnect(): void {
    if (socket) {
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      socket = null;
    }
    streaming.value = false;
  }

  function connect(): void {
    if (authExpired || closed) return;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    disconnect();
    connectionStatus.value = 'connecting';
    connectionIssue.value = 'none';
    const next = new WebSocket(`${options.wsBase()}/ws/vps`);
    socket = next;
    next.onopen = () => {
      if (socket !== next) return;
      connectionStatus.value = 'connected';
      connectionIssue.value = 'none';
      requestFileList();
      subscribe();
    };
    next.onmessage = (event: MessageEvent) => {
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        /* ignore malformed frames */
      }
    };
    next.onerror = () => {
      if (socket !== next) return;
      connectionStatus.value = 'disconnected';
      connectionIssue.value = 'error';
    };
    next.onclose = (event: CloseEvent) => {
      if (socket !== next) return;
      socket = null;
      streaming.value = false;
      if (event.code === 4001) {
        authExpired = true;
        closed = true;
        connectionStatus.value = 'disconnected';
        connectionIssue.value = 'session-expired';
        window.location.replace('/');
        return;
      }
      connectionStatus.value = 'disconnected';
      if (!authExpired && !closed && reconnectTimer === null && options.active()) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          if (!authExpired && !closed && options.active()) connect();
        }, RECONNECT_DELAY_MS);
      }
    };
  }

  watch(
    () => options.active(),
    (isActive) => {
      if (isActive) {
        closed = false;
        authExpired = false;
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
    { immediate: true }
  );

  onBeforeUnmount(() => {
    closed = true;
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    if (restartTimer !== null) clearTimeout(restartTimer);
    reconnectTimer = null;
    restartTimer = null;
    disconnect();
  });

  return {
    lines,
    serverFiles,
    host,
    streamFile,
    remoteService,
    viewFile,
    fileSize,
    connectionStatus,
    connectionIssue,
    streaming,
    restartState,
    connect,
    disconnect,
    requestFileList,
    subscribe,
    toggleStream,
    clearLines,
    setHost,
    setService,
    setTarget,
    setFile,
    fetchFile,
    restart,
  };
}
