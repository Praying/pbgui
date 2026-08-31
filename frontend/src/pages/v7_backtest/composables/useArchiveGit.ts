import { computed, getCurrentScope, onScopeDispose, ref, type Ref } from 'vue';
import {
  appendArchivePullOutput,
  archivePullEventPatch,
  collectArchiveSetupForm,
  compactPreviewView,
  formatArchivePullElapsed,
  type ArchiveCompactPreviewInput,
  type ArchiveCompactView,
  type ArchivePullResultItem,
  type ArchivePullStreamEvent,
  type ArchiveSetupForm,
} from '../lib/archiveGitModel';
import { readNdjsonStream } from '../lib/ndjsonStream';
import type { I18nT } from '../types.i18n';

/**
 * The archive git-maintenance store (M-v7-12, the M-v7-11 DEFERRED
 * block): pullArchive/pullAllArchives with the NDJSON progress modal +
 * 1 s elapsed timer (:9484-9632), pushArchive (:9640-9669),
 * compactArchiveHistory (:9670-9746), setupArchive + the README config
 * editor (:9747-9845) and showArchiveLog (:9633-9639). Split from
 * useArchive (790 L) to stay under the 800-line ceiling.
 */

export const ARCHIVE_PULL_TIMER_MS = 1000;

export interface ArchiveGitContext {
  /** requestJson over the archive base (always the v7 router). */
  archiveFetch(path: string, init?: RequestInit): Promise<Record<string, unknown>>;
  /** apiFetchNdjson (:1191-1230) — injectable so unit tests skip streams. */
  fetchNdjson?(path: string, init: RequestInit, onEvent: (event: ArchivePullStreamEvent) => void): Promise<unknown>;
  /** Raw fetch for the default NDJSON transport. */
  fetchFn?: typeof fetch;
  /** archiveUrl(path) — the absolute URL of an archive endpoint (default transport only). */
  archiveUrl?(path: string): string;
  getSelectedName(): string;
  isOwn(): boolean;
  getArchiveNames(): string[];
  viewArchive(name: string): void | Promise<void>;
  loadArchives(): void | Promise<void>;
  /** showArchiveLog (:9633-9639) — opens the floating log panel. */
  openLog(): void;
  t: I18nT;
  notify(message: string, kind: 'ok' | 'err' | 'info' | 'warn'): void;
  timers?: { setInterval: typeof setInterval; clearInterval: typeof clearInterval };
  now?(): number;
}

interface PullResultsModal {
  title: string;
  items: ArchivePullResultItem[];
}

interface OutputModal {
  title: string;
  output: string;
}

interface CompactPreviewModal {
  name: string;
  view: ArchiveCompactView;
  creds: { username: string; email: string };
}

