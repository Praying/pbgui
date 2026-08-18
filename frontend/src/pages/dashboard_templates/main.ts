import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
