import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';
/* Page styles ported from the legacy <style> block — de-prefixed, ids kept. */
import './styles/hlda.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
