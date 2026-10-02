import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import { setDashTranslator } from '@/pages/dashboard_editor/lib/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';

const i18n = createI18n(detectLang());
setDashTranslator((key, params) => (params ? i18n.global.t(key, params) : i18n.global.t(key)));

const app = createApp(App);
app.use(i18n);
app.mount('#app');
