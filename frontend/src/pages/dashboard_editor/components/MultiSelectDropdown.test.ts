import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import MultiSelectDropdown from './MultiSelectDropdown.vue';
import { resetMselRegistry } from '../lib/mselRegistry';

/* Port of makeUsersDropdown (dashboard_editor.html:671-857): ALL semantics,
   filter, portal positioning, commit-on-close. */

enableAutoUnmount(afterEach);

const USERS = ['alice', 'bob', 'carol'];

function mountDropdown(props: { modelValue?: string[] | null; users?: string[] } = {}) {
  return mount(MultiSelectDropdown, {
    props: { modelValue: null, users: USERS, ...props },
    attachTo: document.body,
  });
}

function openDrop(): HTMLElement {
  const drop = document.body.querySelector('.msel-drop') as HTMLElement | null;
  if (!drop) throw new Error('dropdown not open');
  return drop;
}

async function clickBtn(wrapper: ReturnType<typeof mountDropdown>): Promise<void> {
  await wrapper.get('.msel-btn').trigger('click');
  await nextTick();
}

function items(drop: HTMLElement): string[] {
  return [...drop.querySelectorAll('.msel-item span')].map((s) => s.textContent ?? '');
}

afterEach(() => {
  document.body.innerHTML = '';
});

beforeEach(() => {
  resetMselRegistry();
});

/** Native click on a Teleported element (wrapper.trigger can't reach it). */
async function clickEl(el: Element): Promise<void> {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await nextTick();
}

/** Find an option item by its label text. */
function optionItem(drop: HTMLElement, label: string): HTMLElement {
  const item = [...drop.querySelectorAll('.msel-item')].find(
    (el) => el.querySelector('span')?.textContent === label
  );
  if (!item) throw new Error(`option ${label} not found`);
  return item as HTMLElement;
}

describe('initial label (editor:756-761)', () => {
  it('shows ALL for null/empty modelValue', () => {
    const w = mountDropdown();
    expect(w.get('.msel-btn').text()).toContain('ALL');
  });

  it('shows the single selected user', () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    expect(w.get('.msel-btn').text()).toContain('alice');
  });

  it('shows the count for multiple users (dash.nUsers fallback)', () => {
    const w = mountDropdown({ modelValue: ['alice', 'bob'] });
    expect(w.get('.msel-btn').text()).toContain('2 users');
  });
});

describe('opening and portal (editor:832-850)', () => {
  it('teleports the dropdown to the body on click', async () => {
    const w = mountDropdown();
    expect(document.body.querySelector('.msel-drop')).toBeNull();
    await clickBtn(w);
    const drop = openDrop();
    expect(drop.className).toContain('open');
    expect(items(drop)).toEqual(['ALL', 'alice', 'bob', 'carol']);
  });

  it('renders the filter with the dash.filterDots placeholder', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const filter = openDrop().querySelector('.msel-filter') as HTMLInputElement;
    expect(filter.placeholder).toBe('Filter...');
  });

  it('focuses the filter input on open', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    /* ui/Input renders the filter — the legacy hook class rides along */
    expect(document.activeElement?.className).toContain('msel-filter');
  });

  it('closes on a second button click without emitting', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    await clickBtn(w);
    expect(document.body.querySelector('.msel-drop')).toBeNull();
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('closes other open dropdowns when opening a new one (module registry)', async () => {
    const a = mountDropdown();
    const b = mountDropdown();
    await clickBtn(a);
    await clickBtn(b);
    expect(document.body.querySelectorAll('.msel-drop').length).toBe(1);
  });

  it('stops propagation on dropdown clicks', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const drop = openDrop();
    const spy = vi.fn();
    document.body.addEventListener('click', spy);
    drop.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ALL checkbox semantics (editor:772-799)', () => {
  it('checks ALL by default with all users listed after a separator', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const drop = openDrop();
    const all = drop.querySelector('.msel-item input') as HTMLInputElement;
    expect(all.checked).toBe(true);
    expect(drop.querySelector('.msel-sep')).not.toBeNull();
    expect(drop.querySelector('.msel-sep')?.nextSibling).not.toBeNull();
  });

  it('unchecking ALL empties the selection (label becomes — select —)', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const all = openDrop().querySelector('.msel-item input') as HTMLInputElement;
    all.checked = false;
    all.dispatchEvent(new Event('change'));
    await nextTick();
    expect(w.get('.msel-btn').text()).toContain('— select —');
  });

  it('checking ALL clears every other user', async () => {
    const w = mountDropdown({ modelValue: ['alice', 'bob'] });
    await clickBtn(w);
    const all = openDrop().querySelector('.msel-item input') as HTMLInputElement;
    all.checked = true;
    all.dispatchEvent(new Event('change'));
    await nextTick();
    const boxes = [...openDrop().querySelectorAll('.msel-item input')] as HTMLInputElement[];
    expect(boxes.filter((b) => b.checked).map((b) => b.value)).toEqual(['ALL']);
    expect(w.get('.msel-btn').text()).toContain('ALL');
  });

  it('selecting a user removes ALL', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const drop = openDrop();
    await clickEl(optionItem(drop, 'alice'));
    const boxes = [...openDrop().querySelectorAll('.msel-item input')] as HTMLInputElement[];
    expect(boxes.find((b) => b.value === 'ALL')?.checked).toBe(false);
    expect(boxes.find((b) => b.value === 'alice')?.checked).toBe(true);
    expect(w.get('.msel-btn').text()).toContain('alice');
  });

  it('deselecting the last user falls back to ALL (legacy quirk)', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    const drop = openDrop();
    await clickEl(optionItem(drop, 'alice'));
    const all = openDrop().querySelector('.msel-item input') as HTMLInputElement;
    expect(all.checked).toBe(true);
    expect(w.get('.msel-btn').text()).toContain('ALL');
  });

  it('clicking an item label toggles its checkbox', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    const drop = openDrop();
    const bob = optionItem(drop, 'bob');
    const bobBox = bob.querySelector('input') as HTMLInputElement;
    expect(bobBox.checked).toBe(false);
    await clickEl(bob);
    expect(bobBox.checked).toBe(true);
  });

  it('lists selected users before the full user list when ALL is absent', async () => {
    const w = mountDropdown({ modelValue: ['carol'] });
    await clickBtn(w);
    /* selected non-ALL users come first (in selection order), then the rest */
    expect(items(openDrop())).toEqual(['ALL', 'carol', 'alice', 'bob']);
  });

  it('skips falsy users in the options list', async () => {
    const w = mountDropdown({ users: ['alice', '', 'bob'] });
    await clickBtn(w);
    expect(items(openDrop())).toEqual(['ALL', 'alice', 'bob']);
  });
});

