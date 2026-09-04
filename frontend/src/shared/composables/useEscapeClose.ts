import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Escape-close for overlays that keep their own chrome (full-screen views,
 * legacy panels) and therefore don't sit on the reka-ui Modal primitive.
 * The shared Modal already handles Escape via reka's dismissable layer —
 * use this only outside it.
 *
 * Listener attaches while `active` is true and detaches on flip-off/unmount,
 * so idle pages never pay a document keydown handler.
 */
export function useEscapeClose(active: Ref<boolean>, onEscape: () => void): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') onEscape();
  }

  watch(
    active,
    (isActive) => {
      if (isActive) document.addEventListener('keydown', onKeydown);
      else document.removeEventListener('keydown', onKeydown);
    },
    { immediate: true }
  );

  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
}
