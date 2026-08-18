import { describe, expect, it } from 'vitest';
import {
  appendArchivePullOutput,
  archivePullEventPatch,
  archivePullResultBody,
  archivePullResultStatus,
  collectArchiveSetupForm,
  compactPreviewView,
  formatArchivePullElapsed,
  type ArchivePullStreamEvent,
  type ArchiveSetupForm,
} from './archiveGitModel';

/*
 * Pure helpers of the archive git-maintenance surface (M-v7-12, the
 * M-v7-11 DEFERRED block): the pull-stream event reducer
 * (:9559-9576), the output-log append/truncate (:9538-9548), the
 * elapsed formatter (:9484-9489), the per-archive result rows
 * (:9578-9587), the setup form collector (:9826-9845) and the
 * compact-preview view model (:9686-9700).
 */

describe('formatArchivePullElapsed (:9484-9489)', () => {
  it('renders seconds only under one minute', () => {
    expect(formatArchivePullElapsed(0, 0)).toBe('0s');
    expect(formatArchivePullElapsed(5_000, 0)).toBe('5s');
    expect(formatArchivePullElapsed(59_000, 0)).toBe('59s');
  });

  it('renders minutes plus the second remainder', () => {
    expect(formatArchivePullElapsed(60_000, 0)).toBe('1m 0s');
    expect(formatArchivePullElapsed(61_000, 0)).toBe('1m 1s');
    expect(formatArchivePullElapsed(125_000, 0)).toBe('2m 5s');
  });

  it('clamps a negative delta to 0s', () => {
    expect(formatArchivePullElapsed(1_000, 5_000)).toBe('0s');
  });
});

describe('appendArchivePullOutput (:9538-9548)', () => {
  it('returns the current log for empty messages', () => {
    expect(appendArchivePullOutput('abc', '')).toBe('abc');
    expect(appendArchivePullOutput('abc', undefined)).toBe('abc');
  });

  it('converts carriage returns to newlines', () => {
    expect(appendArchivePullOutput('a', 'b\rc\r')).toBe('ab\nc\n');
  });

  it('truncates at 120k chars keeping the last 90k behind a notice', () => {
    const big = 'x'.repeat(119_999);
    const next = appendArchivePullOutput(big, 'x'.repeat(10));
    expect(next.startsWith('... output truncated ...\n')).toBe(true);
    expect(next.length).toBe('... output truncated ...\n'.length + 90_000);
  });

  it('leaves smaller logs untouched by truncation', () => {
    expect(appendArchivePullOutput('', '\n### mine\n')).toBe('\n### mine\n');
  });
});

describe('archivePullEventPatch (:9559-9576)', () => {
  it('ignores events without a type', () => {
    expect(archivePullEventPatch({} as ArchivePullStreamEvent)).toEqual({});
  });

  it('archive_start announces the archive and opens a log section', () => {
    expect(archivePullEventPatch({ type: 'archive_start', archive: 'mine' })).toEqual({
      status: 'Pulling mine',
      append: '\n### mine\n',
    });
    expect(archivePullEventPatch({ type: 'archive_start', archive: 'mine', message: 'Starting' })).toEqual({
      status: 'Starting',
      append: '\n### mine\n',
    });
    expect(archivePullEventPatch({ type: 'archive_start' })).toEqual({ status: 'Pulling archive', append: '\n### archive\n' });
  });

  it('status prefixes the archive and defaults to Working...', () => {
    expect(archivePullEventPatch({ type: 'status', archive: 'mine', message: 'Fetching' })).toEqual({ status: 'mine: Fetching' });
    expect(archivePullEventPatch({ type: 'status' })).toEqual({ status: 'Working...' });
  });

  it('output appends the raw message', () => {
    expect(archivePullEventPatch({ type: 'output', message: 'git: done' })).toEqual({ append: 'git: done' });
    expect(archivePullEventPatch({ type: 'output' })).toEqual({ append: '' });
  });

  it('error marks the status red and logs an ERROR line', () => {
    expect(archivePullEventPatch({ type: 'error', archive: 'mine', message: 'boom' })).toEqual({
      status: 'mine: boom',
      statusError: true,
      append: '\nERROR: boom\n',
    });
    expect(archivePullEventPatch({ type: 'error' })).toEqual({
      status: 'Pull failed',
      statusError: true,
      append: '\nERROR: Pull failed\n',
    });
  });

  it('archive_done summarizes each archive result', () => {
    expect(archivePullEventPatch({ type: 'archive_done', result: { name: 'mine' } })).toEqual({ append: '\nmine: ok\n' });
    expect(archivePullEventPatch({ type: 'archive_done', archive: 'other', result: { error: 'x' } })).toEqual({
      append: '\nother: failed\n',
    });
    expect(archivePullEventPatch({ type: 'archive_done', result: { recovered: true } })).toEqual({ append: '\narchive: recovered\n' });
  });
});

