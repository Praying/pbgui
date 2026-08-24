import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import DashboardList from './DashboardList.vue';

function mountList(props: {
  dashboards?: string[];
  names?: string[];
  current?: string;
  selected?: string[];
  editMode?: boolean;
} = {}) {
  return mount(DashboardList, {
    props: {
      dashboards: ['a', 'B', 'C'],
      names: ['a', 'B', 'C'],
      current: '',
      selected: [],
      editMode: false,
      ...props,
    },
    global: { plugins: [createI18n('en')] },
  });
}

function item(wrapper: ReturnType<typeof mountList>, name: string) {
  return wrapper.find(`.sb-item[data-name="${name}"]`);
}

describe('DashboardList', () => {
  it('shows the noDashboards message when the list is empty', () => {
    const wrapper = mountList({ dashboards: [], names: [] });

    expect(wrapper.find('.sb-empty').text()).toBe('No dashboards yet');
    expect(wrapper.find('.sb-no-match').exists()).toBe(false);
  });

  it('shows the noMatch message when the filter removes every item', () => {
    const wrapper = mountList({ names: [] });

    expect(wrapper.find('.sb-no-match').text()).toBe('No match');
    expect(wrapper.find('.sb-empty').exists()).toBe(false);
  });

  it('renders one item per name with active and selected classes', () => {
    const wrapper = mountList({ current: 'B', selected: ['a', 'B'] });

    expect(wrapper.findAll('.sb-item')).toHaveLength(3);
    expect(item(wrapper, 'B').classes()).toContain('active');
    expect(item(wrapper, 'a').classes()).not.toContain('active');
    expect(item(wrapper, 'a').classes()).toContain('selected');
    expect(item(wrapper, 'B').classes()).toContain('selected');
    expect(item(wrapper, 'C').classes()).not.toContain('selected');
  });

  it('exposes selection state on each dashboard button', () => {
    const wrapper = mountList({ selected: ['a'] });

    const first = item(wrapper, 'a');
    expect(first.attributes('aria-pressed')).toBe('true');
    expect(first.element.tagName).toBe('BUTTON');
    expect(item(wrapper, 'B').attributes('aria-pressed')).toBe('false');
  });

  it('shows the edit icon only on the current dashboard outside edit mode', () => {
    const wrapper = mountList({ current: 'B' });

    const editButton = wrapper.find('.sb-item-row[data-name="B"] .sb-item-edit-icon');
    expect(editButton.exists()).toBe(true);
    expect(editButton.attributes('title')).toBe('Edit');
    expect(wrapper.find('.sb-item-row[data-name="a"] .sb-item-edit-icon').exists()).toBe(false);
  });

  it('hides the edit icon in edit mode', () => {
    const wrapper = mountList({ current: 'B', editMode: true });

    expect(wrapper.find('.sb-item-row[data-name="B"] .sb-item-edit-icon').exists()).toBe(false);
  });

  it('emits select when an item is clicked', async () => {
    const wrapper = mountList();

    await item(wrapper, 'a').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['a']]);
    expect(wrapper.emitted('toggle')).toBeUndefined();
  });

  it('emits toggle on ctrl-click', async () => {
    const wrapper = mountList();

    await item(wrapper, 'B').trigger('click', { ctrlKey: true });

    expect(wrapper.emitted('toggle')).toEqual([['B']]);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('emits edit when the edit icon is clicked', async () => {
    const wrapper = mountList({ current: 'B' });

    await wrapper.find('.sb-item-row[data-name="B"] .sb-item-edit-icon').trigger('click');

    expect(wrapper.emitted('edit')).toHaveLength(1);
    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('emits select on Enter and toggle on Space', async () => {
    const wrapper = mountList();

    await item(wrapper, 'a').trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('select')).toEqual([['a']]);

    await item(wrapper, 'B').trigger('keydown', { key: ' ' });
    expect(wrapper.emitted('toggle')).toEqual([['B']]);
  });

  describe('drag selection', () => {
    let fromPointMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // jsdom has no elementFromPoint at all — stub it directly.
      fromPointMock = vi.fn(() => null);
      (document as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint =
        fromPointMock;
    });

    afterEach(() => {
      delete (document as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint;
    });

    function startDrag(wrapper: ReturnType<typeof mountList>, name: string) {
      return item(wrapper, name).trigger('mousedown', { button: 0, clientX: 10, clientY: 10 });
    }

    function move(x: number, y: number) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    }

    function up() {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }

    it('emits select for the pressed item when released without moving past 5px', async () => {
      const wrapper = mountList();

      await startDrag(wrapper, 'a');
      await move(12, 11); // 2px — below the legacy 5px threshold
      up();

      expect(wrapper.emitted('select')).toEqual([['a']]);
      expect(wrapper.emitted('set-selected')).toBeUndefined();
    });

    it('toggles the start item to add mode once past the 5px threshold', async () => {
      const wrapper = mountList(); // 'a' not selected → drag mode 'add'

      await startDrag(wrapper, 'a');
      await move(20, 10);
      up();

      expect(wrapper.emitted('set-selected')).toEqual([['a', true]]);
      expect(wrapper.emitted('select')).toBeUndefined();
    });

    it('toggles the start item to remove mode when it was selected', async () => {
      const wrapper = mountList({ selected: ['a'] });

      await startDrag(wrapper, 'a');
      await move(20, 10);
      up();

      expect(wrapper.emitted('set-selected')).toEqual([['a', false]]);
    });

    it('applies the drag mode to items under the cursor', async () => {
      const wrapper = mountList({ selected: ['a'] });
      const listWrap = wrapper.find('#sidebar-list-wrap').element as HTMLElement;
      const itemB = item(wrapper, 'B').element as HTMLElement;
      // a is selected → drag mode 'remove'; hovering B deselects it
      fromPointMock.mockReturnValue(itemB);
      vi.spyOn(listWrap, 'contains').mockReturnValue(true);

      await startDrag(wrapper, 'a');
      await move(20, 10);
      up();

      expect(wrapper.emitted('set-selected')).toEqual([
        ['a', false],
        ['B', false],
      ]);
    });

    it('suppresses the click that follows a drag mouseup', async () => {
      vi.useFakeTimers();
      try {
        const wrapper = mountList();

        await startDrag(wrapper, 'a');
        await move(20, 10);
        up();
        await item(wrapper, 'a').trigger('click');
        expect(wrapper.emitted('select')).toBeUndefined();

        vi.advanceTimersByTime(0);
        await item(wrapper, 'a').trigger('click');
        expect(wrapper.emitted('select')).toEqual([['a']]);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
