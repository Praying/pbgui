import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import '@/styles/tailwind.css';
import App from './App.vue';

createApp(App).use(createI18n(detectLang())).mount('#app');