export interface ArchiveGitStore {
  pullRunning: Ref<boolean>;
  pullOpen: Ref<boolean>;
  pullTitle: Ref<string>;
  pullStatus: Ref<string>;
  pullStatusError: Ref<boolean>;
  pullLog: Ref<string>;
  pullElapsedText: Ref<string>;
  /** The ctx-sidebar Pull All label (:9490-9503, :9505-9509). */
  pullButtonLabel: Ref<string>;
  pullResults: Ref<PullResultsModal | null>;
  pushOutput: Ref<OutputModal | null>;
  compactPreview: Ref<CompactPreviewModal | null>;
  compactOutput: Ref<OutputModal | null>;
  setupOpen: Ref<boolean>;
  setupForm: Ref<ArchiveSetupForm>;
  setupArchiveNames: Ref<string[]>;
  pullSelected(): Promise<void>;
  pullAll(): Promise<void>;
  hidePull(): void;
  closePullResults(): void;
  push(): Promise<void>;
  openSetup(): Promise<void>;
  loadReadmeSetup(name: string): Promise<void>;
  testPush(): Promise<void>;
  saveSetup(): Promise<void>;
  closeSetup(): void;
  compactHistory(): Promise<void>;
  confirmCompact(): Promise<void>;
  closeCompactPreview(): void;
  closeCompactOutput(): void;
  closePushOutput(): void;
  dispose(): void;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const EMPTY_SETUP_FORM: ArchiveSetupForm = {
  my_archive: '',
  username: '',
  email: '',
  access_token: '',
  auto_pull_interval: '0',
  readme_title: 'PBGui Config Archive',
  readme_static_markdown: '',
};

export function createArchiveGitFlows(ctx: ArchiveGitContext): ArchiveGitStore {
  const timers = ctx.timers ?? { setInterval, clearInterval };
  const now = ctx.now ?? (() => Date.now());

  const pullRunning = ref(false);
  const pullOpen = ref(false);
  const pullTitle = ref('');
  const pullStatus = ref('');
  const pullStatusError = ref(false);
  const pullLog = ref('');
  const pullStartedAt = ref(0);
  const pullTick = ref(0);
  const pullResults = ref<PullResultsModal | null>(null);
  const pushOutput = ref<OutputModal | null>(null);
  const compactPreview = ref<CompactPreviewModal | null>(null);
  const compactOutput = ref<OutputModal | null>(null);
  const setupOpen = ref(false);
  const setupForm = ref<ArchiveSetupForm>({ ...EMPTY_SETUP_FORM });
  const setupArchiveNames = ref<string[]>([]);

  let pullTimer: ReturnType<typeof timers.setInterval> | null = null;

  /** The 1 s elapsed meta + button text (:9505-9509). */
  const pullElapsedText = computed(() => {
    void pullTick.value;
    return 'Elapsed: ' + formatArchivePullElapsed(now(), pullStartedAt.value);
  });

  const pullButtonLabel = computed(() => {
    if (!pullRunning.value) return ctx.t('v7backtest.pullAll');
    void pullTick.value;
    return 'Pulling... ' + formatArchivePullElapsed(now(), pullStartedAt.value);
  });

  /* ── pull stream plumbing (:9484-9632) ── */

  function openPullProgress(title: string, subtitle: string): void {
    pullStartedAt.value = now();
    pullTitle.value = title;
    pullStatus.value = subtitle || 'Starting archive pull...';
    pullStatusError.value = false;
    pullLog.value = '';
    pullResults.value = null;
    pullOpen.value = true;
    if (pullTimer !== null) timers.clearInterval(pullTimer);
    pullTimer = timers.setInterval(() => {
      pullTick.value++;
    }, ARCHIVE_PULL_TIMER_MS);
    pullTick.value++;
  }

  /** handleArchivePullStreamEvent (:9560-9576). */
  function handlePullEvent(event: ArchivePullStreamEvent): void {
    const patch = archivePullEventPatch(event);
    if (patch.status !== undefined) {
      pullStatus.value = patch.status;
      pullStatusError.value = patch.statusError === true;
    }
    if (patch.append !== undefined) pullLog.value = appendArchivePullOutput(pullLog.value, patch.append);
  }

  /** stopArchivePullProgress (:9549-9557). */
  function stopPullProgress(): void {
    if (pullTimer !== null) {
      timers.clearInterval(pullTimer);
      pullTimer = null;
    }
    pullRunning.value = false;
  }

  /** runArchivePullStream (:9589-9609). */
  async function runPullStream(
    path: string,
    title: string,
    subtitle: string,
    onDone?: (done: Record<string, unknown>) => void
  ): Promise<unknown> {
    if (pullRunning.value) {
      ctx.notify(ctx.t('v7backtest.pullAlreadyRunning'), 'info');
      return null;
    }
    pullRunning.value = true;
    openPullProgress(title, subtitle);
    try {
      const done = await fetchNdjson(path, { method: 'POST' }, handlePullEvent);
      stopPullProgress();
      if (!done) throw new Error('No completion status from server');
      const payload = done as { ok?: unknown; error?: unknown };
      if (payload.ok === false) throw new Error(String(payload.error || 'Pull failed'));
      if (onDone) onDone(done as Record<string, unknown>);
      return done;
    } catch (error) {
      stopPullProgress();
      const message = messageOf(error);
      pullStatus.value = 'Pull failed: ' + message;
      pullStatusError.value = true;
      pullLog.value = appendArchivePullOutput(pullLog.value, '\nPull failed: ' + message + '\n');
      ctx.notify(ctx.t('v7backtest.pullFailed', { msg: message }), 'err');
      return null;
    }
  }

  /** apiFetchNdjson (:1191-1230) — archives always live on the v7 router. */
  async function defaultFetchNdjson(path: string, init: RequestInit, onEvent: (event: ArchivePullStreamEvent) => void): Promise<unknown> {
    if (!ctx.archiveUrl) throw new Error('archiveUrl is required for the default NDJSON transport');
    const fetchFn = ctx.fetchFn ?? fetch;
    const response = await fetchFn(ctx.archiveUrl(path), { credentials: 'same-origin', ...init });
    return readNdjsonStream(
      { ok: response.ok, statusText: response.statusText, body: response.body, json: () => response.json() },
      onEvent as (event: unknown) => void
    );
  }

  function fetchNdjson(path: string, init: RequestInit, onEvent: (event: ArchivePullStreamEvent) => void): Promise<unknown> {
    return (ctx.fetchNdjson ?? defaultFetchNdjson)(path, init, onEvent);
  }

  /** pullArchive (:9611-9625). */
  async function pullSelected(): Promise<void> {
    if (!ctx.getSelectedName()) {
      ctx.notify(ctx.t('v7backtest.clickViewFirst'), 'err');
      return;
    }
    const name = ctx.getSelectedName();
    await runPullStream(`/archives/${encodeURIComponent(name)}/pull/stream`, 'Pull Archive - ' + name, 'Starting pull for ' + name + '...', (done) => {
      ctx.notify(ctx.t('v7backtest.pullComplete'), 'ok');
      const result = (done.result as ArchivePullResultItem | undefined) || { name, output: 'ok' };
      pullOpen.value = false; // the results modal replaces the progress modal
      pullResults.value = { title: ctx.t('v7backtest.pullPrefix', { name }), items: [result] };
      void ctx.viewArchive(name);
    });
  }

  /** pullAllArchives (:9627-9637). */
  async function pullAll(): Promise<void> {
    ctx.notify(ctx.t('v7backtest.pullingAllArchives'), 'info');
    await runPullStream('/archives/pull-all/stream', 'Pull All Archives', 'Starting pull for all archives...', (done) => {
      pullOpen.value = false;
      pullResults.value = { title: ctx.t('v7backtest.pullAllResults'), items: Array.isArray(done.results) ? (done.results as ArchivePullResultItem[]) : [] };
      void ctx.loadArchives();
    });
  }

  function hidePull(): void {
    pullOpen.value = false;
  }

  function closePullResults(): void {
    pullResults.value = null;
  }

  /* ── git push (:9640-9669) ── */

  async function push(): Promise<void> {
    try {
      const settings = await ctx.archiveFetch('/archives/settings');
      const myArchive = String(settings.my_archive || '');
      if (!myArchive) {
        ctx.notify(ctx.t('v7backtest.noOwnArchiveSetup'), 'err');
        return;
      }
      const body = {
        username: String(settings.username || ''),
        email: String(settings.email || ''),
      };
      ctx.openLog();
      ctx.notify(ctx.t('v7backtest.pushingArchive', { name: myArchive }), 'info');
      try {
        const data = await ctx.archiveFetch(`/archives/${encodeURIComponent(myArchive)}/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        pushOutput.value = { title: ctx.t('v7backtest.gitPushPrefix', { name: myArchive }), output: String(data.output || 'ok') };
      } catch (error) {
        ctx.notify(ctx.t('v7backtest.pushFailed', { msg: messageOf(error) }), 'err');
      }
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.couldNotLoadSettings', { msg: messageOf(error) }), 'err');
    }
  }

  function closePushOutput(): void {
    pushOutput.value = null;
  }

  /* ── setup modal (:9747-9845) ── */

  async function openSetup(): Promise<void> {
    try {
      const settings = await ctx.archiveFetch('/archives/settings');
      setupArchiveNames.value = ctx.getArchiveNames();
      setupForm.value = {
        my_archive: String(settings.my_archive || ''),
        username: String(settings.username || ''),
        email: String(settings.email || ''),
        access_token: '',
        auto_pull_interval: String(settings.auto_pull_interval || 0),
        readme_title: String(settings.readme_title || 'PBGui Config Archive'),
        readme_static_markdown: String(settings.readme_static_markdown || ''),
      };
      setupOpen.value = true;
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.couldNotLoadSettings', { msg: messageOf(error) }), 'err');
    }
  }

  /** loadArchiveReadmeSetup (:9814-9824). */
  async function loadReadmeSetup(name: string): Promise<void> {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    try {
      const config = await ctx.archiveFetch(`/archives/${encodeURIComponent(trimmed)}/readme-config`);
      setupForm.value = {
        ...setupForm.value,
        readme_title: String(config.title || trimmed),
        readme_static_markdown: String(config.static_markdown || ''),
      };
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.couldNotLoadReadme', { msg: messageOf(error) }), 'err');
    }
  }

  /** The Test Push button (:9795-9805) — keeps the modal open. */
  async function testPush(): Promise<void> {
    const payload = collectArchiveSetupForm(setupForm.value);
    if (!payload) {
      ctx.notify(ctx.t('v7backtest.selectOwnArchive'), 'err');
      return;
    }
    try {
      const data = await ctx.archiveFetch(`/archives/${encodeURIComponent(payload.my_archive)}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, dry_run: true }),
      });
      ctx.notify(ctx.t('v7backtest.testOk', { output: String(data.output || 'success') }), 'ok');
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.testFailed', { msg: messageOf(error) }), 'err');
    }
  }

  /** The Save button (:9806-9816). */
  async function saveSetup(): Promise<void> {
    const payload = collectArchiveSetupForm(setupForm.value);
    if (!payload) {
      ctx.notify(ctx.t('v7backtest.selectOwnArchive'), 'err');
      return;
    }
    try {
      await ctx.archiveFetch('/archives/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      ctx.notify(ctx.t('v7backtest.archiveSettingsSaved'), 'ok');
      setupOpen.value = false;
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.saveFailed', { msg: messageOf(error) }), 'err');
    }
  }

  function closeSetup(): void {
    setupOpen.value = false;
  }

  /* ── compact history (:9670-9746) ── */

  /** compactArchiveHistory (:9671-9722) — dry-run preview modal. */
  async function compactHistory(): Promise<void> {
    const name = ctx.getSelectedName();
    if (!name || !ctx.isOwn()) {
      ctx.notify(ctx.t('v7backtest.compactOwnOnly'), 'err');
      return;
    }
    try {
      const settings = await ctx.archiveFetch('/archives/settings');
      const creds = {
        username: String(settings.username || ''),
        email: String(settings.email || ''),
      };
      ctx.notify(ctx.t('v7backtest.preparingCompactDryRun'), 'info');
      try {
        const preview = (await ctx.archiveFetch(`/archives/${encodeURIComponent(name)}/compact`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dry_run: true, ...creds }),
        })) as ArchiveCompactPreviewInput;
        compactPreview.value = { name, view: compactPreviewView(preview), creds };
      } catch (error) {
        ctx.notify(ctx.t('v7backtest.compactDryRunFailed', { msg: messageOf(error) }), 'err');
      }
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.couldNotLoadSettings', { msg: messageOf(error) }), 'err');
    }
  }

  /** The Compact & Force Push button (:9724-9741). */
  async function confirmCompact(): Promise<void> {
    const current = compactPreview.value;
    if (!current) return;
    compactPreview.value = null; // closeModal (:9725)
    ctx.openLog();
    ctx.notify(ctx.t('v7backtest.compactingArchive', { name: current.name }), 'info');
    try {
      const result = await ctx.archiveFetch(`/archives/${encodeURIComponent(current.name)}/compact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current.creds, dry_run: false }),
      });
      compactOutput.value = {
        title: ctx.t('v7backtest.compactArchiveHistoryPrefix', { name: current.name }),
        output: String(result.output || 'ok'),
      };
      void ctx.loadArchives();
      void ctx.viewArchive(current.name);
    } catch (error) {
      ctx.notify(ctx.t('v7backtest.compactFailed', { msg: messageOf(error) }), 'err');
    }
  }

  function closeCompactPreview(): void {
    compactPreview.value = null;
  }

  function closeCompactOutput(): void {
    compactOutput.value = null;
  }

  function dispose(): void {
    stopPullProgress();
  }

  if (getCurrentScope()) onScopeDispose(dispose);

  return {
    pullRunning,
    pullOpen,
    pullTitle,
    pullStatus,
    pullStatusError,
    pullLog,
    pullElapsedText,
    pullButtonLabel,
    pullResults,
    pushOutput,
    compactPreview,
    compactOutput,
    setupOpen,
    setupForm,
    setupArchiveNames,
    pullSelected,
    pullAll,
    hidePull,
    closePullResults,
    push,
    openSetup,
    loadReadmeSetup,
    testPush,
    saveSetup,
    closeSetup,
    compactHistory,
    confirmCompact,
    closeCompactPreview,
    closeCompactOutput,
    closePushOutput,
    dispose,
  };
}
