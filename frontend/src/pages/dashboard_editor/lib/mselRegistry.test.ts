import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAllMselDropdowns,
  closeMselDropdown,
  isMselOpen,
  openMselDropdown,
  resetMselRegistry,
} from './mselRegistry';

/* Port of closeAllUsersDropdowns (editor:665-669): only one dropdown open
   at a time, opening one closes the others. */

beforeEach(() => {
  resetMselRegistry();
});

describe('mselRegistry', () => {
  it('opening a dropdown closes the previously open one', () => {
    const closeA = vi.fn();
    openMselDropdown(closeA);
    openMselDropdown(vi.fn());
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('closeAll closes whatever is open and clears the registry', () => {
    const closeA = vi.fn();
    openMselDropdown(closeA);
    closeAllMselDropdowns();
    expect(closeA).toHaveBeenCalledTimes(1);
    /* closing again is a no-op — no double close */
    closeAllMselDropdowns();
    expect(closeA).toHaveBeenCalledTimes(1);
  });

  it('closeMselDropdown only unregisters its own instance', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    openMselDropdown(closeA);
    closeMselDropdown(closeB); // not the open one → registry intact
    openMselDropdown(closeB); // B opens → A closes
    expect(closeA).toHaveBeenCalledTimes(1);
    closeMselDropdown(closeB); // B unregisters itself
    openMselDropdown(closeA); // nothing open → B is NOT closed again
    expect(closeB).toHaveBeenCalledTimes(0);
  });

  it('opening twice in a row closes the first registration', () => {
    const closeA = vi.fn();
    const closeA2 = vi.fn();
    openMselDropdown(closeA);
    openMselDropdown(closeA2);
    expect(closeA).toHaveBeenCalledTimes(1);
  });
});

/* D-editor-3 handoff: isMselOpen is the WS-orchestration guard — the Vue
   replacement for the legacy document.querySelector('.msel-drop.open') check
   (dashboard_editor.html:2749-2826, 2761). */

describe('isMselOpen (legacy .msel-drop.open query)', () => {
  it('reports closed when nothing is registered', () => {
    expect(isMselOpen()).toBe(false);
  });

  it('reports open while a dropdown is registered', () => {
    openMselDropdown(vi.fn());
    expect(isMselOpen()).toBe(true);
  });

  it('reports closed again after closeAll', () => {
    openMselDropdown(vi.fn());
    closeAllMselDropdowns();
    expect(isMselOpen()).toBe(false);
  });

  it('reports closed after the owning instance unregisters', () => {
    const close = vi.fn();
    openMselDropdown(close);
    closeMselDropdown(close);
    expect(isMselOpen()).toBe(false);
  });

  it('stays open when a different instance tries to unregister', () => {
    openMselDropdown(vi.fn());
    closeMselDropdown(vi.fn());
    expect(isMselOpen()).toBe(true);
  });
});
