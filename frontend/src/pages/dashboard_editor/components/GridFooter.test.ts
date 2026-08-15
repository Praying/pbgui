import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';
import GridFooter from './GridFooter.vue';

/* Port of the add/remove row footer (editor:483-485, 2562-2564, 2633-2634). */

enableAutoUnmount(afterEach);

beforeEach(() => {
  resetDashboardStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GridFooter', () => {
  it('renders the two row buttons with the legacy labels', () => {
    useDashboardStore({ apiBase: '/api', origName: '' });
    const w = mount(GridFooter);
    const buttons = w.findAll('.grid-footer-btn').map((b) => b.text());
    expect(buttons).toEqual(['− Row', '+ Row']);
  });

  it('starts with remove disabled at 1 row', () => {
    useDashboardStore({ apiBase: '/api', origName: '' });
    const w = mount(GridFooter);
    const [remove, add] = w.findAll('.grid-footer-btn');
    expect(remove!.attributes('disabled')).toBeDefined();
    expect(add!.attributes('disabled')).toBeUndefined();
  });

  it('adds a row (clamped at 10) and remove is enabled', async () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    const w = mount(GridFooter);
    await w.findAll('.grid-footer-btn')[1]!.trigger('click');
    expect(store.rows).toBe(2);
    expect(w.findAll('.grid-footer-btn')[0]!.attributes('disabled')).toBeUndefined();
  });

  it('removes a row (clamped at 1)', async () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setLayout(3, 2);
    const w = mount(GridFooter);
    await w.findAll('.grid-footer-btn')[0]!.trigger('click');
    expect(store.rows).toBe(2);
    expect(store.cols).toBe(2); // cols untouched
  });

  it('disables add at the 10-row maximum', () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setLayout(10, 1);
    const w = mount(GridFooter);
    expect(w.findAll('.grid-footer-btn')[1]!.attributes('disabled')).toBeDefined();
  });

  it('add/remove clicks keep rows within 1..10 via setLayout clamps', async () => {
    const store = useDashboardStore({ apiBase: '/api', origName: '' });
    store.setLayout(9, 1);
    const w = mount(GridFooter);
    await w.findAll('.grid-footer-btn')[1]!.trigger('click'); // 10
    await w.findAll('.grid-footer-btn')[1]!.trigger('click'); // still 10 (button disabled)
    expect(store.rows).toBe(10);
  });
});
