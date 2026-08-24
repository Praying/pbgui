import { createApp } from 'vue';
import '@/styles/tailwind.css';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
/* D-editor-4: swap the EmptyCell stubs for the real Plotly widgets */
import './components/widgets/register';
import { setDashTranslator } from './lib/i18n';

/* The editor page is a standalone document (like the legacy
   dashboard_editor.html): App.vue's unscoped <style> block carries the
   document-level rules (body font stack, standalone/view-mode chrome) on
   top of the shared tailwind.css entry — the former styles/editor.css and
   styles/widgets.css were deleted at the Tailwind migration. */

const i18n = createI18n(detectLang());
/* Wire the page's vue-i18n instance into dashT so every dash.* key resolves
   through the same engine (the legacy page used window.PBGuiI18n). */
setDashTranslator((key, params) =>
  params ? i18n.global.t(key, params) : i18n.global.t(key)
);

const app = createApp(App);
app.use(i18n);
app.mount('#app');
