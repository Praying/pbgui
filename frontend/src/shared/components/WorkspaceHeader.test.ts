import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PhCheck, PhCopy } from '@phosphor-icons/vue';
import { createI18n } from '@/shared/i18n';
import WorkspaceHeader from './WorkspaceHeader.vue';

function setClipboard(value: { writeText(text: string): Promise<void> } | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

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
    expect(wrapper.get('.workspace-header__actions button').text()).toBe('Restart');
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

  it('copies the breadcrumb path with "/"-joined labels when the copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const i18n = createI18n('en');

    const wrapper = mount(WorkspaceHeader, {
      props: {
        family: 'PBv8',
        title: 'Backtest',
        breadcrumbs: [
          { label: 'PBv8' },
          { label: '回测' },
          { label: '配置' },
        ],
      },
      global: { plugins: [i18n] },
    });

    const copyButton = wrapper.get('button.workspace-header__copy');
    expect(copyButton.attributes('aria-label')).toBe('Copy path');
    expect(wrapper.findComponent(PhCopy).exists()).toBe(true);

    await copyButton.trigger('click');
    await vi.waitFor(() => expect(copyButton.attributes('aria-label')).toBe('Path copied'));

    expect(writeText).toHaveBeenCalledWith('PBv8/回测/配置');
    expect(wrapper.findComponent(PhCheck).exists()).toBe(true);
    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Path copied');
  });

  it('falls back to the legacy execCommand copy when the Clipboard API is unavailable', async () => {
    setClipboard(undefined);
    let selectedText = '';
    const execCommand = vi.fn(() => {
      selectedText = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });
    const i18n = createI18n('en');

    const wrapper = mount(WorkspaceHeader, {
      props: { family: 'System', title: 'Services' },
      global: { plugins: [i18n] },
    });

    await wrapper.get('button.workspace-header__copy').trigger('click');
    await vi.waitFor(() =>
      expect(wrapper.get('button.workspace-header__copy').attributes('aria-label')).toBe('Path copied'),
    );

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(selectedText).toBe('System/Services');
  });
});
