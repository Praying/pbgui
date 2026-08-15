import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import EditorHeader from './EditorHeader.vue';
import { resetDashboardStore, useDashboardStore } from '../stores/dashboardStore';

/* Port of the legacy editor header (dashboard_editor.html:458-479, 2516-2523):
   the name field with trim-on-input + empty class, the layout picker, the
   status badge, and the widget palette (not built in view mode, editor:2690). */

function mountHeader(
  props: { msg?: string; cls?: string; configRevision?: number } = {}
): ReturnType<typeof mount> {
  return mount(EditorHeader, {
    props: { msg: props.msg ?? '', cls: props.cls ?? '', configRevision: props.configRevision ?? 0 },
    global: { plugins: [createI18n('en')] },
  });
}

beforeEach(() => {
  resetDashboardStore();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EditorHeader shell markup (editor:460-478)', () => {
  it('renders the legacy header with name field, picker, status and palette', () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    const wrapper = mountHeader({ msg: 'saved', cls: 'saved' });

    expect(wrapper.find('.editor-header').exists()).toBe(true);
    expect(wrapper.find('.hdr-left').exists()).toBe(true);
    expect(wrapper.find('.hdr-right').exists()).toBe(true);
    expect(wrapper.find('.hdr-field label').text()).toBe('Dashboard Name');
    const input = wrapper.find('#hdr-name');
    expect(input.attributes('type')).toBe('text');
    expect(input.attributes('maxlength')).toBe('32');
    expect(input.attributes('placeholder')).toBe('Enter name...');
    expect(wrapper.find('.layout-picker').exists()).toBe(true);
    expect(wrapper.find('#status').text()).toBe('saved');
    expect(wrapper.find('#widget-palette').exists()).toBe(true);
  });
});

describe('name field (editor:2518-2523)', () => {
  it('shows the store name and updates it trimmed on input', async () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    const wrapper = mountHeader();
    const input = wrapper.find('#hdr-name');
    expect((input.element as HTMLInputElement).value).toBe('MyDash');

    await input.setValue('  Renamed  ');
    expect(useDashboardStore().state.name).toBe('Renamed');
    expect(input.classes()).not.toContain('empty');
  });

  it('adds the empty class when the trimmed name is empty', async () => {
    useDashboardStore({ apiBase: '/api', origName: '' });
    const wrapper = mountHeader();
    const input = wrapper.find('#hdr-name');
    expect(input.classes()).toContain('empty');

    await input.setValue('   ');
    expect(input.classes()).toContain('empty');

    await input.setValue('X');
    expect(input.classes()).not.toContain('empty');
  });

  it('keeps the raw input text while typing (legacy kept the DOM value)', async () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    const wrapper = mountHeader();
    const input = wrapper.find('#hdr-name');
    await input.setValue('Trailing ');
    expect((input.element as HTMLInputElement).value).toBe('Trailing ');
    expect(useDashboardStore().state.name).toBe('Trailing');
  });

  it('rewrites the input only when App bumps the config revision (editor:2688)', async () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    const wrapper = mountHeader();
    /* a plain store change does NOT rewrite the input — legacy only rewrote
       the DOM value at init */
    useDashboardStore().loadConfig({ name: 'FromConfig', rows: 1, cols: 1 });
    await wrapper.vm.$nextTick();
    expect((wrapper.find('#hdr-name').element as HTMLInputElement).value).toBe('MyDash');

    /* App bumps the revision after its init loadConfig → the input re-syncs */
    await wrapper.setProps({ configRevision: 1 });
    await wrapper.vm.$nextTick();
    expect((wrapper.find('#hdr-name').element as HTMLInputElement).value).toBe('FromConfig');
  });
});

describe('mode chrome (editor:2690, 315-328)', () => {
  it('does not build the palette in view mode', () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash', viewOnly: true });
    const wrapper = mountHeader();
    expect(wrapper.find('#widget-palette').exists()).toBe(false);
  });

  it('builds the palette in standalone (edit) mode', () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash', standalone: true });
    const wrapper = mountHeader();
    expect(wrapper.find('#widget-palette').exists()).toBe(true);
  });
});

describe('status badge (editor:469, 541-544)', () => {
  it('passes the status text and class through', () => {
    useDashboardStore({ apiBase: '/api', origName: 'MyDash' });
    const wrapper = mountHeader({ msg: 'error', cls: 'error' });
    expect(wrapper.find('#status').classes()).toEqual(['status', 'error']);
  });
});
