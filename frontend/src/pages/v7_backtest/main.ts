import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';
/* Page styles ported from the legacy <head> block + backtest_shell.css
 * (v7_backtest.html:15-657, frontend/css/backtest_shell.css) — ids and
 * class contracts unchanged. */
import './styles/backtest-shell.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
