import { DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';

/**
 * Test helpers for the shared ui/select (reka-ui listbox).
 *
 * Two jsdom realities drive this shape:
 *
 * 1. Pointer-open is unavailable: SelectTrigger opens on pointerdown only
 *    for a plain left click (`event.button === 0`), and jsdom cannot build
 *    a PointerEvent carrying `button`. Keyboard open (Enter/Space/Arrow)
 *    works, so tests open the listbox with a keydown on the trigger.
 * 2. After open, reka arms a one-shot document-level `pointerup` capture
 *    listener (SelectContentImpl — the browser guard against the opening
 *    click's own release instantly picking an item). It preventDefaults
 *    the FIRST pointerup it sees, so the option's own release handler
 *    early-returns. The sacrificial body dispatch below flushes that
 *    guard; the option's pointerup then selects.
 *
 * Options render into a body portal and are queried on document.body, but
 * SCOPED to the ui/ select content (`[data-slot="select-content"]`) — pages
 * may host other `[role="option"]` widgets (custom multiselects) that must
 * not pollute the match. When several listboxes are somehow open at once,
 * pass `contentIndex` to pick a specific one (DOM order).
 */
const CONTENT = '[data-slot="select-content"]';

export async function openSelect(wrapper: VueWrapper, triggerSelector: string): Promise<void> {
  await wrapper.get(triggerSelector).trigger('keydown', { key: 'Enter' });
  await nextTick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  document.body.dispatchEvent(new Event('pointerup', { bubbles: true, cancelable: true }));
  await nextTick();
}

/** All option elements of the currently open listbox (trimmed text match). */
export function selectOptionElements(contentIndex = 0): HTMLElement[] {
  const content = document.body.querySelectorAll(CONTENT)[contentIndex];
  if (!content) return [];
  return Array.from(content.querySelectorAll<HTMLElement>('[role="option"]'));
}

/** Text content of the currently open listbox, in DOM order. */
export function selectOptionTexts(contentIndex = 0): string[] {
  return selectOptionElements(contentIndex).map((el) => el.textContent?.trim() ?? '');
}

/** Open the listbox owned by `triggerSelector` and pick the option by text. */
export async function pickSelectOption(
  wrapper: VueWrapper,
  triggerSelector: string,
  optionText: string,
  contentIndex = 0,
): Promise<void> {
  await openSelect(wrapper, triggerSelector);
  const option = selectOptionElements(contentIndex).find((el) => el.textContent?.trim() === optionText);
  if (!option) {
    throw new Error(
      `pickSelectOption: "${optionText}" not found among ${JSON.stringify(selectOptionTexts(contentIndex))} for ${triggerSelector}`,
    );
  }
  await new DOMWrapper(option).trigger('pointerup');
  await new Promise((resolve) => setTimeout(resolve, 0));
}
