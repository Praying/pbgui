import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';
/* Page styles ported from the legacy <head> block — ids/classes unchanged. */
import './styles/db-tools.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
