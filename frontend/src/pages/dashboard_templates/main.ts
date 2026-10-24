import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';
import { initTheme } from '@/shared/composables/useTheme';

/* Standalone document (no AppShell): apply the saved theme here, or the iframe
   stays dark inside a light dashboard. */
initTheme();

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
