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

  it('restores the persisted rail preference', () => {
    localStorage.setItem('pbgui-workbench-rail-collapsed', 'true');

    const wrapper = mountShell();

    expect(wrapper.get('nav').classes()).toContain('workbench-rail--collapsed');
  });

  it('updates the shell layout when the rail emits a collapse change', async () => {
    const wrapper = mountShell();

    await wrapper.get('[data-testid="rail-toggle"]').trigger('click');

    expect(wrapper.classes()).toContain('app-shell--rail-collapsed');
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
});
