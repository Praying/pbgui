import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import MultiselectTags from './MultiselectTags.vue';

function mountTags(props: { options?: string[]; modelValue?: string[]; filterable?: boolean; id?: string }) {
  return mount(MultiselectTags, {
    props: {
      options: props.options ?? [],
      modelValue: props.modelValue ?? [],
      ...(props.filterable === undefined ? {} : { filterable: props.filterable }),
      ...(props.id ? { id: props.id } : {}),
    },
    global: { plugins: [createI18n('en')] },
  });
}

function tagByValue(wrapper: ReturnType<typeof mountTags>, value: string) {
  const tag = wrapper.findAll('.tag').find((el) => el.attributes('data-value') === value);
  expect(tag, `tag ${value}`).toBeDefined();
  return tag!;
}

describe('MultiselectTags rendering (legacy renderPBDataSettings tag markup)', () => {
  it('renders one tag per option with active/inactive per modelValue', () => {
    const wrapper = mountTags({ options: ['alice', 'bob', 'carol'], modelValue: ['bob'] });

    const tags = wrapper.findAll('.tag');
    expect(tags).toHaveLength(3);
    expect(tagByValue(wrapper, 'alice').classes()).toContain('inactive');
    expect(tagByValue(wrapper, 'bob').classes()).not.toContain('inactive');
    expect(tagByValue(wrapper, 'carol').classes()).toContain('inactive');
  });

  it('shows the legacy filter input with the filterUsers placeholder', () => {
    const wrapper = mountTags({ options: ['alice'], modelValue: [] });

    const input = wrapper.find('input[type="text"]');
    expect(input.exists()).toBe(true);
    expect(input.attributes('placeholder')).toBe('Filter users…');
  });

  it('hides the filter input when filterable is false (legacy VPS hosts wrap)', () => {
    const wrapper = mountTags({ options: ['alice'], modelValue: [], filterable: false });

    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
    expect(wrapper.findAll('.tag')).toHaveLength(1);
  });

  it('applies the wrap id for legacy container addressing', () => {
    const wrapper = mountTags({ options: ['alice'], modelValue: [], id: 'pbdata-fetch-users' });

    expect(wrapper.find('.multiselect-wrap#pbdata-fetch-users').exists()).toBe(true);
  });

  it('renders the no-users empty state when options are empty', () => {
    const wrapper = mountTags({ options: [], modelValue: [] });

    expect(wrapper.findAll('.tag')).toHaveLength(0);
    expect(wrapper.find('.multiselect-empty').text()).toBe('No users found');
  });

  it('renders option text escaped instead of as HTML (legacy _esc)', () => {
    const wrapper = mountTags({ options: ['<img src=x>', 'a"b'], modelValue: [] });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(tagByValue(wrapper, '<img src=x>').text()).toBe('<img src=x>');
    expect(tagByValue(wrapper, 'a"b').text()).toBe('a"b');
  });

  it('supports custom placeholder and empty-state keys for reuse (Task 13 hosts)', () => {
    const wrapper = mount(MultiselectTags, {
      props: {
        options: [],
        modelValue: [],
        filterPlaceholderKey: 'sysmon.noVpsHosts',
        emptyKey: 'sysmon.noVpsHosts',
      },
      global: { plugins: [createI18n('en')] },
    });

    expect(wrapper.find('input[type="text"]').attributes('placeholder')).toBe('No VPS hosts configured');
    expect(wrapper.find('.multiselect-empty').text()).toBe('No VPS hosts configured');
  });
});

describe('MultiselectTags selection (legacy tag onclick toggle + save collection)', () => {
  it('emits update:modelValue with the clicked option added', async () => {
    const wrapper = mountTags({ options: ['alice', 'bob'], modelValue: ['bob'] });

    await tagByValue(wrapper, 'alice').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[['alice', 'bob']]]);
  });

  it('emits update:modelValue with the clicked option removed', async () => {
    const wrapper = mountTags({ options: ['alice', 'bob'], modelValue: ['alice'] });

    await tagByValue(wrapper, 'alice').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[[]]]);
  });

  it('emits the selection in options order regardless of click order (legacy DOM order)', async () => {
    const wrapper = mountTags({ options: ['alice', 'bob', 'carol'], modelValue: [] });

    await tagByValue(wrapper, 'carol').trigger('click');
    await wrapper.setProps({ modelValue: ['carol'] });
    await tagByValue(wrapper, 'alice').trigger('click');

    expect(wrapper.emitted('update:modelValue')![1]).toEqual([['alice', 'carol']]);
  });

  it('drops modelValue entries that are not rendered as tags (legacy querySelectorAll)', async () => {
    const wrapper = mountTags({ options: ['a', 'b'], modelValue: ['ghost', 'a'] });

    expect(wrapper.findAll('.tag')).toHaveLength(2); // ghost renders no tag
    await tagByValue(wrapper, 'b').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[['a', 'b']]]);
  });
});

describe('MultiselectTags filtering (legacy filterTags)', () => {
  // Legacy filterTags flips style.display; jsdom's getComputedStyle does not
  // recompute after v-show restores it, so assertions read the inline style.

  function displayOf(wrapper: ReturnType<typeof mountTags>, value: string): string {
    return (tagByValue(wrapper, value).element as HTMLElement).style.display;
  }

  it('hides tags that do not case-insensitively contain the trimmed query', async () => {
    const wrapper = mountTags({ options: ['Alice', 'BOB', 'charlie'], modelValue: ['BOB'] });

    await wrapper.find('input[type="text"]').setValue('  bob ');

    expect(displayOf(wrapper, 'Alice')).toBe('none');
    expect(displayOf(wrapper, 'BOB')).toBe('');
    expect(displayOf(wrapper, 'charlie')).toBe('none');
  });

  it('shows all tags again once the filter is cleared', async () => {
    const wrapper = mountTags({ options: ['Alice', 'BOB'], modelValue: [] });
    await wrapper.find('input[type="text"]').setValue('zz');
    expect(displayOf(wrapper, 'Alice')).toBe('none');

    await wrapper.find('input[type="text"]').setValue('');

    expect(displayOf(wrapper, 'Alice')).toBe('');
    expect(displayOf(wrapper, 'BOB')).toBe('');
  });

  it('keeps hidden tags selectable state untouched (filter is display-only)', async () => {
    const wrapper = mountTags({ options: ['Alice', 'BOB'], modelValue: ['Alice'] });
    await wrapper.find('input[type="text"]').setValue('bob');

    await tagByValue(wrapper, 'BOB').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[['Alice', 'BOB']]]);
  });
});
