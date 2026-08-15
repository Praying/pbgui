import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusBadge from './StatusBadge.vue';

/* Port of the legacy #status element + setStatus (editor:469, 541-544):
   textContent = msg, className = 'status' + optional cls. */

describe('StatusBadge', () => {
  it('renders the status text inside the legacy #status element', () => {
    const wrapper = mount(StatusBadge, { props: { msg: 'saved', cls: 'saved' } });
    expect(wrapper.find('#status').text()).toBe('saved');
  });

  it('applies the legacy status class', () => {
    const wrapper = mount(StatusBadge, { props: { msg: 'error', cls: 'error' } });
    expect(wrapper.find('#status').classes()).toEqual(['status', 'error']);
  });

  it('renders the bare status class when cls is empty (setStatus default)', () => {
    const wrapper = mount(StatusBadge, { props: { msg: 'saving…', cls: '' } });
    expect(wrapper.find('#status').classes()).toEqual(['status']);
  });

  it('renders empty content for the initial state', () => {
    const wrapper = mount(StatusBadge, { props: { msg: '', cls: '' } });
    expect(wrapper.find('#status').text()).toBe('');
  });
});
