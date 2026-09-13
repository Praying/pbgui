/**
 * Remote (VPS) log item model for the shared log viewer.
 *
 * A faithful port of the legacy LogViewerPanel's remote service list
 * (`_getServices` / `_serviceEntries` / `_svcLabel`), reduced to pure
 * functions so the VPS Monitor page can feed the Vue viewer without the
 * legacy global. Local-file mode is handled by the viewer's `files` prop and
 * does not use this module.
 */

/** Services probed on every VPS host before host metadata narrows the list. */
export const BASE_REMOTE_SERVICES: readonly string[] = [
  'PBRun',
  'PBCoinData',
  'PBData',
  'PBGui',
  'PBApiServer',
  'VPSMonitor',
  'VPSManagerApi',
];

/** Services that only exist on a master; hidden on slaves without metadata. */
const MASTER_ONLY_SERVICES: readonly string[] = ['PBGui', 'PBApiServer', 'VPSMonitor', 'VPSManagerApi'];

export type VpsLogItemKind = 'service' | 'bot' | 'error' | 'archive' | 'file';

/** One selectable remote log target. */
export interface VpsLogItem {
  /** Backend identifier passed to `subscribe_logs` / `get_logs` / restart. */
  value: string;
  /** Primary text. */
  label: string;
  /** Secondary text (bot version, archive timestamp, kind hint). */
  detail?: string;
  kind: VpsLogItemKind;
}

/** Minimal VPS state slice this module reads (see `vps_monitor/types.ts`). */
export interface VpsLogState {
  host_meta?: Record<string, { role?: unknown; available_logs?: unknown } | undefined>;
  v7_instances?: Record<string, unknown>;
  v8_instances?: Record<string, unknown>;
  bot_logs?: Record<string, Record<string, unknown> | undefined>;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((entry) => String(entry ?? '')).filter(Boolean) : [];
}

function asRecords(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    : [];
}

/** `Bot:<name>:<version>` split; version defaults to 7 when absent. */
export function botIdentifier(value: string): { name: string; version: string } | null {
  if (!value.startsWith('Bot:')) return null;
  const [name, version] = value.slice('Bot:'.length).split(':');
  if (!name) return null;
  return { name, version: version || '7' };
}

/** `data/run_v7/<bot>/passivbot_err.log[.old]` or `BotErr:<bot>`. */
function errorLogMeta(value: string): { bot: string; isOld: boolean } | null {
  const alias = value.match(/^BotErr:([^:]+)$/);
  if (alias) return { bot: alias[1]!, isOld: false };
  const match = value.match(/^data\/run_v7\/([^/]+)\/(passivbot_err\.log(?:\.old)?)$/);
  if (!match) return null;
  return { bot: match[1]!, isOld: match[2]!.endsWith('.old') };
}

/** `pb7/logs/<bot>_<YYYYMMDD>_<HHMMSS>...log` archives. */
function archiveLogMeta(value: string): { bot: string; timestamp: string } | null {
  if (!value.startsWith('pb7/logs/') && !value.startsWith('software/pb7/logs/')) return null;
  const base = value.split('/').filter(Boolean).pop() ?? value;
  const stamp = base.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
  const inferred = base.match(/data_run_v7_(.+?)(?:_config_run(?:\.[^.]+)?|_con(?:fig(?:_run)?)?)\.log$/);
  return {
    bot: inferred ? inferred[1]! : '',
    timestamp: stamp ? `${stamp[1]}-${stamp[2]}-${stamp[3]} ${stamp[4]}:${stamp[5]}:${stamp[6]}` : '',
  };
}

/** Port of the legacy `_svcLabel`: a display entry for any service value. */
export function remoteLogItem(value: string): VpsLogItem {
  const bot = botIdentifier(value);
  if (bot) return { value, label: bot.name, detail: `v${bot.version}`, kind: 'bot' };

  const errorMeta = errorLogMeta(value);
  if (errorMeta) {
    return { value, label: errorMeta.bot, detail: errorMeta.isOld ? 'error.old' : 'error', kind: 'error' };
  }

  if (value.includes('/')) {
    const archive = archiveLogMeta(value);
    if (archive) {
      return {
        value,
        label: archive.bot || archive.timestamp || value,
        detail: archive.bot && archive.timestamp ? archive.timestamp : 'history',
        kind: 'archive',
      };
    }
    const parts = value.split('/').filter(Boolean);
    const basename = parts[parts.length - 1] ?? value;
    if (parts.length >= 2 && basename === 'passivbot.log') {
      return { value, label: parts[parts.length - 2]!, detail: 'passivbot', kind: 'bot' };
    }
    return { value, label: basename, kind: 'file' };
  }

  return { value, label: value, kind: 'service' };
}

/**
 * Remote log targets for `host`, in the legacy display order: named services,
 * then bot instances, then extra log files. Mirrors `_getServices`.
 */
export function remoteLogItems(host: string, state: VpsLogState): VpsLogItem[] {
  const values: string[] = [];
  const seen = new Set<string>();
  const push = (value: string): void => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    values.push(value);
  };

  let services = [...BASE_REMOTE_SERVICES];
  const meta = state.host_meta?.[host];
  const available = asStringArray(meta?.available_logs);
  if (available.length > 0) {
    const availableSet = new Set(available);
    services = services.filter((service) => availableSet.has(service));
    for (const entry of available) push(entry);
  } else if (String(meta?.role ?? '') === 'slave') {
    services = services.filter((service) => !MASTER_ONLY_SERVICES.includes(service));
  }
  for (const service of services) push(service);

  for (const [instancesKey, version] of [
    ['v7_instances', '7'],
    ['v8_instances', '8'],
  ] as const) {
    for (const instance of asRecords(state[instancesKey]?.[host])) {
      if (instance.name && instance.running) push(`Bot:${String(instance.name)}:${version}`);
    }
  }

  const botLogs = state.bot_logs?.[host] ?? {};
  for (const botName of Object.keys(botLogs)) {
    for (const file of asStringArray(botLogs[botName])) push(file);
  }

  return values.map(remoteLogItem);
}

/** Split items into the viewer's display groups, preserving order. */
export function groupRemoteLogItems(items: readonly VpsLogItem[]): {
  services: VpsLogItem[];
  bots: VpsLogItem[];
  files: VpsLogItem[];
} {
  return {
    services: items.filter((item) => item.kind === 'service'),
    bots: items.filter((item) => item.kind === 'bot' || item.kind === 'error'),
    files: items.filter((item) => item.kind === 'archive' || item.kind === 'file'),
  };
}

/** Restart command for a remote target (port of `_restart`'s command build). */
export function remoteRestartCommand(
  host: string,
  service: string
): { cmd: string; host: string; service?: string; name?: string; pb_version?: string } | null {
  if (!host || !service) return null;
  const bot = botIdentifier(service);
  if (bot) return { cmd: 'kill_instance', host, name: bot.name, pb_version: bot.version };
  return { cmd: 'restart_service', host, service };
}

export interface ServiceCheckLike {
  status?: unknown;
  expected?: unknown;
  reason?: unknown;
}

/**
 * Why the restart button must stay hidden for a remote target, or '' when it
 * may be shown (port of `_restartBlockerFor`, bots always allowed).
 */
export function remoteRestartBlocker(
  service: string,
  checks: Record<string, ServiceCheckLike> | undefined
): string {
  if (!service || botIdentifier(service)) return '';
  const check = checks?.[service];
  if (!check) return '';
  if (check.expected === false || check.status === 'disabled') {
    return String(check.reason ?? '');
  }
  return '';
}
