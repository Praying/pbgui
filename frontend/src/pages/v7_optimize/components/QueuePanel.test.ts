import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueuePanel from './QueuePanel.vue';

describe('QueuePanel', () => {
  it('renders accessible Phosphor reorder controls', () => {
    const wrapper = mount(QueuePanel, {
      props: { rows: [{ filename: 'a', name: 'a' }], selected: new Set<string>(), search: '' },
      global: { plugins: [createI18n('en')] },
    });
    const moveUp = wrapper.find('button[data-test="queue-move-up"]');
    const moveDown = wrapper.find('button[data-test="queue-move-down"]');
    expect(moveUp.attributes('aria-label')).toBeTruthy();
    expect(moveDown.attributes('aria-label')).toBeTruthy();
    expect(moveUp.find('svg').exists()).toBe(true);
    expect(moveDown.find('svg').exists()).toBe(true);
    expect(wrapper.get('tbody tr[data-path="a"]').attributes('aria-selected')).toBe('false');
    expect(wrapper.get('tbody tr[data-path="a"]').attributes('tabindex')).toBe('0');
    wrapper.unmount();
  });

  it('toggles queue selection from keyboard activation', async () => {
    const wrapper = mount(QueuePanel, {
      props: { rows: [{ filename: 'a', name: 'a' }], selected: new Set<string>(), search: '' },
      global: { plugins: [createI18n('en')] },
    });

    await wrapper.get('tbody tr[data-path="a"]').trigger('keydown', { key: ' ' });

    expect(wrapper.emitted('toggle')).toEqual([['a']]);
    wrapper.unmount();
  });

  it('supports dragging a queue item to persist a block reorder', async () => {
    const wrapper = mount(QueuePanel, {
      props: { rows: [{ filename: 'a', name: 'a' }, { filename: 'b', name: 'b' }], selected: new Set<string>(), search: '' },
      global: { plugins: [createI18n('en')] },
    });
    const source = wrapper.find('tr[data-path="a"]');
    const target = wrapper.find('tr[data-path="b"]');
    const data = { value: '', setData(_type: string, value: string) { this.value = value; }, getData() { return this.value; } };
    await source.trigger('dragstart', { dataTransfer: data });
    await target.trigger('drop', { dataTransfer: data });
    expect(wrapper.emitted('reorder')?.[0]?.[0]).toEqual(['b', 'a']);
    wrapper.unmount();
  });

  it('always renders progress bar track and labels for running queue items even before progress arrives', () => {
    const wrapper = mount(QueuePanel, {
      props: {
        rows: [{ filename: 'run-1', name: 'Task 1', status: 'running' }],
        selected: new Set<string>(),
        search: '',
      },
      global: { plugins: [createI18n('en')] },
    });
    const progressBlock = wrapper.find('[data-test="queue-progress"]');
    expect(progressBlock.exists()).toBe(true);
    expect(progressBlock.text()).toContain('0 evals');
    expect(progressBlock.text()).toContain('0%');
    const track = wrapper.find('.bg-border-default');
    expect(track.exists()).toBe(true);
    wrapper.unmount();
  });

  it('renders 1 decimal place for small progress under 10% and formats evaluation targets', () => {
    const wrapper = mount(QueuePanel, {
      props: {
        rows: [{
          filename: 'run-2',
          name: 'Task 2',
          status: 'running',
          progress: { eval: 329, target_iters: 18000 },
        }],
        selected: new Set<string>(),
        search: '',
      },
      global: { plugins: [createI18n('en')] },
    });
    const progressBlock = wrapper.find('[data-test="queue-progress"]');
    expect(progressBlock.exists()).toBe(true);
    expect(progressBlock.text()).toContain('329 / 18,000 evals');
    // 329 / 18000 = ~1.827% -> 1.8%
    expect(progressBlock.text()).toContain('1.8%');
    wrapper.unmount();
  });

  it('does not render progress bar for completed or queued items without progress', () => {
    const wrapper = mount(QueuePanel, {
      props: {
        rows: [
          { filename: 'comp-1', name: 'Task Completed', status: 'complete' },
          { filename: 'queue-1', name: 'Task Queued', status: 'queued' },
        ],
        selected: new Set<string>(),
        search: '',
      },
      global: { plugins: [createI18n('en')] },
    });
    const progressBlocks = wrapper.findAll('[data-test="queue-progress"]');
    expect(progressBlocks).toHaveLength(0);
    wrapper.unmount();
  });
});
