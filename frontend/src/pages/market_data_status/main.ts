import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';

/*
 * The still-legacy market_data_main.html injects this page as a fragment and
 * calls root.__mdsDestroy() on every exchange switch (destroyStatusMonitor,
 * market_data_main.html:4127-4140). App unmounting tears down the WebSocket
 * reconnect loop and toast timers, so exposing unmount under that name keeps
 * the parent's contract intact.
 */
const container = document.getElementById('mds-app');
const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount(container ?? '#mds-app');

const rootEl = container?.querySelector('.mds-root') as
  | (HTMLElement & { __mdsDestroy?: () => void })
  | null;
if (rootEl) {
  rootEl.__mdsDestroy = () => {
    app.unmount();
  };
}
