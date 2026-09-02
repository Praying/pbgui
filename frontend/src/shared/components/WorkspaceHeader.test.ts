import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WorkspaceHeader from './WorkspaceHeader.vue';

describe('WorkspaceHeader', () => {
  it('renders its breadcrumb, status, and actions in a single-line layout', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: {
        family: 'System',
        title: 'Services',
        breadcrumbs: [
          { label: 'System' },
          { label: 'Services' },
        ],
      },
      slots: {
        status: '<span data-testid="header-status">Online</span>',
        actions: '<button type="button">Restart</button>',
      },
    });

    expect(wrapper.element.tagName).toBe('HEADER');
    expect(wrapper.get('h1').attributes('class')).toContain('workspace-header__title');
    expect(wrapper.get('nav[aria-label="Breadcrumb"]').text()).toBe('System / Services');
    expect(wrapper.get('.workspace-header__breadcrumb-item[aria-current="page"]').text()).toContain('Services');
    expect(wrapper.get('h1').text()).toBe('Services');
    expect(wrapper.find('.workspace-header__description').exists()).toBe(false);
    expect(wrapper.get('[data-testid="header-status"]').text()).toBe('Online');
    expect(wrapper.get('button').text()).toBe('Restart');
  });

  it('omits optional regions when their props and slots are absent', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: { title: 'Services' },
    });

    expect(wrapper.find('.workspace-header__breadcrumb').exists()).toBe(true);
    expect(wrapper.find('.workspace-header__description').exists()).toBe(false);
    expect(wrapper.find('.workspace-header__status').exists()).toBe(false);
    expect(wrapper.find('.workspace-header__actions').exists()).toBe(false);
  });

  it('uses the family as a fallback ancestor when no breadcrumb is supplied', () => {
    const wrapper = mount(WorkspaceHeader, {
      props: { family: 'PBv7', title: 'Run' },
    });

    expect(wrapper.get('.workspace-header__breadcrumb-list').text()).toBe('PBv7 / Run');
    expect(wrapper.get('h1').text()).toBe('Run');
  });
});
