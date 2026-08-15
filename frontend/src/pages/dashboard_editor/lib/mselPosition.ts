/**
 * Dropdown positioning math — byte-for-byte port of
 * makeUsersDropdown.positionDrop (dashboard_editor.html:720-736), extracted
 * from the component so the viewport math is unit-testable.
 */

export interface MselRect {
  right: number;
  bottom: number;
  top: number;
  width: number;
}

export interface MselWindow {
  innerWidth: number;
  innerHeight: number;
}

export interface MselPositionInput {
  btnRect: MselRect;
  win: MselWindow;
  /** The filter input's rendered height (legacy `filter.offsetHeight`). */
  filterHeight: number;
}

export interface MselPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  listMaxHeight: number;
  openAbove: boolean;
}

export function mselPosition(input: MselPositionInput): MselPosition {
  const { btnRect, win, filterHeight } = input;
  const width = Math.max(180, btnRect.width);
  const left = Math.min(Math.max(8, btnRect.right - width), Math.max(8, win.innerWidth - width - 8));
  const below = win.innerHeight - btnRect.bottom - 12;
  const above = btnRect.top - 12;
  const openAbove = below < 180 && above > below;
  const maxHeight = Math.max(140, openAbove ? above : below);
  const top = openAbove ? Math.max(8, btnRect.top - maxHeight - 3) : btnRect.bottom + 3;
  return {
    left,
    top,
    width,
    maxHeight,
    listMaxHeight: Math.max(120, maxHeight - filterHeight - 8),
    openAbove,
  };
}
