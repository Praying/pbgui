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
}