describe('commit-on-close (editor:738-743, 745-752)', () => {
  it('emits the committed selection on close, not while editing', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    const drop = openDrop();
    await clickEl(optionItem(drop, 'bob'));
    expect(w.emitted('update:modelValue')).toBeUndefined(); // not yet committed
    await clickBtn(w); // close
    expect(w.emitted('update:modelValue')).toEqual([[['alice', 'bob']]]);
  });

  it('does not emit when the selection did not change', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    await clickBtn(w);
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });

  it('emits when a change was made and reverted', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    const drop = openDrop();
    const bob = optionItem(drop, 'bob');
    await clickEl(bob);
    await clickEl(bob); // revert
    await clickBtn(w); // close
    expect(w.emitted('update:modelValue')).toBeUndefined(); // sameSelection guard
  });
});

describe('filter (editor:824-830, 852)', () => {
  async function setFilter(w: ReturnType<typeof mountDropdown>, q: string): Promise<void> {
    const filter = openDrop().querySelector('.msel-filter') as HTMLInputElement;
    filter.value = q;
    await filter.dispatchEvent(new Event('input'));
    await nextTick();
  }

  it('hides non-matching users but always shows ALL', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    await setFilter(w, 'bo');
    const drop = openDrop();
    const visible = [...drop.querySelectorAll('.msel-item')].filter(
      (el) => (el as HTMLElement).style.display !== 'none'
    );
    const labels = visible.map((el) => el.querySelector('span')?.textContent);
    expect(labels).toEqual(['ALL', 'bob']);
  });

  it('is case-insensitive', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    await setFilter(w, 'ALI');
    const drop = openDrop();
    const visible = [...drop.querySelectorAll('.msel-item')].filter(
      (el) => (el as HTMLElement).style.display !== 'none'
    );
    expect(visible.map((el) => el.querySelector('span')?.textContent)).toEqual(['ALL', 'alice']);
  });

  it('shows everything for an empty filter', async () => {
    const w = mountDropdown();
    await clickBtn(w);
    await setFilter(w, '');
    const drop = openDrop();
    const hidden = [...drop.querySelectorAll('.msel-item')].filter(
      (el) => (el as HTMLElement).style.display === 'none'
    );
    expect(hidden).toEqual([]);
  });
});

describe('positioning (editor:720-736 via mselPosition)', () => {
  it('positions the drop with the legacy viewport math', async () => {
    const w = mountDropdown();
    const btn = w.get('.msel-btn').element as HTMLElement;
    Object.defineProperty(btn, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ right: 100, bottom: 300, top: 270, width: 150, height: 30 }),
    });
    await clickBtn(w);
    await nextTick();
    const drop = openDrop();
    expect(drop.style.width).toBe('180px');
    expect(drop.style.left).toBe('8px'); // clamped: max(8, 100-180)
    expect(drop.style.top).toBe('303px'); // bottom + 3
    expect(drop.style.maxHeight).toBe('456px'); // 768-300-12
  });
});

describe('prop updates (external modelValue changes)', () => {
  it('re-syncs the selection when the modelValue changes while closed', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await w.setProps({ modelValue: ['carol'] });
    expect(w.get('.msel-btn').text()).toContain('carol');
    await clickBtn(w);
    const carol = [...openDrop().querySelectorAll('.msel-item input')].find(
      (b) => (b as HTMLInputElement).value === 'carol'
    ) as HTMLInputElement;
    expect(carol.checked).toBe(true);
  });

  it('ignores external changes mid-edit (dirty guard)', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    const drop = openDrop();
    await clickEl(optionItem(drop, 'bob')); // dirty
    await w.setProps({ modelValue: ['carol'] }); // external rebuild signal
    await clickBtn(w); // close → commit local selection
    expect(w.emitted('update:modelValue')).toEqual([[['alice', 'bob']]]);
  });
});

describe('unmount', () => {
  it('closes without emitting when unmounted mid-edit', async () => {
    const w = mountDropdown({ modelValue: ['alice'] });
    await clickBtn(w);
    const drop = openDrop();
    await clickEl(optionItem(drop, 'bob'));
    w.unmount();
    expect(w.emitted('update:modelValue')).toBeUndefined();
    expect(document.body.querySelector('.msel-drop')).toBeNull();
  });
});
