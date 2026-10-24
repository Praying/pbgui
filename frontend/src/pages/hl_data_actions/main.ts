import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import { initTheme } from '@/shared/composables/useTheme';
import App from './App.vue';
import '@/styles/tailwind.css';

/* Embedded document (no AppShell): apply the saved theme here, or the frame
   stays dark inside a light best-1m / jobs-monitor page. */
initTheme();

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
