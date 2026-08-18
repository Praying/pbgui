import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import './styles/vps-monitor.css';

createApp(App).use(createI18n(detectLang())).mount('#app');
