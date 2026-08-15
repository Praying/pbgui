import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import { setDashTranslator } from './lib/i18n';

/* The editor page is a standalone document (like the legacy
   dashboard_editor.html): its own editor.css (imported by EditorGrid) carries
   the document-level rules, so tokens/base.css are not needed here. */

const i18n = createI18n(detectLang());
/* Wire the page's vue-i18n instance into dashT so every dash.* key resolves
   through the same engine (the legacy page used window.PBGuiI18n). */
setDashTranslator((key, params) =>
  params ? i18n.global.t(key, params) : i18n.global.t(key)
);

const app = createApp(App);
app.use(i18n);
app.mount('#app');
