import { onBeforeUnmount, watch, type Ref } from 'vue';

const escapeOwners: Array<() => void> = [];

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
    if (event.key !== 'Escape' || event.defaultPrevented || escapeOwners.at(-1) !== onEscape) return;
    event.preventDefault();
    onEscape();
  }

  function detach(): void {
    document.removeEventListener('keydown', onKeydown);
    const ownerIndex = escapeOwners.lastIndexOf(onEscape);
    if (ownerIndex >= 0) escapeOwners.splice(ownerIndex, 1);
  }

  watch(
    active,
    (isActive) => {
      detach();
      if (isActive) {
        escapeOwners.push(onEscape);
        document.addEventListener('keydown', onKeydown);
      }
    },
    { immediate: true }
  );

  onBeforeUnmount(detach);
}
