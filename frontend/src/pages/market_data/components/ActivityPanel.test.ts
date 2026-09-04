import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import ActivityPanel from './ActivityPanel.vue';

/* Activity log panel (M-data-8 — legacy market_data_main.html:3579-3592,
   ensureActivityLogViewer :8851-8866 + syncActivityLogViewer :8869-8873):
   lazily bridges the global LogViewerPanel script, opens on activation and
   closes on leave, and surfaces a missing script as an inline error state
   (legacy failed silently). */

class ViewerMock {
  static instances: ViewerMock[] = [];
  options: Record<string, unknown>;
  open = vi.fn();
  close = vi.fn();
  constructor(options: Record<string, unknown>) {
    this.options = options;
    ViewerMock.instances.push(this);
  }
}

function mountPanel(active = false) {
  return mount(ActivityPanel, {
    props: { active },
    global: { plugins: [createI18n('en')] },
  });
}

beforeEach(() => {
  ViewerMock.instances = [];
  (window as unknown as { LogViewerPanel: typeof ViewerMock }).LogViewerPanel = ViewerMock;
});

afterEach(() => {
  delete (window as unknown as { LogViewerPanel?: typeof ViewerMock }).LogViewerPanel;
  document.body.innerHTML = '';
});

describe('activity log panel (M-data-8)', () => {
  it('renders the shared-viewer header and the mount target', () => {
    const panel = mountPanel();
    expect(panel.find('.activity-log-shell').exists()).toBe(true);
    expect(panel.find('#activity-log-target').exists()).toBe(true);
    expect(panel.text()).toContain('Activity Log');
    expect(panel.text()).toContain('Shared log viewer');
    expect(panel.text()).toContain('MarketData.log');
  });

  it('creates the viewer lazily on first activation only (:8851-8866)', async () => {
    const panel = mountPanel(false);
    expect(ViewerMock.instances).toHaveLength(0);
    await panel.setProps({ active: true });
    expect(ViewerMock.instances).toHaveLength(1);
    const viewer = ViewerMock.instances[0]!;
    expect(viewer.open).toHaveBeenCalledTimes(1);
    expect(viewer.options).toMatchObject({
      containerId: 'activity-log-target',
      defaultHost: 'local',
      defaultFile: 'MarketData.log',
      presets: 'system',
      showRestart: false,
      height: '100%',
    });
    expect(String(viewer.options.wsBase)).toMatch(/^wss?:/);

    // leave → close, re-enter → same viewer, no second instance
    await panel.setProps({ active: false });
    expect(viewer.close).toHaveBeenCalledTimes(1);
    await panel.setProps({ active: true });
    expect(ViewerMock.instances).toHaveLength(1);
    expect(viewer.open).toHaveBeenCalledTimes(2);
  });

  it('opens on mount when booted straight into the panel (restorePanel :9736)', () => {
    const panel = mountPanel(true);
    expect(ViewerMock.instances).toHaveLength(1);
    expect(ViewerMock.instances[0]!.open).toHaveBeenCalledTimes(1);
  });

  it('closes the viewer on unmount so a remount holds no socket', async () => {
    const panel = mountPanel(true);
    const viewer = ViewerMock.instances[0]!;
    panel.unmount();
    expect(viewer.close).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error state when the script asset is missing', async () => {
    delete (window as unknown as { LogViewerPanel?: typeof ViewerMock }).LogViewerPanel;
    const panel = mountPanel(false);
    await panel.setProps({ active: true });
    expect(panel.find('[data-state="error"]').exists()).toBe(true);
    expect(panel.text()).toContain('Log viewer unavailable: LogViewerPanel');
    expect(panel.find('#activity-log-target').exists()).toBe(false);
  });
});
