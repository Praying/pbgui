/*
 * The iframe-aware modal viewport metrics — the port of hl_data_actions.html
 * resolveModalViewportMetrics (:554-597) and updateModalViewportHeight
 * (:599-621). The page is usually embedded as an iframe by the Vue
 * market_data page; the modal must fit the frame's visible slice inside the
 * parent document, so the metrics land as CSS variables on the root element
 * and every relevant viewport (self, parent doc, top) re-measures on
 * resize/scroll.
 */

import { onBeforeUnmount, onMounted, type Ref } from 'vue';

function isClippingAncestor(element: Element | null, view: Window | null): boolean {
  if (!element || !view || typeof view.getComputedStyle !== 'function') return false;
  const style = view.getComputedStyle(element);
  if (!style) return false;
  const overflowValue = String(style.overflow || '') + ' ' + String(style.overflowY || '') + ' ' + String(style.overflowX || '');
  return /(auto|scroll|hidden|clip|overlay)/i.test(overflowValue);
}

export interface ModalViewportMetrics {
  visibleHeight: number;
  topOffset: number;
  bottomOffset: number;
}

export function resolveModalViewportMetrics(): ModalViewportMetrics {
  const fallbackHeight = Math.max(0, window.innerHeight || 0);
  let topViewportHeight = fallbackHeight;
  try {
    if (window.top && window.top.innerHeight) {
      topViewportHeight = Math.max(0, window.top.innerHeight || 0);
    }
  } catch {
    /* cross-origin parent — fall back below */
  }

  const fallback: ModalViewportMetrics = {
    visibleHeight: topViewportHeight || fallbackHeight,
    topOffset: 0,
    bottomOffset: 0,
  };

  try {
    const frame = window.frameElement;
    if (!frame || !window.top || window.top === window) return fallback;
    const ownerDoc = frame.ownerDocument || (window.top && window.top.document) || null;
    const ownerView = (ownerDoc && ownerDoc.defaultView) || window.top;
    const rect = frame.getBoundingClientRect();
    let clipTop = 0;
    let clipBottom = topViewportHeight;
    let ancestor = frame.parentElement;
    while (ancestor) {
      if (isClippingAncestor(ancestor, ownerView)) {
        const ancestorRect = ancestor.getBoundingClientRect();
        clipTop = Math.max(clipTop, ancestorRect.top);
        clipBottom = Math.min(clipBottom, ancestorRect.bottom);
      }
      ancestor = ancestor.parentElement;
    }
    const visibleTop = Math.max(rect.top, clipTop);
    const visibleBottom = Math.min(rect.bottom, clipBottom);
    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    return {
      visibleHeight: visibleHeight || fallback.visibleHeight,
      topOffset: Math.max(0, visibleTop - rect.top),
      bottomOffset: Math.max(0, rect.bottom - visibleBottom),
    };
  } catch {
    return fallback;
  }
}

/** Wires updateModalViewportHeight (:599-621) onto the root element ref. */
export function useModalViewport(rootEl: Ref<HTMLElement | null>) {
  function update(): void {
    const metrics = resolveModalViewportMetrics();
    const root = rootEl.value;
    if (!root) return;
    root.style.setProperty('--hlda-modal-visible-height', Math.max(0, metrics.visibleHeight) + 'px');
    root.style.setProperty('--hlda-modal-visible-top-offset', Math.max(0, metrics.topOffset) + 'px');
    root.style.setProperty('--hlda-modal-visible-bottom-offset', Math.max(0, metrics.bottomOffset) + 'px');
  }

  let parentDoc: Document | null = null;

  onMounted(() => {
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    try {
      parentDoc = window.frameElement && window.frameElement.ownerDocument;
      if (parentDoc) {
        parentDoc.addEventListener('scroll', update, { passive: true, capture: true });
      }
      if (window.top && window.top !== window) {
        window.top.addEventListener('resize', update);
        window.top.addEventListener('scroll', update, { passive: true });
        if (window.top.document && window.top.document !== parentDoc) {
          window.top.document.addEventListener('scroll', update, { passive: true, capture: true });
        }
      }
    } catch {
      /* cross-origin parent */
    }
  });

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update);
    window.removeEventListener('scroll', update);
    try {
      parentDoc?.removeEventListener('scroll', update, { capture: true } as EventListenerOptions);
      if (window.top && window.top !== window) {
        window.top.removeEventListener('resize', update);
        window.top.removeEventListener('scroll', update);
        window.top.document.removeEventListener('scroll', update, { capture: true } as EventListenerOptions);
      }
    } catch {
      /* cross-origin parent */
    }
  });

  return { update };
}