describe('pull result rows (:9578-9587)', () => {
  it('maps error/recovered to Failed/Recovered/OK', () => {
    expect(archivePullResultStatus({ error: 'x' })).toBe('Failed');
    expect(archivePullResultStatus({ recovered: true })).toBe('Recovered');
    expect(archivePullResultStatus({})).toBe('OK');
  });

  it('prefers error, then output, then ok', () => {
    expect(archivePullResultBody({ error: 'x', output: 'y' })).toBe('x');
    expect(archivePullResultBody({ output: 'y' })).toBe('y');
    expect(archivePullResultBody({})).toBe('ok');
  });
});

describe('collectArchiveSetupForm (:9826-9845)', () => {
  const form: ArchiveSetupForm = {
    my_archive: ' mine ',
    username: ' alice ',
    email: ' a@b.c ',
    access_token: ' ghp_1 ',
    auto_pull_interval: '15',
    readme_title: ' My Archive ',
    readme_static_markdown: ' notes\nkeep  ',
  };

  it('trims name/username/email/title only and parses the interval', () => {
    expect(collectArchiveSetupForm(form)).toEqual({
      my_archive: 'mine',
      username: 'alice',
      email: 'a@b.c',
      access_token: ' ghp_1 ',
      auto_pull_interval: 15,
      readme_title: 'My Archive',
      readme_static_markdown: ' notes\nkeep  ',
    });
  });

  it('falls back to interval 0 for unparsable or empty input', () => {
    expect(collectArchiveSetupForm({ ...form, auto_pull_interval: 'abc' })?.auto_pull_interval).toBe(0);
    expect(collectArchiveSetupForm({ ...form, auto_pull_interval: '' })?.auto_pull_interval).toBe(0);
  });

  it('rejects an empty own-archive selection', () => {
    expect(collectArchiveSetupForm({ ...form, my_archive: '   ' })).toBeNull();
  });
});

describe('compactPreviewView (:9686-9700)', () => {
  it('renders every field from a full preview', () => {
    const view = compactPreviewView({
      status: [' M a.json', '?? b.json'],
      storage_estimate: { available: true, saved_human: '1.2 MB', saved_percent: '44', current_human: '2.7 MB', after_human: '1.5 MB', note: 'custom note' },
      branch: 'main',
      commit_count: 12,
      manifest_items: 34,
      object_size: 'big',
    });
    expect(view.savings).toEqual({ available: true, human: '1.2 MB', percent: '44' });
    expect(view.before).toBe('2.7 MB');
    expect(view.after).toBe('1.5 MB');
    expect(view.note).toBe('custom note');
    expect(view.branch).toBe('main');
    expect(view.commitCount).toBe('12');
    expect(view.manifestItems).toBe(34);
    expect(view.hasStatus).toBe(true);
    expect(view.statusText).toBe(' M a.json\n?? b.json');
    expect(view.sizeText).toBe('big');
  });

  it('falls back to the legacy placeholders when fields are missing', () => {
    const view = compactPreviewView({});
    expect(view.savings).toEqual({ available: false, human: '', percent: '' });
    expect(view.before).toBe('unknown');
    expect(view.after).toBe('unknown');
    expect(view.note).toBe('Actual remote savings appear after remote garbage collection.');
    expect(view.branch).toBe('unknown');
    expect(view.commitCount).toBe('unknown');
    expect(view.manifestItems).toBe(0);
    expect(view.hasStatus).toBe(false);
    expect(view.statusText).toBe('Clean working tree');
    expect(view.sizeText).toBe('No size estimate available');
  });

  it('keeps unknown placeholders for an available estimate with missing humans', () => {
    const view = compactPreviewView({ storage_estimate: { available: true } });
    expect(view.savings).toEqual({ available: true, human: '0 Bytes', percent: 0 });
    expect(view.before).toBe('unknown');
    expect(view.after).toBe('unknown');
  });
});
