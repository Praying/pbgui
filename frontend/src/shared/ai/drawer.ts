/*
 * Global AI drawer bootstrap for Vue pages.
 *
 * Legacy topnav loads /app/js/ai_drawer.js on first click of #pbgui-ai-btn.
 * Vue pages render the WorkbenchRail instead, so this module reproduces
 * that lazy-load contract: the ~900-line drawer script only hits the network
 * when the assistant is first opened. Its CSS is part of the Vue Tailwind
 * bundle; legacy standalone pages keep their own fallback loader.
 *
 * The drawer itself stays shared script — it reads window.PBGuiAI and
 * appends #pbgui-ai-drawer to <body>, both of which are generation-neutral.
 */
import { ref } from 'vue';

import {
  markAiDrawerInteraction,
  openAiDrawer as openStaticAiDrawer,
  setupAiDrawerAutoOpen as setupStaticAiDrawerAutoOpen,
} from './useAiDrawer';

/**
 * Open the statically mounted Vue AI drawer. The old function name remains
 * exported so WorkbenchRail and older integrations do not need to change.
 */
export function openAiDrawer(): void {
  openStaticAiDrawer();
}

/** Record that the user opened/closed the drawer themselves (legacy isTrusted gate). */
export function markAiUserInteraction(): void {
  markAiDrawerInteraction();
}

/**
 * Preserve the existing AppShell API while delegating auto-open to the
 * module-level Vue Drawer state.
 */
export function setupAiDrawerAutoOpen(options: { allowPreferenceAutoOpen?: boolean } = {}): void {
  void setupStaticAiDrawerAutoOpen(options);
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
