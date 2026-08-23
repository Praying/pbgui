import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
/* All page styling lives in App.vue as Tailwind utilities (plus a small
   scoped block for the AppShell height-chain overrides). */
import '@/styles/tailwind.css';

createApp(App).use(createI18n(detectLang())).mount('#app');
