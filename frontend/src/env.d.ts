/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface BootInfo {
  token: string;
  origin: string;
  version: string;
  serial: string;
}
declare const __BOOT__: BootInfo | undefined;

interface Window {
  /** Legacy frontend/i18n.js engine, loaded during the Vue migration transition. */
  PBGuiI18n?: {
    lang: 'en' | 'zh';
    toggleLang(): void;
  };
  /**
   * PBGui AI bridge. Legacy pages get it from pbgui_nav.js; Vue pages
   * install the same facade from shared/ai/context.ts. The drawer script
   * (js/ai_drawer.js) extends it with open/close/toggle when it loads.
   */
  PBGuiAI?: {
    registerPageContext?(registration: unknown): () => void;
    registerPageAction?(registration: unknown): () => void;
    continuePageAction?(url: string): boolean;
    tryLocalCommand?(message: string): { handled: boolean; message?: string };
    collectContext?(): unknown;
    focusedField?(allowlist: unknown): unknown;
    open?(): void;
    close?(): void;
    toggle?(): void;
  };
  /** Legacy pages may assign a page-context function before nav.js loads. */
  PBGUI_AI_PAGE_CONTEXT?: () => unknown;
  /** Legacy pages may assign page actions before nav.js loads (v1.99.2+). */
  PBGUI_AI_PAGE_ACTIONS?: unknown[];
}

