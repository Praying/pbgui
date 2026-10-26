import type { Directive, DirectiveBinding } from 'vue';

/**
 * v-focus-trap — focus containment for dialogs that keep their own chrome.
 *
 * `ui/Modal` (reka-ui) already traps focus, restores it on close and locks
 * Tab inside the panel. Twenty-odd hand-written `role="dialog"` overlays
 * predate it and carry page-specific markup and styles, so migrating each
 * onto Modal would change their DOM and look. This directive adds just the
 * accessibility contract to those elements, with no markup change:
 *
 *   - on mount, remember the element that had focus and move focus into the
 *     dialog (first [autofocus] / first tabbable, else the dialog itself)
 *   - Tab / Shift+Tab wrap inside the dialog instead of escaping to the page
 *   - on unmount, return focus to where it was
 *
 * Usage: `<div role="dialog" v-focus-trap>`. `v-focus-trap="false"` turns it
 * off (e.g. an always-mounted dialog toggled with v-show).
 *
 * Escape is deliberately not handled here: every dialog already owns its own
 * close semantics (some must not close on Escape at all).
 */
const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface TrapState {
  previous: HTMLElement | null;
  onKeydown: (event: KeyboardEvent) => void;
}

const states = new WeakMap<HTMLElement, TrapState>();
const activeTraps: HTMLElement[] = [];

function isVisible(el: HTMLElement): boolean {
  // Attribute and computed-style checks only: layout-based tests
  // (offsetParent, getClientRects) are wrong for position:fixed content and
  // report "hidden" for everything in an un-laid-out jsdom tree.
  if (el.closest('[hidden], [aria-hidden="true"]')) return false;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function tabbableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(isVisible);
}

function enabled(binding: DirectiveBinding<boolean | undefined>): boolean {
  return binding.value !== false;
}

function attach(el: HTMLElement): void {
  if (states.has(el)) return;
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  activeTraps.push(el);

  const onKeydown = (event: KeyboardEvent): void => {
    const activeTrap = activeTraps.filter((element) => element.isConnected && isVisible(element)).at(-1);
    if (event.key !== 'Tab' || event.defaultPrevented || activeTrap !== el) return;
    const focusedDialog = document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLElement>('[role="dialog"], dialog[open]')
      : null;
    if (focusedDialog && !el.contains(focusedDialog) && !activeTraps.includes(focusedDialog)) return;
    const items = tabbableWithin(el);
    if (items.length === 0) {
      event.preventDefault();
      el.focus();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === el || !el.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !el.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  document.addEventListener('keydown', onKeydown);
  states.set(el, { previous, onKeydown });

  // A dialog must be focusable to receive focus when it has no controls.
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');

  // Defer one frame so v-if content and autofocus inputs are in the DOM, and
  // never steal focus the dialog already placed inside itself.
  queueMicrotask(() => {
    if (!states.has(el) || !el.isConnected || activeTraps.at(-1) !== el || el.contains(document.activeElement)) return;
    const target = el.querySelector<HTMLElement>('[autofocus]') ?? tabbableWithin(el)[0] ?? el;
    target.focus({ preventScroll: true });
  });
}

function detach(el: HTMLElement): void {
  const state = states.get(el);
  if (!state) return;
  document.removeEventListener('keydown', state.onKeydown);
  states.delete(el);
  const trapIndex = activeTraps.indexOf(el);
  if (trapIndex >= 0) activeTraps.splice(trapIndex, 1);
  // Only restore focus if it is still inside the dialog or lost to <body>;
  // if the page already moved focus somewhere meaningful, leave it.
  const active = document.activeElement;
  const lost = !active || active === document.body || el.contains(active);
  if (lost && state.previous && state.previous.isConnected) {
    state.previous.focus({ preventScroll: true });
  }
}

export const vFocusTrap: Directive<HTMLElement, boolean | undefined> = {
  mounted(el, binding) {
    if (enabled(binding)) attach(el);
  },
  updated(el, binding) {
    if (enabled(binding)) attach(el);
    else detach(el);
  },
  beforeUnmount(el) {
    detach(el);
  },
};
