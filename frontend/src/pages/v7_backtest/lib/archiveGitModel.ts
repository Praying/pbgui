/**
 * Pure helpers of the archive git-maintenance surface (M-v7-12, the
 * M-v7-11 DEFERRED block): the pull-stream event reducer
 * (v7_backtest.html:9559-9576), the output-log append/truncate
 * (:9538-9548), the elapsed formatter (:9484-9489), the per-archive
 * result rows (:9578-9587), the setup form collector (:9826-9845) and
 * the compact-preview view model (:9686-9700). No IO — the flows live
 * in composables/useArchiveGit.ts.
 */

/** One NDJSON line of /archives/…/pull/stream (:9560-9575). */
export interface ArchivePullStreamEvent {
  type?: string;
  archive?: string;
  message?: string;
  result?: ArchivePullResultItem;
  [key: string]: unknown;
}

/** One row of the pull results modal (:9578-9587). */
export interface ArchivePullResultItem {
  name?: string;
  output?: string;
  error?: string;
  recovered?: boolean;
  [key: string]: unknown;
}

/** The state change an event asks for (:9527-9576, pure). */
export interface ArchivePullEventPatch {
  status?: string;
  statusError?: boolean;
  append?: string;
}

/** formatArchivePullElapsed (:9484-9489). */
export function formatArchivePullElapsed(now: number, startedAt: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return (minutes ? minutes + 'm ' : '') + rest + 's';
}

export const PULL_LOG_TRUNCATE_AT = 120_000;
export const PULL_LOG_KEEP_TAIL = 90_000;
export const PULL_LOG_TRUNCATED_PREFIX = '... output truncated ...\n';

/** appendArchivePullOutput (:9538-9548) — CR→LF plus the 120k/90k clamp. */
export function appendArchivePullOutput(log: string, message: string | undefined): string {
  if (!message) return log;
  const next = log + String(message).replace(/\r/g, '\n');
  if (next.length > PULL_LOG_TRUNCATE_AT) {
    return PULL_LOG_TRUNCATED_PREFIX + next.slice(-PULL_LOG_KEEP_TAIL);
  }
  return next;
}

/** handleArchivePullStreamEvent (:9560-9576) as a pure event→patch map. */
export function archivePullEventPatch(event: ArchivePullStreamEvent): ArchivePullEventPatch {
  if (!event || !event.type) return {};
  const archive = event.archive || 'archive';
  const archivePrefix = event.archive ? event.archive + ': ' : '';
  switch (event.type) {
    case 'archive_start':
      return { status: event.message || 'Pulling ' + archive, append: '\n### ' + archive + '\n' };
    case 'status':
      return { status: archivePrefix + (event.message || 'Working...') };
    case 'output':
      return { append: event.message || '' };
    case 'error': {
      const message = event.message || 'Pull failed';
      return { status: archivePrefix + message, statusError: true, append: '\nERROR: ' + message + '\n' };
    }
    case 'archive_done': {
      const result = event.result || {};
      const verdict = result.error ? 'failed' : result.recovered ? 'recovered' : 'ok';
      return { append: '\n' + (result.name || archive) + ': ' + verdict + '\n' };
    }
    default:
      return {};
  }
}

/** renderArchivePullResults' status cell (:9581). */
export function archivePullResultStatus(item: ArchivePullResultItem): 'Failed' | 'Recovered' | 'OK' {
  return item.error ? 'Failed' : item.recovered ? 'Recovered' : 'OK';
}

/** renderArchivePullResults' body cell (:9582). */
export function archivePullResultBody(item: ArchivePullResultItem): string {
  return item.error || item.output || 'ok';
}

/** The setup form state — string fields, input-shaped (:9750-9790). */
export interface ArchiveSetupForm {
  my_archive: string;
  username: string;
  email: string;
  access_token: string;
  auto_pull_interval: string;
  readme_title: string;
  readme_static_markdown: string;
}

/** The POST /archives/settings body (_collectArchiveSetup :9826-9845). */
export interface ArchiveSetupPayload {
  my_archive: string;
  username: string;
  email: string;
  access_token?: string;
  auto_pull_interval: number;
  readme_title: string;
  readme_static_markdown: string;
}

/**
 * _collectArchiveSetup (:9826-9845): name/username/email/title are
 * trimmed, the token + static markdown keep their raw value and the
 * interval falls back to 0. An empty own-archive selection → null.
 */
export function collectArchiveSetupForm(form: ArchiveSetupForm): ArchiveSetupPayload | null {
  const myArchive = form.my_archive.trim();
  if (!myArchive) return null;
  return {
    my_archive: myArchive,
    username: form.username.trim(),
    email: form.email.trim(),
    ...(form.access_token ? { access_token: form.access_token } : {}),
    auto_pull_interval: parseInt(form.auto_pull_interval, 10) || 0,
    readme_title: form.readme_title.trim(),
    readme_static_markdown: form.readme_static_markdown,
  };
}

/** POST /archives/{name}/compact dry-run payload shape (:9679-9684). */
export interface ArchiveCompactPreviewInput {
  status?: string[];
  storage_estimate?: {
    available?: boolean;
    saved_human?: string;
    saved_percent?: string | number;
    current_human?: string;
    after_human?: string;
    note?: string;
  };
  branch?: string;
  commit_count?: string | number;
  manifest_items?: number;
  object_size?: string;
  [key: string]: unknown;
}

/** The compact-preview modal's display model (:9686-9700 fallbacks). */
export interface ArchiveCompactView {
  savings: { available: boolean; human: string; percent: string | number };
  before: string;
  after: string;
  note: string;
  branch: string;
  commitCount: string;
  manifestItems: number;
  hasStatus: boolean;
  statusText: string;
  sizeText: string;
}

const COMPACT_NOTE_FALLBACK = 'Actual remote savings appear after remote garbage collection.';

/** compactPreviewView — every legacy fallback of the preview modal body. */
export function compactPreviewView(preview: ArchiveCompactPreviewInput): ArchiveCompactView {
  const estimate = preview.storage_estimate || {};
  const available = !!estimate.available;
  const status = Array.isArray(preview.status) ? preview.status : [];
  return {
    savings: available
      ? { available: true, human: estimate.saved_human || '0 Bytes', percent: estimate.saved_percent ?? 0 }
      : { available: false, human: '', percent: '' },
    before: available ? estimate.current_human || 'unknown' : 'unknown',
    after: available ? estimate.after_human || 'unknown' : 'unknown',
    note: estimate.note || COMPACT_NOTE_FALLBACK,
    branch: String(preview.branch || 'unknown'),
    commitCount: String(preview.commit_count || 'unknown'),
    manifestItems: Number(preview.manifest_items) || 0,
    hasStatus: status.length > 0,
    statusText: status.length > 0 ? status.join('\n') : 'Clean working tree',
    sizeText: preview.object_size || 'No size estimate available',
  };
}
