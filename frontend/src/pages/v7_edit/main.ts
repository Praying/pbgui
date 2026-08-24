import { createApp } from 'vue';
import { createI18n, detectLang } from '@/shared/i18n';
import App from './App.vue';
import '@/styles/tailwind.css';
/* The former styles/v7-edit.css moved to Tailwind utilities on the
   templates + the retained rule block in App.vue at the migration. */

const app = createApp(App);
app.use(createI18n(detectLang()));
app.mount('#app');
