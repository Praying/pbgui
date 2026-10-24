import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import LogViewer from '@/shared/components/LogViewer.vue';
import ActivityPanel from './ActivityPanel.vue';

/* Activity log panel (M-data-8 — legacy market_data_main.html:3579-3592,
   ensureActivityLogViewer :8851-8866 + syncActivityLogViewer :8869-8873).

   Regression: the panel used to instantiate the legacy global
   `frontend/js/log_viewer_panel.js` through `window.LogViewerPanel`. That file
   declares `class LogViewerPanel` at the top level of a classic script, so the
   binding is lexical and never becomes a `window` property — the panel always
   rendered its "log viewer unavailable" error. It now mounts the shared Vue
   viewer like the Logging Monitor / API Keys / VPS Monitor pages. */

enableAutoUnmount(afterEach);

function mountPanel(active = false) {
  return mount(ActivityPanel, {
    props: { active },
    global: { plugins: [createI18n('en')] },
  });
}

describe('activity log panel (M-data-8)', () => {
  it('renders the shared-viewer header and mounts the shared viewer', () => {
    const panel = mountPanel();
    expect(panel.find('.activity-log-shell').exists()).toBe(true);
    expect(panel.text()).toContain('Activity Log');
    expect(panel.text()).toContain('Shared log viewer');

    const viewer = panel.findComponent(LogViewer);
    expect(viewer.exists()).toBe(true);
    expect(viewer.props()).toMatchObject({
      active: false,
      defaultFile: 'MarketData.log',
      showSidebar: true,
    });
    expect(String(viewer.props('wsBase'))).toMatch(/^wss?:/);
    expect((viewer.props('presets') as unknown[]).length).toBeGreaterThan(0);
  });

  it('follows the panel visibility through the viewer active gate (:8869-8873)', async () => {
    const panel = mountPanel(false);
    expect(panel.findComponent(LogViewer).props('active')).toBe(false);

    await panel.setProps({ active: true });
    expect(panel.findComponent(LogViewer).props('active')).toBe(true);

    await panel.setProps({ active: false });
    expect(panel.findComponent(LogViewer).props('active')).toBe(false);
  });

  it('does not depend on the legacy window.LogViewerPanel bridge', () => {
    // The legacy global never exists on `window` (class declaration), so any
    // code reading it lands in an error state. The panel must not consult it.
    expect((window as unknown as { LogViewerPanel?: unknown }).LogViewerPanel).toBeUndefined();
    const panel = mountPanel(true);
    expect(panel.text()).not.toContain('Log viewer unavailable');
    expect(panel.find('[data-state="error"]').exists()).toBe(false);
  });
});
