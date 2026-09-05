import { enableAutoUnmount, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from '.';

/* reka-ui Dialog portals the panel to document.body and wires Escape at the
   document level — assert through document.querySelector, not wrapper.find.
   NB: no body-clearing afterEach here; auto-unmount must run before any wipe
   (removeFragment crash — see memory note 2026-08-25). */
enableAutoUnmount(afterEach);

async function mountModal(open = true, props: Record<string, unknown> = {}) {
  const wrapper = mount(Modal, {
    props: { open, title: 'Delete instance', 'onUpdate:open': () => {}, ...props },
    attachTo: document.body,
    slots: { default: '<p class="modal-body-text">Are you sure?</p>' },
  });
  // reka's Presence paints the portal on the next frame in jsdom
  await new Promise((r) => setTimeout(r, 50));
  return wrapper;
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

describe('Modal', () => {
  it('renders an accessible dialog with the title and body slot', async () => {
    await mountModal();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.textContent).toContain('Delete instance');
    expect(dialog!.querySelector('.modal-body-text')?.textContent).toBe('Are you sure?');
  });

  it('keeps the modal body shrinkable so long content can scroll', async () => {
    await mountModal();

    const dialog = document.querySelector('[role="dialog"]');
    const body = dialog?.querySelector('.modal-body-text')?.parentElement;
    expect(dialog?.className).toContain('flex');
    expect(body?.className).toContain('min-h-0');
    expect(body?.className).toContain('flex-1');
    expect(body?.className).toContain('overflow-y-auto');
  });

  it('emits update:open(false) and cancel on Escape', async () => {
    const onUpdate = vi.fn();
    const onCancel = vi.fn();
    await mountModal(true, { 'onUpdate:open': onUpdate, onCancel });

    pressEscape();
    await new Promise((r) => setTimeout(r, 0));

    expect(onUpdate).toHaveBeenCalledWith(false);
    expect(onCancel).toHaveBeenCalled();
  });

  it('blocks Escape when not dismissable', async () => {
    const onUpdate = vi.fn();
    await mountModal(true, { dismissable: false, 'onUpdate:open': onUpdate });

    pressEscape();
    await new Promise((r) => setTimeout(r, 0));

    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('closes through the ✕ button', async () => {
    const onUpdate = vi.fn();
    await mountModal(true, { 'onUpdate:open': onUpdate });

    const closeButton = document.querySelector('[role="dialog"] button[aria-label="Close"]') as HTMLButtonElement;
    expect(closeButton).not.toBeNull();
    closeButton.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(onUpdate).toHaveBeenCalledWith(false);
  });

  it('hides the ✕ button and keeps the title slot override', async () => {
    await mountModal(true, { dismissable: false, title: 'ignored' , });
    // title prop falls through when no title slot given
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('ignored');
    expect(document.querySelector('[role="dialog"] button[aria-label="Close"]')).toBeNull();
  });

  it('renders nothing when closed', async () => {
    await mountModal(false);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
