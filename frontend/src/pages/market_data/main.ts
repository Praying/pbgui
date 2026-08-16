import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';
/* Page shell styles ported from the legacy <head> block (M-data-1). The
   M-data-8 split moved the sections into panels-*.css (file-size ceiling);
   this order IS the original panels.css cascade — do not reorder. */
import './styles/panels-shell.css';
import './styles/panels-status.css';
import './styles/panels-settings.css';
import './styles/panels-tradfi.css';
import './styles/panels-integrity.css';
import './styles/panels-inventory.css';
import './styles/panels-best1m-copy.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
