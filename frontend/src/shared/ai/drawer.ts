/*
 * Global AI drawer bootstrap for Vue pages.
 *
 * Legacy topnav loads /app/js/ai_drawer.js on first click of #pbgui-ai-btn.
 * Vue pages render the WorkbenchRail instead, so this module reproduces
 * that lazy-load contract: the ~900-line drawer (and its CSS) only hits the
 * network when the assistant is first opened.
 *
 * The drawer itself stays shared script — it reads window.PBGuiAI and
 * appends #pbgui-ai-drawer to <body>, both of which are generation-neutral.
 */
import { ref } from 'vue';

let loading = false;

/**
 * Open the AI drawer, loading js/ai_drawer.js + css/ai_drawer.css on first
 * use. Safe to call repeatedly; resolves when open() has been invoked (or
 * immediately when the drawer is already loaded).
 */
export function openAiDrawer(): void {
  const facade = window.PBGuiAI;
  if (facade && typeof facade.toggle === 'function') {
    facade.toggle();
    return;
  }
  if (loading) return;
  loading = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/app/css/ai_drawer.css?v=11';
  document.head.appendChild(link);

  const script = document.createElement('script');
  script.src = '/app/js/ai_drawer.js?v=24';
  script.onload = () => {
    loading = false;
    window.PBGuiAI?.open?.();
  };
  script.onerror = () => {
    loading = false;
  };
  document.head.appendChild(script);
}

/**
 * Reactive visibility for an AI opener button. Legacy pages reveal the
 * button after a successful token refresh; Vue pages already know the auth
 * state at boot (boot.js token), so the button is visible whenever a token
 * is present.
 */
export function useAiDrawerAvailable(): { available: ReturnType<typeof ref<boolean>> } {
  const available = ref(false);
  try {
    const b = (globalThis as { __BOOT__?: { token?: string } }).__BOOT__;
    available.value = Boolean(b?.token);
  } catch {
    // boot.js missing — keep the button hidden rather than advertise a
    // drawer the session cannot authenticate.
  }
  return { available };
}
