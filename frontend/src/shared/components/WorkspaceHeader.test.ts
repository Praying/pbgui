import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WorkspaceHeader from './WorkspaceHeader.vue';

describe('WorkspaceHeader', () => {
  it('renders its family, title, description, status, and actions', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: {
        family: 'System',
        title: 'Services',
        description: 'Control PBGui runtime services.',
      },
      slots: {
        status: '<span data-testid="header-status">Online</span>',
        actions: '<button type="button">Restart</button>',
      },
    });

    expect(wrapper.element.tagName).toBe('HEADER');
    expect(wrapper.get('.workspace-header__family').text()).toBe('System');
    expect(wrapper.get('h1').text()).toBe('Services');
    expect(wrapper.get('.workspace-header__description').text()).toBe('Control PBGui runtime services.');
    expect(wrapper.get('[data-testid="header-status"]').text()).toBe('Online');
    expect(wrapper.get('button').text()).toBe('Restart');
  });

  it('omits optional regions when their props and slots are absent', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: { title: 'Services' },
    });

    expect(wrapper.find('.workspace-header__family').exists()).toBe(false);
    expect(wrapper.find('.workspace-header__description').exists()).toBe(false);
    expect(wrapper.find('.workspace-header__status').exists()).toBe(false);
    expect(wrapper.find('.workspace-header__actions').exists()).toBe(false);
  });
});
