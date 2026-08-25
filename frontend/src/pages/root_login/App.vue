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
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { replaceTopLocation } from '@/shared/nav';

const { t, locale } = useI18n();
const password = ref('');
const banner = ref('');
const pending = ref(false);

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
  if (pending.value) return;
  banner.value = '';
  pending.value = true;
  const { origin } = getBoot();
  try {
    await apiFetch(`${origin}/api/auth/login`, {
      method: 'POST',
      body: JSON.stringify({ password: password.value }),
    });
    replaceTopLocation(new URL(origin + '/api/auth/main_page').toString());
  } catch (error) {
    banner.value = serverMsg(error instanceof ApiError ? error.detail : String(error));
  } finally {
    pending.value = false;
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
          <rect x="1" y="1" width="34" height="34" rx="7" class="logo-box" />
          <rect x="7" y="21" width="5" height="9" rx="1.5" class="logo-bar-soft" />
          <rect x="14.5" y="15" width="5" height="15" rx="1.5" class="logo-bar" />
          <rect x="22" y="9" width="5" height="21" rx="1.5" class="logo-bar-deep" />
          <text x="42" y="15" class="logo-name" font-size="13" font-weight="700" letter-spacing="0.3">
            PBGui
          </text>
          <text x="42" y="28" class="logo-sub" font-size="7.5" font-weight="400" letter-spacing="1.2">
            WELCOME
          </text>
        </svg>
      </div>
      <form id="login-form" @submit.prevent="submitLogin">
        <div class="field">
          <Input
            id="password"
            v-model="password"
            size="lg"
            class="rounded-md bg-page"
            type="password"
            autocomplete="current-password"
            autofocus
            :placeholder="t('misc.login.password')"
            :aria-label="t('misc.login.password')"
          />
        </div>
        <Button id="login-submit" class="submit-btn w-full" variant="primary" size="lg" type="submit" :loading="pending" :disabled="!password">
          {{ pending ? t('misc.login.signingIn') : t('misc.login.submit') }}
        </Button>
      </form>
      <Button id="pbgui-lang-btn" class="lang-btn mt-3 w-full" variant="ghost" type="button" @click="toggleLang">
        {{ locale === 'zh' ? 'English' : '中文' }}
      </Button>
      <div id="banner" class="banner" :class="{ show: banner }" role="alert">{{ banner }}</div>
    </main>
  </div>
</template>

<!-- Ported from frontend/root_login.html; :root vars, reset and html/body base
     styles live in @/styles/tailwind.css. -->
<style scoped>
.page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-lg);
  background:
    radial-gradient(ellipse 60% 45% at 50% -8%, rgb(var(--accent-rgb) / 0.1), transparent 70%),
    radial-gradient(ellipse 45% 40% at 88% 108%, rgb(var(--success-rgb) / 0.05), transparent 70%);
}

.card {
  width: min(100%, 340px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: var(--sp-3xl) var(--sp-2xl) var(--sp-2xl);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: var(--surface-panel);
  box-shadow: var(--shadow-panel);
  position: relative;
  overflow: hidden;
}

/* accent rail along the card's top edge */
.card::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgb(var(--accent-rgb) / 0.65), transparent);
}

.brand {
  display: flex;
  justify-content: center;
  margin-bottom: var(--sp-2xl);
}

.logo-box {
  fill: var(--bg-elevated);
  stroke: var(--accent-deep);
  stroke-width: 1.5;
}

.logo-bar-soft {
  fill: var(--accent-soft);
}

.logo-bar {
  fill: var(--accent);
}

.logo-bar-deep {
  fill: var(--accent-deep);
}

.logo-name {
  fill: var(--text-primary);
  font-family: var(--font-family);
}

.logo-sub {
  fill: var(--accent);
  font-family: var(--font-family);
}

form {
  display: flex;
  flex-direction: column;
  gap: var(--sp-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-sm);
  width: 100%;
}

.banner {
  display: none;
  margin-top: var(--sp-md);
  padding: var(--sp-sm) var(--sp-md);
  border-radius: var(--radius-md);
  border: 1px solid rgb(var(--danger-rgb) / 0.28);
  background: var(--danger-bg);
  color: var(--danger-soft);
  font-size: var(--fs-sm);
  line-height: 1.5;
}

.banner.show {
  display: block;
}
</style>
