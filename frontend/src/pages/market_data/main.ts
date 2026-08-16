import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';
/* Page shell styles ported from the legacy <head> block (M-data-1). */
import './styles/panels.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
