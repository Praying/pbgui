import { ref, type Ref } from 'vue';

/*
 * The shared promise confirm dialog — legacy showConfirmDialog /
 * closeConfirmDialog (market_data_main.html:8161-8215, :8141-8159) over the
 * #confirm-ovl markup (:2893-2915). Used by the integrity panel's
 * destructive flows here; M-data-6's inventory deletions reuse it.
 *
 * Semantics preserved:
 *   - a new confirm() resolves the pending one with false (:8177-8181);
 *   - items are stringified, trimmed and emptied out (:8183-8185);
 *   - title/message/confirmText/listLabel defaults (:8187-8196);
 *   - the accept button is focused on open and focus returns to the
 *     opener on close (:8207, :8151-8156);
 *   - Escape closes with false, Enter accepts — unless the keypress
 *     targets a button inside the dialog (:9588-9599).
 *
 * Deviations (documented):
 *   - the legacy DOM-missing fallback (nav.confirm_unavailable toast,
 *     :8172-8175) is dropped — the Vue component always renders;
 *   - the header's ✕ close button (:2898) had no click binding in legacy
 *     (dead); it now cancels like the Cancel button.
 */

export interface ConfirmDialogRequest {
  title?: string;
  message?: string;
  detail?: string;
  items?: unknown[];
  listLabel?: string;
  confirmText?: string;
}

/** Rendered dialog state (the #confirm-ovl fields :8187-8205). */
export interface ConfirmDialogState {
  title: string;
  message: string;
  detail: string;
  items: string[];
  listLabel: string;
  confirmText: string;
}

export interface ConfirmDialogController {
  visible: Ref<boolean>;
  state: Ref<ConfirmDialogState>;
  /** showConfirmDialog (:8161-8215) — resolves with the user's choice. */
  confirm(request?: ConfirmDialogRequest): Promise<boolean>;
  /** closeConfirmDialog(true) (:8141-8159). */
  accept(): void;
  /** closeConfirmDialog(false) (:8141-8159). */
  cancel(): void;
  /** Document keydown slice (:9588-9599) — true when consumed. */
  handleKeydown(event: KeyboardEvent): boolean;
}

export interface UseConfirmDialogOptions {
  t: (key: string) => string;
}

const EMPTY_STATE: ConfirmDialogState = {
  title: '',
  message: '',
  detail: '',
  items: [],
  listLabel: '',
  confirmText: '',
};

export function useConfirmDialog(options: UseConfirmDialogOptions): ConfirmDialogController {
  const { t } = options;
  const visible = ref(false);
  const state = ref<ConfirmDialogState>({ ...EMPTY_STATE });
  let resolver: ((confirmed: boolean) => void) | null = null; // uiState.confirmResolve
  let returnFocus: HTMLElement | null = null; // uiState.confirmReturnFocus

  /** closeConfirmDialog (:8141-8159). */
  function close(confirmed: boolean): void {
    visible.value = false;
    const pending = resolver;
    resolver = null;
    if (returnFocus && typeof returnFocus.focus === 'function') {
      try {
        returnFocus.focus();
      } catch {
        /* :8152-8155 */
      }
    }
    returnFocus = null;
    if (typeof pending === 'function') pending(confirmed);
  }

  /** showConfirmDialog (:8161-8215). */
  function confirm(request: ConfirmDialogRequest = {}): Promise<boolean> {
    if (resolver) {
      const previous = resolver; // :8177-8181 — replace pending with false
      resolver = null;
      previous(false);
    }
    const items = Array.isArray(request.items)
      ? request.items.map((item) => String(item || '').trim()).filter(Boolean) // :8183-8185
      : [];
    const detail = String(request.detail ?? '').trim(); // :8192
    state.value = {
      title: String(request.title ?? t('common.confirmAction')),
      message: String(request.message ?? t('common.areYouSure')),
      detail, // hidden when empty in the template (:8194)
      items,
      listLabel: String(request.listLabel ?? t('market.selectedCoins')),
      confirmText: String(request.confirmText ?? t('common.confirm')),
    };
    returnFocus = (document.activeElement as HTMLElement | null) ?? null; // :8207
    return new Promise((resolve) => {
      resolver = resolve; // :8210
      visible.value = true; // overlay.classList.add('visible') :8211
    });
  }

  /** The document keydown slice (:9588-9599). */
  function handleKeydown(event: KeyboardEvent): boolean {
    if (!visible.value) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      close(false);
      return true;
    }
    if (event.key === 'Enter') {
      const target = event.target as HTMLElement | null;
      if (target && target.tagName === 'BUTTON' && target.closest('#confirm-ovl')) return true; // :9595-9596
      event.preventDefault();
      close(true);
      return true;
    }
    return false;
  }

  return {
    visible,
    state,
    confirm,
    accept: () => close(true),
    cancel: () => close(false),
    handleKeydown,
  };
}
