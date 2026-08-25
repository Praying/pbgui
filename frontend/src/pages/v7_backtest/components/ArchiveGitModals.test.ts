import { describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { DOMWrapper, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import { openSelect, selectOptionElements, selectOptionTexts } from '@/shared/testing/select';
import ArchiveGitModals from './ArchiveGitModals.vue';
import ArchiveLogPanel from './ArchiveLogPanel.vue';
import { createArchiveGitFlows, type ArchiveGitStore } from '../composables/useArchiveGit';

/*
 * The archive git modals (M-v7-12, the M-v7-11 DEFERRED block):
 * the pull progress modal (:9512-9525), the pull results modal
 * (:9578-9587, :9613-9637), git push output (:9660-9665), the
 * compact-history preview + output (:9700-9740) and the setup modal
 * (:9750-9812) — plus the floating archive sync log (:9633-9639).
 */

function makeStore(): ArchiveGitStore {
  const notify = vi.fn();
  return createArchiveGitFlows({
    archiveFetch: () => Promise.resolve({}),
    getSelectedName: () => 'mine',
    isOwn: () => true,
    getArchiveNames: () => ['mine', 'other'],
    viewArchive: () => undefined,
    loadArchives: () => undefined,
    openLog: () => undefined,
    t: (key: string) => key,
    notify: (message: string, kind: 'ok' | 'err' | 'info' | 'warn') => notify(message, kind),
  });
}

function mountModals(store: ArchiveGitStore): ReturnType<typeof mount> {
  return mount(ArchiveGitModals, { props: { git: store }, global: { plugins: [createI18n('en')] } });
}

describe('pull progress modal (:9512-9525)', () => {
  it('renders spinner/status/elapsed/log while running and Hide keeps the pull', async () => {
    const store = makeStore();
    store.pullOpen.value = true;
    store.pullTitle.value = 'Pull All Archives';
    store.pullStatus.value = 'mine: Fetching origin';
    store.pullLog.value = '\n### mine\nFetching origin';
    store.pullRunning.value = true;
    const wrapper = mountModals(store);
    expect(wrapper.find('.archive-pull-modal').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-pull-title"]').text()).toBe('Pull All Archives');
    expect(wrapper.find('[data-test="archive-pull-status"]').text()).toBe('mine: Fetching origin');
    expect(wrapper.find('[data-test="archive-pull-status"]').attributes('style')).not.toContain('var(--red)');
    expect(wrapper.find('.archive-pull-spinner').exists()).toBe(true);
    expect(wrapper.find('.archive-pull-bar').exists()).toBe(true);
    expect(wrapper.find('[data-test="archive-pull-log"]').element.textContent).toBe('\n### mine\nFetching origin');
    expect(wrapper.text()).toContain('You can hide this window; the pull keeps running.');

    await wrapper.find('[data-test="archive-pull-hide"]').trigger('click');
    expect(store.pullOpen.value).toBe(false);
    expect(store.pullRunning.value).toBe(true);
    wrapper.unmount();
  });

  it('drops the spinner/bar and colors the status red once stopped', async () => {
    const store = makeStore();
    store.pullOpen.value = true;
    store.pullRunning.value = false;
    store.pullStatus.value = 'Pull failed: git lock';
    store.pullStatusError.value = true;
    const wrapper = mountModals(store);
    expect(wrapper.find('.archive-pull-spinner').exists()).toBe(false);
    expect(wrapper.find('.archive-pull-bar').exists()).toBe(false);
    expect(wrapper.find('[data-test="archive-pull-status"]').attributes('style')).toContain('var(--red)');
    wrapper.unmount();
  });
});

describe('pull results modal (:9578-9587)', () => {
  it('lists every archive with its verdict and output', async () => {
    const store = makeStore();
    store.pullResults.value = {
      title: 'Pull All - Results',
      items: [
        { name: 'mine', output: 'fast-forward' },
        { name: 'other', error: 'boom', recovered: false },
        { name: 'third', recovered: true },
      ],
    };
    const wrapper = mountModals(store);
    const details = wrapper.findAll('[data-test="archive-pull-results"] details');
    expect(details).toHaveLength(3);
    expect(details[0]!.find('summary').text()).toBe('mine: OK');
    expect(details[0]!.find('pre').text()).toBe('fast-forward');
    expect(details[1]!.find('summary').text()).toBe('other: Failed');
    expect(details[1]!.find('pre').text()).toBe('boom');
    expect(details[2]!.find('summary').text()).toBe('third: Recovered');
    await wrapper.find('[data-test="archive-pull-results-close"]').trigger('click');
    expect(store.pullResults.value).toBeNull();
    wrapper.unmount();
  });

  it('renders the empty-list message (:9579)', () => {
    const store = makeStore();
    store.pullResults.value = { title: 'Pull All - Results', items: [] };
    const wrapper = mountModals(store);
    expect(wrapper.find('[data-test="archive-pull-results"]').text()).toContain('No archives.');
    wrapper.unmount();
  });
});

describe('git push + compact output modals (:9660-9665, :9734-9740)', () => {
  it('shows the push output verbatim', async () => {
    const store = makeStore();
    store.pushOutput.value = { title: 'Git Push — mine', output: 'pushed 2 files' };
    const wrapper = mountModals(store);
    expect(wrapper.find('[data-test="archive-push-output"]').text()).toContain('pushed 2 files');
    await wrapper.find('[data-test="archive-push-close"]').trigger('click');
    expect(store.pushOutput.value).toBeNull();
    wrapper.unmount();
  });

  it('shows the compact output verbatim', async () => {
    const store = makeStore();
    store.compactOutput.value = { title: 'Compact Archive History — mine', output: 'rewritten' };
    const wrapper = mountModals(store);
    expect(wrapper.find('[data-test="archive-compact-output"]').text()).toContain('rewritten');
    await wrapper.find('[data-test="archive-compact-output-close"]').trigger('click');
    expect(store.compactOutput.value).toBeNull();
    wrapper.unmount();
  });
});

describe('compact preview modal (:9700-9722)', () => {
  it('renders the warning, estimate, counts and pending changes', async () => {
    const store = makeStore();
    store.compactPreview.value = {
      name: 'mine',
      view: {
        savings: { available: true, human: '1.2 MB', percent: '44' },
        before: '2.7 MB',
        after: '1.5 MB',
        note: 'custom note',
        branch: 'main',
        commitCount: '12',
        manifestItems: 34,
        hasStatus: true,
        statusText: ' M a.json',
        sizeText: 'big',
      },
      creds: { username: '', email: '', access_token: '' },
    };
    const wrapper = mountModals(store);
    const modal = wrapper.find('[data-test="archive-compact-preview"]');
    expect(modal.text()).toContain('This rewrites remote Git history.');
    expect(modal.text()).toContain('force-pushes using --force-with-lease');
    expect(modal.text()).toContain('Estimated Savings');
    expect(modal.text()).toContain('1.2 MB');
    expect(modal.text()).toContain('(44%)');
    expect(modal.text()).toContain('Before');
    expect(modal.text()).toContain('2.7 MB');
    expect(modal.text()).toContain('After Compact');
    expect(modal.text()).toContain('1.5 MB');
    expect(modal.text()).toContain('custom note');
    expect(modal.text()).toContain('Archive');
    expect(modal.text()).toContain('Branch');
    expect(modal.text()).toContain('main');
    expect(modal.text()).toContain('Commit Count');
    expect(modal.text()).toContain('12');
    expect(modal.text()).toContain('Manifest Items');
    expect(modal.text()).toContain('34');
    expect(modal.text()).toContain('Pending Local Changes');
    expect(modal.text()).toContain(' M a.json');
    expect(modal.text()).toContain('Object Size');
    expect(modal.text()).toContain('big');

    await wrapper.find('[data-test="archive-compact-confirm"]').trigger('click');
    expect(store.compactPreview.value).toBeNull();
    wrapper.unmount();
  });

  it('falls back to the muted placeholders and cancels without confirming', async () => {
    const store = makeStore();
    const confirmSpy = vi.spyOn(store, 'confirmCompact');
    store.compactPreview.value = {
      name: 'mine',
      view: {
        savings: { available: false, human: '', percent: '' },
        before: 'unknown',
        after: 'unknown',
        note: 'Actual remote savings appear after remote garbage collection.',
        branch: 'unknown',
        commitCount: 'unknown',
        manifestItems: 0,
        hasStatus: false,
        statusText: 'Clean working tree',
        sizeText: 'No size estimate available',
      },
      creds: { username: '', email: '', access_token: '' },
    };
    const wrapper = mountModals(store);
    const text = wrapper.find('[data-test="archive-compact-preview"]').text();
    expect(text).toContain('Estimate unavailable');
    expect(text).toContain('Clean working tree');
    expect(text).toContain('No size estimate available');
    await wrapper.find('[data-test="archive-compact-cancel"]').trigger('click');
    expect(store.compactPreview.value).toBeNull();
    expect(confirmSpy).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});

describe('setup modal (:9750-9812)', () => {
  it('renders every field seeded from settings, reloads the readme config on select change, tests and saves', async () => {
    const store = makeStore();
    store.setupOpen.value = true;
    store.setupArchiveNames.value = ['mine', 'other'];
    store.setupForm.value = {
      my_archive: 'mine',
      username: 'u',
      email: 'e@x',
      access_token: 'tok',
      auto_pull_interval: '15',
      readme_title: 'My Title',
      readme_static_markdown: 'notes',
    };
    const loadSpy = vi.spyOn(store, 'loadReadmeSetup');
    const testSpy = vi.spyOn(store, 'testPush');
    const saveSpy = vi.spyOn(store, 'saveSetup');
    const wrapper = mountModals(store);
    const modal = wrapper.find('[data-test="archive-setup"]');
    expect(modal.exists()).toBe(true);
    // reka listbox: options live in a body portal; the legacy value="" reset
    // row is gone (the cleared model renders as the trigger label instead).
    // The pick happens on this same open — re-opening an open listbox
    // toggles it shut.
    await openSelect(wrapper, '[data-test="setup-arc-name"]');
    expect(selectOptionTexts()).toEqual(['mine', 'other']);
    expect(modal.find('[data-test="setup-arc-name"]').text()).toContain('mine');
    expect((modal.find('[data-test="setup-arc-user"]').element as HTMLInputElement).value).toBe('u');
    expect((modal.find('[data-test="setup-arc-email"]').element as HTMLInputElement).value).toBe('e@x');
    expect((modal.find('[data-test="setup-arc-token"]').element as HTMLInputElement).value).toBe('tok');
    expect(modal.find('[data-test="setup-arc-token"]').attributes('type')).toBe('password');
    expect((modal.find('[data-test="setup-arc-interval"]').element as HTMLInputElement).value).toBe('15');
    expect((modal.find('[data-test="setup-arc-readme-title"]').element as HTMLInputElement).value).toBe('My Title');
    expect((modal.find('[data-test="setup-arc-readme-static"]').element as HTMLTextAreaElement).value).toBe('notes');
    expect(modal.text()).toContain('Archive paths are generated automatically');

    const option = selectOptionElements().find((el) => el.textContent?.trim() === 'other');
    await new DOMWrapper(option!).trigger('pointerup');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadSpy).toHaveBeenCalledWith('other');
    await modal.find('[data-test="setup-test-push"]').trigger('click');
    expect(testSpy).toHaveBeenCalledTimes(1);
    expect(store.setupOpen.value).toBe(true); // the modal stays open
    await modal.find('[data-test="setup-save"]').trigger('click');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    await modal.find('[data-test="setup-cancel"]').trigger('click');
    wrapper.unmount();
  });
});

describe('ArchiveLogPanel (:9633-9639)', () => {
  it('hosts the global LogViewerPanel pinned to ArchiveSync.log', async () => {
    const instances: Array<{ open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const ctor = vi.fn().mockImplementation(() => {
      const viewer = { open: vi.fn(), close: vi.fn() };
      instances.push(viewer);
      return viewer;
    });
    (window as unknown as { LogViewerPanel: unknown }).LogViewerPanel = ctor;
    const wrapper = mount(ArchiveLogPanel, { global: { plugins: [createI18n('en')] } });
    expect(wrapper.find('#log-panel').classes()).not.toContain('visible');
    wrapper.vm.open();
    await nextTick();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(ctor).toHaveBeenCalledWith(
      expect.objectContaining({
        containerId: 'log-viewer-target',
        defaultHost: 'local',
        defaultFile: 'ArchiveSync.log',
        presets: 'system',
        showRestart: false,
        height: '100%',
      })
    );
    expect(instances[0]!.open).toHaveBeenCalledTimes(1);
    expect(wrapper.find('#log-panel').classes()).toContain('visible');
    expect(wrapper.find('#log-panel-title').text()).toContain('Archive Sync Log');
    expect(wrapper.find('#log-panel-title svg').exists()).toBe(true);
    const closeButton = wrapper.find('#log-panel-close');
    expect(closeButton.attributes('aria-label')).toBe('Close');
    expect(closeButton.find('svg').exists()).toBe(true);
    await closeButton.trigger('click');
    expect(wrapper.find('#log-panel').classes()).not.toContain('visible');
    expect(instances[0]!.close).toHaveBeenCalledTimes(1);
    delete (window as unknown as { LogViewerPanel?: unknown }).LogViewerPanel;
    wrapper.unmount();
  });
});
