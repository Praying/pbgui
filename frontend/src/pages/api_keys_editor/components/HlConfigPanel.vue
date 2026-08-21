<script setup lang="ts">
/*
 * HL expiry Telegram warning config (:902-919 markup, :2431-2497):
 * GET/PUT /hl-expiry/config with the configured/not-configured status line.
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import BackButton from './BackButton.vue';
import { pageFetch } from '../lib/pageApi';
import { injectToasts } from '../composables/useToasts';
import type { HlExpiryConfig } from '../types';

const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();
const toasts = injectToasts();

const days = ref(7);
const configured = ref(false);

function applyStatus(data: HlExpiryConfig): void {
  const parsed = parseInt(String(data && data.telegram_warning_days), 10);
  const value = Number.isFinite(parsed) && parsed >= 1 ? parsed : 7;
  days.value = value;
  configured.value = Boolean(data && data.configured);
}

onMounted(async () => {
  try {
    applyStatus(await pageFetch<HlExpiryConfig>('/hl-expiry/config'));
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failedToLoadHlConfig', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
});

async function save(): Promise<void> {
  const value = parseInt(String(days.value), 10);
  if (Number.isNaN(value) || value < 1) {
    toasts.showToast(t('misc.apikeys.warningDaysAtLeastOne'), 'error');
    return;
  }
  try {
    applyStatus(await pageFetch<HlExpiryConfig>('/hl-expiry/config', {
      method: 'PUT',
      body: JSON.stringify({ telegram_warning_days: value }),
    }));
    toasts.showToast(t('misc.apikeys.hlWarningConfigSaved'), 'success');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}
</script>

<template>
  <div id="hlConfigPanel" class="hl-expiry-panel">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 style="margin:0;">{{ t('misc.apikeys.hlExpiryTelegramWarning') }}</h3>
    </div>
    <div style="display:flex; gap:12px; align-items:flex-end;">
      <div class="form-group">
        <label>{{ t('misc.apikeys.warningThresholdDays') }}</label>
        <input type="number" id="hlWarningDays" v-model.number="days" min="1" max="365" style="width:100px;" />
      </div>
      <button class="btn pbgui-btn btn-sm btn-primary" @click="save">{{ t('common.save') }}</button>
    </div>
    <p
      id="hlWarningConfigStatus"
      :style="{ fontSize: 'var(--fs-sm)', marginTop: '8px', color: configured ? 'var(--success)' : 'var(--warning)' }"
    >
      {{
        configured
          ? t('misc.apikeys.hlConfigConfigured', {
              days,
              daysLabel: days === 1 ? t('misc.apikeys.day') : t('misc.apikeys.days'),
            })
          : t('misc.apikeys.hlConfigNotConfigured')
      }}
    </p>
    <p style="font-size:var(--fs-sm); color:#94a3b8; margin-top:8px;">
      {{ t('misc.apikeys.telegramWarningDesc') }}
    </p>
  </div>
</template>
