import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { createI18n } from '@/shared/i18n';
import MultiSelect from './MultiSelect.vue';

enableAutoUnmount(afterEach);

interface Props {
  options?: string[];
  selected?: string[];
  allRow?: boolean;
  countLabel?: string;
  uid?: string;
}

// Mounts are attached to the document body: jsdom only resolves focus and
// getComputedStyle (v-show) reliably for connected elements.
const hosts: HTMLElement[] = [];

function mountSelect(props: Props = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  hosts.push(host);
  return mount(MultiSelect, {
    props: {
      options: ['Alpha', 'Beta', 'Gamma'],
      selected: [],
      allRow: false,
      countLabel: 'dash.nTemplates',
      uid: 'msel1',
      ...props,
    },
    attachTo: host,
    global: { plugins: [createI18n('en')] },
  });
}

type Wrapper = ReturnType<typeof mountSelect>;

function item(wrapper: Wrapper, value: string) {
  return wrapper.find(`.msel-item[data-value="${value}"]`);
}

function button(wrapper: Wrapper) {
  return wrapper.find('.msel-btn');
}

function filter(wrapper: Wrapper) {
  return wrapper.find('.msel-filter');
}

function drop(wrapper: Wrapper) {
  return wrapper.find('.msel-drop');
}

function open(wrapper: Wrapper) {
  return button(wrapper).trigger('click');
}

function lastEmitted(wrapper: Wrapper): string[] | undefined {
  const calls = wrapper.emitted('update:selected');
  const last = calls?.[calls.length - 1];
  return last?.[0] as string[] | undefined;
}

function emittedAll(wrapper: Wrapper): string[][] {
  return (wrapper.emitted('update:selected') ?? []).map((call) => call[0] as string[]);
}

let fromPointMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom has no elementFromPoint at all — stub it directly.
  fromPointMock = vi.fn(() => null);
  (document as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint =
    fromPointMock;
});

afterEach(() => {
  delete (document as { elementFromPoint?: (x: number, y: number) => Element | null }).elementFromPoint;
  for (const host of hosts.splice(0)) host.remove();
});

function startDrag(wrapper: Wrapper, value: string) {
  return item(wrapper, value).trigger('mousedown', { button: 0, clientX: 10, clientY: 10 });
}

function move(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
}

function up() {
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
}

function allowElement(el: HTMLElement) {
  const listEl = document.querySelector('.msel-list');
  if (listEl) vi.spyOn(listEl, 'contains').mockReturnValue(true);
  fromPointMock.mockReturnValue(el);
}

describe('button label', () => {
  it('shows the none label when nothing is selected', () => {
    const wrapper = mountSelect();

    expect(button(wrapper).text()).toContain('— none —');
  });

  it('shows the name when exactly one is selected', () => {
    const wrapper = mountSelect({ selected: ['Alpha'] });

    expect(button(wrapper).text()).toContain('Alpha');
  });

  it('shows the template count label for multiple selections', () => {
    const wrapper = mountSelect({ selected: ['Alpha', 'Beta'] });

    expect(button(wrapper).text()).toContain('2 templates');
  });

  it('shows ALL when the users variant has ALL selected', () => {
    const wrapper = mountSelect({ allRow: true, selected: ['ALL'], options: ['alice', 'bob'] });

    expect(button(wrapper).text()).toContain('ALL');
  });

  it('shows the user count label for multiple users', () => {
    const wrapper = mountSelect({
      allRow: true,
      countLabel: 'dash.nUsers',
      selected: ['alice', 'bob'],
      options: ['alice', 'bob'],
    });

    expect(button(wrapper).text()).toContain('2 users');
  });
});

