/**
 * IME composition guard.
 *
 * While a CJK input method is composing, Enter commits the highlighted
 * candidate; it is not a request to submit, search, add or select. Any
 * Enter handler on a free-text field must ignore that keypress, or typing
 * 你好 and accepting the candidate fires the action on half a word.
 *
 * `isComposing` is the standard signal. Safari (and older Chromium) report
 * `isComposing: false` on the keydown that *ends* composition, but still
 * set `keyCode` to 229, so both are checked.
 */
export function isImeComposing(event: KeyboardEvent): boolean {
  return event.isComposing || event.keyCode === 229;
}

/**
 * Wrap an Enter handler so it never runs during IME composition.
 * Use in templates as `@keydown.enter.prevent="onEnter(handler)"`-style
 * call sites, or call isImeComposing() directly in a script handler.
 */
export function onEnterOutsideIme<E extends KeyboardEvent>(
  handler: (event: E) => void,
): (event: E) => void {
  return (event: E) => {
    if (isImeComposing(event)) return;
    handler(event);
  };
}
