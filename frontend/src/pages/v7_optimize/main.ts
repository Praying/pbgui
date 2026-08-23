import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';

createApp(App).use(createI18n(detectLang())).mount('#app');
