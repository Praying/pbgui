import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { createI18n } from '@/shared/i18n';
import AppShell from './AppShell.vue';

function mountShell() {
  return mount(AppShell, {
    props: {
      pageKey: 'system_services',
      pageTitle: 'Services',
      pageDescription: 'Control PBGui runtime services.',
      pageFamily: 'System',
      statusText: 'Degraded',
      statusTone: 'warning',
    },
    slots: {
      'header-actions': '<button type="button">Restart</button>',
      default: '<section data-testid="primary-content">Primary workspace</section>',
      supporting: '<aside data-testid="supporting-content">Runtime details</aside>',
    },
    global: { plugins: [createI18n('en')] },
  });
}

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders semantic navigation, header, main content, and a skip-link target', () => {
    const wrapper = mountShell();

    expect(wrapper.get('nav').attributes('aria-label')).toBe('Primary navigation');
    expect(wrapper.get('header').text()).toContain('Services');
    expect(wrapper.get('main').attributes('id')).toBe('app-shell-main');
    expect(wrapper.get('a[href="#app-shell-main"]').text()).toBe('Skip to main content');
    expect(wrapper.get('[data-testid="primary-content"]').text()).toBe('Primary workspace');
    expect(wrapper.get('[data-testid="supporting-content"]').text()).toBe('Runtime details');
  });

  it('renders header actions and visible non-color status text', () => {
    const wrapper = mountShell();
    const status = wrapper.get('[role="status"]');

    expect(wrapper.get('header button').text()).toBe('Restart');
    expect(status.text()).toContain('Warning');
    expect(status.text()).toContain('Degraded');
    expect(status.attributes('data-tone')).toBe('warning');
  });

  it('uses the compact rail by default', () => {
    const wrapper = mountShell();

    expect(wrapper.classes()).toContain('app-shell--rail-collapsed');
    expect(wrapper.get('nav').classes()).toContain('workbench-rail--collapsed');
  });

  it('restores the persisted expanded rail preference', () => {
    localStorage.setItem('pbgui-workbench-rail-collapsed', 'false');

    const wrapper = mountShell();

    expect(wrapper.classes()).not.toContain('app-shell--rail-collapsed');
    expect(wrapper.get('nav').classes()).toContain('workbench-rail--floating-expanded');
    expect(wrapper.get('nav').classes()).toContain('workbench-rail--persistent-expanded');
  });

  it('opens the floating rail when compact navigation is explicitly expanded', async () => {
    const wrapper = mountShell();

    await wrapper.get('[data-testid="rail-toggle"]').trigger('click');

    expect(wrapper.classes()).not.toContain('app-shell--rail-collapsed');
    expect(wrapper.get('nav').classes()).toContain('workbench-rail--floating-expanded');
    expect(wrapper.get('nav').classes()).toContain('workbench-rail--persistent-expanded');
  });

  it('renders an explicit status slot instead of the fallback status', () => {
    const wrapper = mount(AppShell, {
      props: {
        pageKey: 'system_services',
        pageTitle: 'Services',
        statusText: 'Fallback status',
      },
      slots: {
        status: '<section role="status">Custom runtime status</section>',
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.get('[role="status"]').text()).toBe('Custom runtime status');
    expect(wrapper.text()).not.toContain('Fallback status');
  });

  it('forwards page sections into the rail and re-emits selection', async () => {
    const wrapper = mount(AppShell, {
      props: {
        pageKey: 'system_services',
        pageTitle: 'Services',
        sections: [
          { key: 'overview', label: 'Overview' },
          { key: 'logs', label: 'Logs', tone: 'warning' },
        ],
        activeSection: 'overview',
      },
      slots: {
        default: '<section data-testid="primary-content">Workspace</section>',
      },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.get('a[aria-current="page"]').trigger('click');

    const buttons = wrapper.findAll('.workbench-rail__subitem');
    expect(buttons.map((button) => button.text())).toEqual(['Overview', 'Logs']);
    expect(wrapper.find('.workbench-rail__subitem-dot[data-tone="warning"]').exists()).toBe(true);

    await buttons[1]!.trigger('click');

    expect(wrapper.emitted('update:section')).toEqual([['logs']]);
  });
});
