import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeAllMselDropdowns,
  closeMselDropdown,
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
