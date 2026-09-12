import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import { EmptyRow, ListFooter, ListWrap, SortTh, Table, TdActions, Th } from '.';

describe('Table', () => {
  it('renders the shared list-table contract with caller classes merged', () => {
    const wrapper = mount(Table, {
      props: { class: 'min-w-max select-none' },
      slots: { default: '<tbody><tr><td>x</td></tr></tbody>' },
    });

    const el = wrapper.get('table');
    expect(el.classes()).toContain('pbgui-list-table');
    expect(el.classes()).toContain('border-separate');
    expect(el.classes()).toContain('border-spacing-0');
    // width floors stay caller-owned
    expect(el.classes()).toContain('min-w-max');
    expect(el.classes()).toContain('select-none');
  });
});

describe('Th', () => {
  it('is sticky by default and drops the sticky pair when disabled', () => {
    const sticky = mount(Th, { slots: { default: 'Name' } });
    expect(sticky.get('th').classes()).toContain('sticky');

    const flow = mount(Th, { props: { sticky: false }, slots: { default: 'Name' } });
    expect(flow.get('th').classes()).not.toContain('sticky');
  });

  it('applies the alignment utility', () => {
    const wrapper = mount(Th, { props: { align: 'center' }, slots: { default: 'Actions' } });
    expect(wrapper.get('th').classes()).toContain('text-center');
  });
});

describe('SortTh', () => {
  it('renders the activation affordances and the data-sort hook', () => {
    const wrapper = mount(SortTh, { props: { label: 'Name', sortKey: 'name' } });

    const th = wrapper.get('th');
    expect(th.attributes('data-sort')).toBe('name');
    expect(th.attributes('role')).toBe('button');
    expect(th.attributes('tabindex')).toBe('0');
    expect(th.attributes('aria-sort')).toBeUndefined();
    // inactive column: label present, no caret icon
    expect(th.text()).toBe('Name');
    expect(wrapper.findComponent({ name: 'PbIcon' }).exists()).toBe(false);
  });

  it('exposes aria-sort and the caret for each direction', async () => {
    const wrapper = mount(SortTh, { props: { label: 'Name', sortKey: 'name', sort: 'asc' } });

    expect(wrapper.get('th').attributes('aria-sort')).toBe('ascending');
    let icon = wrapper.getComponent({ name: 'PbIcon' });
    expect(icon.props('icon')).toBeDefined();

    await wrapper.setProps({ sort: 'desc' });
    expect(wrapper.get('th').attributes('aria-sort')).toBe('descending');
    icon = wrapper.getComponent({ name: 'PbIcon' });
    expect(icon.props('icon')).toBeDefined();
  });

  it('emits sort with the sortKey on click and keyboard activation', async () => {
    const wrapper = mount(SortTh, { props: { label: 'Name', sortKey: 'name' } });

    await wrapper.get('th').trigger('click');
    expect(wrapper.emitted('sort')).toEqual([['name']]);

    await wrapper.get('th').trigger('keydown', { key: 'Enter' });
    await wrapper.get('th').trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('sort')).toHaveLength(3);
  });

  it('keeps sort headers sticky by default and honors rich slot content', () => {
    const wrapper = mount(SortTh, {
      props: { sortKey: 'twe', sticky: true },
      slots: { default: 'TWE' },
    });

    expect(wrapper.get('th').classes()).toContain('sticky');
    expect(wrapper.get('th').text()).toBe('TWE');
  });
});

describe('TdActions', () => {
  it('renders the action rail chrome and stops row-level click/mousedown', async () => {
    const onClick = vi.fn();
    const onMousedown = vi.fn();
    const wrapper = mount(
      {
        components: { TdActions },
        template: `
          <tr @click="onClick" @mousedown="onMousedown">
            <TdActions data-test="actions"><button type="button">Edit</button></TdActions>
          </tr>`,
        setup: () => ({ onClick, onMousedown }),
      },
      { attachTo: document.body },
    );

    const td = wrapper.get('[data-test="actions"]');
    expect(td.classes()).toContain('pbgui-list-actions');
    expect(td.classes()).toContain('whitespace-nowrap!');

    await td.trigger('click');
    await td.trigger('mousedown');
    expect(onClick).not.toHaveBeenCalled();
    expect(onMousedown).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('supports align prop with matching cell and group alignment classes', () => {
    const left = mount(TdActions);
    expect(left.get('td').classes()).toContain('text-left');
    expect(left.get('.pbgui-list-actions__group').classes()).toContain('justify-start');

    const center = mount(TdActions, { props: { align: 'center' } });
    expect(center.get('td').classes()).toContain('text-center');
    expect(center.get('.pbgui-list-actions__group').classes()).toContain('justify-center');

    const right = mount(TdActions, { props: { align: 'right' } });
    expect(right.get('td').classes()).toContain('text-right');
    expect(right.get('.pbgui-list-actions__group').classes()).toContain('justify-end');
  });
});

describe('EmptyRow', () => {
  it('spans the column set and embeds the shared EmptyState', async () => {
    const wrapper = mount(EmptyRow, {
      props: { colspan: 8, title: 'No results yet', message: 'Start a run', actionLabel: 'Open queue' },
    });

    expect(wrapper.get('td').attributes('colspan')).toBe('8');
    expect(wrapper.get('td').classes()).toContain('p-8!');
    expect(wrapper.get('[data-state="empty"]').attributes('aria-labelledby')).toBeTruthy();

    await wrapper.get('button').trigger('click');
    expect(wrapper.emitted('action')).toHaveLength(1);
  });
});

describe('ListWrap', () => {
  it('exposes its root element for drag-select getWrap', () => {
    const wrapper = mount(ListWrap, { slots: { default: '<table />' } });

    expect(wrapper.get('div').classes()).toContain('pbgui-list-wrap');
    expect(wrapper.vm.root).toBeInstanceOf(HTMLElement);
  });

  it('stays layout-thin: framing utilities come from the caller', () => {
    const wrapper = mount(ListWrap, { props: { class: 'opt-table-wrap min-h-0 flex-1 overflow-auto' } });

    const classes = wrapper.get('div').classes();
    expect(classes).toContain('min-h-0');
    expect(classes).toContain('overflow-auto');
    // the component itself must not impose borders or overflow behavior
    expect(classes).not.toContain('border');
  });
});

describe('ListFooter', () => {
  it('renders the terminal bar with slotted counts', () => {
    const wrapper = mount(ListFooter, {
      props: { class: 'mt-2' },
      slots: { default: '<span data-test="count">3 items</span>' },
    });

    expect(wrapper.get('footer').classes()).toContain('pbgui-list-footer');
    expect(wrapper.get('[data-test="count"]').text()).toBe('3 items');
  });
});
