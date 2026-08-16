import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import PanelShell from './PanelShell.vue';
import ToastStack from './ToastStack.vue';
import { PANELS } from '../composables/usePanels';
import type { PanelId } from '../types';

/* The panel-switching mechanism (legacy setActivePanel :9032-9044):
   one section per registry entry, hidden unless active, active-panel class
   on the active one. */

describe('PanelShell (legacy .content-panel toggling :9038-9043)', () => {
  function mountShell(active: PanelId) {
    return mount(PanelShell, {
      props: { panels: PANELS, active },
      slots: {
        default: `<template #default="{ panel }"><div class="stub">{{ panel.id }}</div></template>`,
      },
    });
  }

  it('renders one section per registry panel with the legacy ids', () => {
    const shell = mountShell('settings-panel');
    const ids = shell.findAll('section.content-panel').map((s) => s.attributes('id'));
    expect(ids).toEqual([
      'settings-panel',
      'status-panel',
      'inventory-panel',
      'integrity-panel',
      'best1m-panel',
      'copy-data-panel',
      'activity-panel',
    ]);
  });

  it('hides every panel except the active one (:9041)', () => {
    const shell = mountShell('status-panel');
    const sections = shell.findAll('section.content-panel');
    for (const section of sections) {
      const isStatus = section.attributes('id') === 'status-panel';
      // Vue removes the hidden attribute when false, so absent = visible
      expect(section.attributes('hidden') !== undefined).toBe(!isStatus);
    }
  });

  it('adds the active-panel class only to the active section (:9040)', () => {
    const shell = mountShell('integrity-panel');
    const active = shell.findAll('section.content-panel').filter((s) => s.classes('active-panel'));
    expect(active).toHaveLength(1);
    expect(active[0]?.attributes('id')).toBe('integrity-panel');
  });

  it('updates visibility when the active prop changes', async () => {
    const shell = mountShell('settings-panel');
    await shell.setProps({ active: 'activity-panel' });
    const visible = shell
      .findAll('section.content-panel')
      .filter((s) => s.attributes('hidden') === undefined);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.attributes('id')).toBe('activity-panel');
  });

  it('forwards each panel to the default slot', () => {
    const shell = mountShell('settings-panel');
    expect(shell.findAll('.stub')).toHaveLength(PANELS.length);
  });
});

describe('ToastStack (legacy #toast-stack markup :4987-4993)', () => {
  it('renders the toast stack with one toast per item', () => {
    const stack = mount(ToastStack, {
      props: {
        toasts: [
          { id: 1, message: 'Saved', level: 'success', leaving: false },
          { id: 2, message: 'Failed', level: 'error', leaving: false },
        ],
      },
    });
    expect(stack.find('#toast-stack').exists()).toBe(true);
    const toasts = stack.findAll('.toast');
    expect(toasts).toHaveLength(2);
    expect(toasts[0]?.classes()).toContain('success');
    expect(toasts[0]?.text()).toBe('Saved');
    expect(toasts[1]?.classes()).toContain('error');
  });

  it('adds the is-leaving class on leaving toasts (:4995)', () => {
    const stack = mount(ToastStack, {
      props: { toasts: [{ id: 1, message: 'bye', level: 'info', leaving: true }] },
    });
    expect(stack.find('.toast')?.classes()).toContain('is-leaving');
  });

  it('renders message text only (never v-html server data)', () => {
    const stack = mount(ToastStack, {
      props: { toasts: [{ id: 1, message: '<img src=x onerror=alert(1)>', level: 'info', leaving: false }] },
    });
    expect(stack.find('.toast')?.element.innerHTML).not.toContain('<img');
    expect(stack.find('.toast')?.text()).toBe('<img src=x onerror=alert(1)>');
  });
});