describe('open state', () => {
  it('opens the dropdown on button click and closes it on document click', async () => {
    const wrapper = mountSelect();

    await open(wrapper);
    expect(drop(wrapper).classes()).toContain('open');

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(drop(wrapper).classes()).not.toContain('open');
  });

  it('resets and focuses the filter input when opened', async () => {
    const wrapper = mountSelect();

    await open(wrapper);
    await filter(wrapper).setValue('zzz');
    await open(wrapper); // closes
    await open(wrapper); // reopens
    await wrapper.vm.$nextTick();

    expect((filter(wrapper).element as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(filter(wrapper).element);
  });

  it('opening one instance closes the other open dropdown', async () => {
    const first = mountSelect({ uid: 'msel1' });
    const second = mountSelect({ uid: 'msel2' });

    await open(first);
    expect(drop(first).classes()).toContain('open');

    await open(second);

    expect(drop(first).classes()).not.toContain('open');
    expect(drop(second).classes()).toContain('open');
  });
});

describe('filter', () => {
  it('hides items not matching the lowercase substring filter', async () => {
    const wrapper = mountSelect();
    await open(wrapper);

    await filter(wrapper).setValue('bet');

    expect(item(wrapper, 'Beta').isVisible()).toBe(true);
    expect(item(wrapper, 'Alpha').isVisible()).toBe(false);
    expect(item(wrapper, 'Gamma').isVisible()).toBe(false);
  });

  it('keeps the ALL row visible for any filter in the users variant', async () => {
    const wrapper = mountSelect({ allRow: true, options: ['alice', 'bob'] });
    await open(wrapper);

    await filter(wrapper).setValue('xyz');

    expect(item(wrapper, 'ALL').isVisible()).toBe(true);
    expect(item(wrapper, 'alice').isVisible()).toBe(false);
  });
});

describe('options rendering', () => {
  it('prepends the ALL row with a separator in the users variant', () => {
    const wrapper = mountSelect({ allRow: true, options: ['alice'] });

    const items = wrapper.findAll('.msel-item').map((el) => el.attributes('data-value'));
    expect(items).toEqual(['ALL', 'alice']);
    expect(wrapper.find('.msel-sep').exists()).toBe(true);
    expect(item(wrapper, 'ALL').element.nextElementSibling?.className).toBe('msel-sep');
  });

  it('sets aria-selected on items', () => {
    const wrapper = mountSelect({ selected: ['Alpha'] });

    expect(item(wrapper, 'Alpha').attributes('aria-selected')).toBe('true');
    expect(item(wrapper, 'Beta').attributes('aria-selected')).toBe('false');
  });
});

describe('click toggle', () => {
  it('toggles an item on press + release without movement', async () => {
    const wrapper = mountSelect();

    await startDrag(wrapper, 'Alpha');
    up();

    expect(lastEmitted(wrapper)).toEqual(['Alpha']);

    await wrapper.setProps({ selected: ['Alpha'] });
    await startDrag(wrapper, 'Alpha');
    up();

    expect(emittedAll(wrapper)[1]).toEqual([]);
  });

  it('ignores non-left-button presses', async () => {
    const wrapper = mountSelect();

    await item(wrapper, 'Alpha').trigger('mousedown', { button: 1, clientX: 10, clientY: 10 });
    up();

    expect(wrapper.emitted('update:selected')).toBeUndefined();
  });

  it('still toggles when released within the 5px threshold', async () => {
    const wrapper = mountSelect();

    await startDrag(wrapper, 'Alpha');
    await move(12, 11); // 2px — below the legacy 5px threshold
    up();

    expect(lastEmitted(wrapper)).toEqual(['Alpha']);
  });
});

describe('drag selection', () => {
  it('paints add mode over the start item and items under the cursor', async () => {
    const wrapper = mountSelect();
    const betaEl = item(wrapper, 'Beta').element as HTMLElement;

    allowElement(betaEl);
    await startDrag(wrapper, 'Alpha');
    await move(20, 10);
    up();

    expect(emittedAll(wrapper)).toEqual([['Alpha'], ['Alpha', 'Beta']]);
  });

  it('paints remove mode when the start item was selected', async () => {
    const wrapper = mountSelect({ selected: ['Alpha', 'Beta'] });
    const betaEl = item(wrapper, 'Beta').element as HTMLElement;

    allowElement(betaEl);
    await startDrag(wrapper, 'Alpha');
    await move(20, 10);
    up();

    expect(emittedAll(wrapper)).toEqual([['Beta'], []]);
  });

  it('resets the users variant to ALL when a drag empties the selection', async () => {
    const wrapper = mountSelect({ allRow: true, selected: ['alice'], options: ['alice'] });

    await startDrag(wrapper, 'alice');
    await move(20, 10);
    up();

    expect(emittedAll(wrapper)).toEqual([[], ['ALL']]);
  });
});

describe('users ALL semantics', () => {
  it('replaces ALL when a user is selected', async () => {
    const wrapper = mountSelect({ allRow: true, selected: ['ALL'], options: ['alice', 'bob'] });

    await startDrag(wrapper, 'bob');
    up();

    expect(lastEmitted(wrapper)).toEqual(['bob']);
  });

  it('resets to ALL when ALL itself is toggled', async () => {
    const wrapper = mountSelect({ allRow: true, selected: ['alice'], options: ['alice', 'bob'] });

    await startDrag(wrapper, 'ALL');
    up();

    expect(lastEmitted(wrapper)).toEqual(['ALL']);
  });

  it('keeps ALL when the last selected user is deselected by click', async () => {
    const wrapper = mountSelect({ allRow: true, selected: ['alice'], options: ['alice'] });

    await startDrag(wrapper, 'alice');
    up();

    expect(lastEmitted(wrapper)).toEqual(['ALL']);
  });

  it('lets the template variant select nothing', async () => {
    const wrapper = mountSelect({ selected: ['Alpha'] });

    await startDrag(wrapper, 'Alpha');
    up();

    expect(lastEmitted(wrapper)).toEqual([]);
  });
});

describe('keyboard', () => {
  it('toggles an item on Enter and Space', async () => {
    const wrapper = mountSelect();

    await item(wrapper, 'Alpha').trigger('keydown', { key: 'Enter' });
    expect(lastEmitted(wrapper)).toEqual(['Alpha']);

    await wrapper.setProps({ selected: ['Alpha'] });
    await item(wrapper, 'Alpha').trigger('keydown', { key: ' ' });
    expect(emittedAll(wrapper)[1]).toEqual([]);
  });
});
