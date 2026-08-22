<script setup lang="ts">
/*
 * Shell boundary (intentional): the login contract stays standalone rather
 * than rendering AppShell or StatusStrip. Authentication uses the shared
 * apiFetch boundary, which adds the boot Bearer header while preserving the
 * HttpOnly session-cookie flow before the top-level redirect.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { getBoot } from '@/shared/boot';
import { serverMsg } from '@/shared/i18n';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import { replaceTopLocation } from '@/shared/nav';

const { t, locale } = useI18n();
const password = ref('');
const banner = ref('');

function toggleLang(): void {
  if (window.PBGuiI18n) {
    window.PBGuiI18n.toggleLang(); // legacy engine persists the choice and reloads
    return;
  }
  localStorage.setItem('pbgui-lang', locale.value === 'zh' ? 'en' : 'zh');
  window.location.reload();
}

onMounted(() => {
  document.title = t('misc.login.title');
  // Session-expiry guard: never render the login form inside a dashboard iframe.
  if (window.self !== window.top) {
    replaceTopLocation(new URL(getBoot().origin + '/').toString());
  }
});

async function submitLogin(): Promise<void> {
  banner.value = '';
  const { origin } = getBoot();
  try {
    await apiFetch(`${origin}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ password: password.value }),
    });
    replaceTopLocation(new URL(origin + '/api/auth/main_page').toString());
  } catch (error) {
    banner.value = serverMsg(error instanceof ApiError ? error.detail : String(error));
  }
}
</script>

<template>
  <div class="page">
    <MigrationWatermark />
    <main class="card">
      <div class="brand" aria-label="PBGui Welcome">
        <svg
          width="112"
          height="36"
          viewBox="0 0 112 36"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-hidden="true"
        >
          <rect x="1" y="1" width="34" height="34" rx="7" fill="#1a2744" stroke="#3182ce" stroke-width="1.5" />
          <rect x="7" y="21" width="5" height="9" rx="1.5" fill="#63b3ed" />
          <rect x="14.5" y="15" width="5" height="15" rx="1.5" fill="#4299e1" />
          <rect x="22" y="9" width="5" height="21" rx="1.5" fill="#3182ce" />
          <text
            x="42"
            y="15"
            font-family="'Segoe UI',system-ui,sans-serif"
            font-size="13"
            font-weight="700"
            fill="#e2e8f0"
            letter-spacing="0.3"
          >
            PBGui
          </text>
          <text
            x="42"
            y="28"
            font-family="'Segoe UI',system-ui,sans-serif"
            font-size="7.5"
            font-weight="400"
            fill="#4299e1"
            letter-spacing="1.2"
          >
            WELCOME
          </text>
        </svg>
      </div>
      <form id="login-form" @submit.prevent="submitLogin">
        <div class="field">
          <input
            id="password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            autofocus
            :placeholder="t('misc.login.password')"
            :aria-label="t('misc.login.password')"
          />
        </div>
      </form>
      <button id="pbgui-lang-btn" class="lang-btn" type="button" @click="toggleLang">
        {{ locale === 'zh' ? 'English' : '中文' }}
      </button>
      <div id="banner" class="banner" :class="{ show: banner }" role="alert">{{ banner }}</div>
    </main>
  </div>
</template>

<!-- Ported from frontend/root_login.html; :root vars, reset and html/body base
     styles live in @/styles/tokens.css and @/styles/base.css. -->
<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.card {
  width: min(100%, 320px);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.brand {
  display: inline-flex;
  margin-bottom: var(--sp-lg);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  width: 100%;
}

input,
button {
  font-size: var(--fs-base);
}

input {
  width: 100%;
  height: var(--input-h);
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--bg-page);
  color: var(--text-primary);
}

input:focus {
  outline: none;
  border-color: #26a69a;
  box-shadow: 0 0 0 3px rgba(38, 166, 154, 0.16);
}

.lang-btn {
  margin-top: var(--sp-md);
  width: 100%;
  height: var(--btn-h);
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid var(--border-default);
  background: var(--bg-card);
  color: var(--text-primary);
  font-size: var(--fs-base);
  cursor: pointer;
}

.banner {
  display: none;
  margin-top: var(--sp-md);
  padding: var(--sp-md);
  border-radius: 10px;
  border: 1px solid rgba(248, 113, 113, 0.28);
  background: rgba(127, 29, 29, 0.45);
  color: #fecaca;
  line-height: 1.5;
}

.banner.show {
  display: block;
}
</style>
