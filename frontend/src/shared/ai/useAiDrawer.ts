import { ref } from 'vue';

import { apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';

const isOpen = ref(false);
const drawerWidth = ref(480);
let userInteracted = false;

function getPreferencesUrl(): string {
  return `${getBoot().origin}/api/ai/preferences`;
}

async function savePreferences(open: boolean): Promise<void> {
  try {
    await apiFetch(getPreferencesUrl(), {
      method: 'PUT',
      credentials: 'same-origin',
      body: JSON.stringify({
        drawer_width: Math.round(drawerWidth.value),
        drawer_open: open,
      }),
    });
  } catch {
    // Drawer state remains local when preferences are unavailable.
  }
}

export function markAiDrawerInteraction(): void {
  userInteracted = true;
}

export function openAiDrawer(): void {
  isOpen.value = true;
  void savePreferences(true);
}

export async function closeAiDrawer(): Promise<void> {
  isOpen.value = false;
  await savePreferences(false);
}

export function toggleAiDrawer(): void {
  if (isOpen.value) closeAiDrawer();
  else openAiDrawer();
}

export function saveAiDrawerWidth(): void {
  void savePreferences(isOpen.value);
}

export async function setupAiDrawerAutoOpen(options: { allowPreferenceAutoOpen?: boolean } = {}): Promise<void> {
  try {
    if (!getBoot().token) return;
  } catch {
    return;
  }

  const url = new URL(window.location.href);
  if (url.searchParams.get('pbgui_ai_action') === '1') {
    url.searchParams.delete('pbgui_ai_action');
    window.history.replaceState(
      window.history.state,
      '',
      url.pathname + url.search + url.hash,
    );
    openAiDrawer();
    return;
  }

  try {
    const preferences = await apiFetch<{ drawer_open?: boolean; drawer_width?: number }>(getPreferencesUrl(), {
      credentials: 'same-origin',
    });
    if (typeof preferences?.drawer_width === 'number') {
      drawerWidth.value = Math.min(Math.max(320, preferences.drawer_width), 640);
    }
    if (options.allowPreferenceAutoOpen !== false && preferences?.drawer_open === true && !userInteracted) {
      openAiDrawer();
    }
  } catch {
    // Preferences are optional; the drawer remains closed on failure.
  }
}

export function useAiDrawer(): {
  isOpen: typeof isOpen;
  drawerWidth: typeof drawerWidth;
  openDrawer: typeof openAiDrawer;
  closeDrawer: typeof closeAiDrawer;
  toggleDrawer: typeof toggleAiDrawer;
  saveWidth: typeof saveAiDrawerWidth;
  markInteraction: typeof markAiDrawerInteraction;
} {
  return {
    isOpen,
    drawerWidth,
    openDrawer: openAiDrawer,
    closeDrawer: closeAiDrawer,
    toggleDrawer: toggleAiDrawer,
    saveWidth: saveAiDrawerWidth,
    markInteraction: markAiDrawerInteraction,
  };
}
