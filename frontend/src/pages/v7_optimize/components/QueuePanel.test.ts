import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import QueuePanel from './QueuePanel.vue';

describe('QueuePanel', () => {
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
});
