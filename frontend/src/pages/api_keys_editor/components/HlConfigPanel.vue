<script setup lang="ts">
/*
 * HL expiry Telegram warning config (:902-919 markup, :2431-2497):
 * GET/PUT /hl-expiry/config with the configured/not-configured status line.
 */
import { onMounted, ref } from 'vue';
import { PhBell, PhCalendarBlank, PhCheckCircle, PhFloppyDisk, PhWarningCircle } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import BackButton from './BackButton.vue';
import { pageFetch } from '../lib/pageApi';
import { injectToasts } from '../composables/useToasts';
import type { HlExpiryConfig } from '../types';

const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();
const toasts = injectToasts();

const days = ref<number | string>(7);
const configured = ref(false);
const loading = ref(true);
const saving = ref(false);

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
  } finally {
    loading.value = false;
  }
});

async function save(): Promise<void> {
  const value = parseInt(String(days.value), 10);
  if (Number.isNaN(value) || value < 1) {
    toasts.showToast(t('misc.apikeys.warningDaysAtLeastOne'), 'error');
    return;
  }
  saving.value = true;
  try {
    applyStatus(await pageFetch<HlExpiryConfig>('/hl-expiry/config', {
      method: 'PUT',
      body: JSON.stringify({ telegram_warning_days: value }),
    }));
    toasts.showToast(t('misc.apikeys.hlWarningConfigSaved'), 'success');
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div id="hlConfigPanel" class="hl-warning-workbench hl-expiry-panel mx-auto mb-5 grid w-[min(100%,1040px)] gap-4">
    <header class="hl-warning-page-head flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-panel px-4 py-3.5 shadow-panel max-[720px]:flex-col">
      <div class="flex min-w-0 items-start gap-3">
        <BackButton class="mt-0.5" @back="emit('back')" />
        <div class="min-w-0">
          <h2 class="m-0 text-xl font-semibold tracking-tight text-primary">{{ t('misc.apikeys.hlExpiryTelegramWarning') }}</h2>
          <p class="mt-1 max-w-[68ch] text-sm leading-relaxed text-secondary">{{ t('misc.apikeys.hlWarningOverview') }}</p>
        </div>
      </div>
      <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-warning/30 bg-warning/10 text-warning-soft" aria-hidden="true">
        <PbIcon :icon="PhBell" :size="18" />
      </span>
    </header>

    <div class="grid grid-cols-[minmax(260px,0.8fr)_minmax(0,1.2fr)] gap-4 max-[820px]:grid-cols-1">
      <section class="hl-warning-status overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel" aria-labelledby="hl-warning-status-title">
        <div class="flex items-start gap-3 border-b border-border-subtle bg-card px-4 py-3">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true">
            <PbIcon :icon="configured ? PhCheckCircle : PhWarningCircle" :size="16" />
          </span>
          <div class="min-w-0">
            <h3 id="hl-warning-status-title" class="m-0 text-md font-semibold text-primary">{{ t('misc.apikeys.hlWarningStatusTitle') }}</h3>
            <p class="mt-0.5 text-sm text-muted">pbgui.ini</p>
          </div>
        </div>
        <div class="grid gap-4 px-4 py-4">
          <span
            class="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
            :class="configured ? 'border-success/30 bg-success/10 text-success-soft' : 'border-warning/30 bg-warning/10 text-warning-soft'"
          >
            <PbIcon :icon="configured ? PhCheckCircle : PhWarningCircle" :size="14" />
            {{ configured ? t('misc.apikeys.configured') : t('misc.apikeys.notConfigured') }}
          </span>
          <div class="flex items-end gap-2">
            <strong class="font-mono text-[2rem] leading-none text-primary">{{ loading ? '…' : days }}</strong>
            <span class="pb-0.5 text-sm text-muted">{{ Number(days) === 1 ? t('misc.apikeys.day') : t('misc.apikeys.days') }}</span>
          </div>
          <p id="hlWarningConfigStatus" class="m-0 text-sm leading-relaxed" :class="configured ? 'text-success-soft' : 'text-warning-soft'">
            {{
              configured
                ? t('misc.apikeys.hlConfigConfigured', {
                    days,
                    daysLabel: Number(days) === 1 ? t('misc.apikeys.day') : t('misc.apikeys.days'),
                  })
                : t('misc.apikeys.hlConfigNotConfigured')
            }}
          </p>
        </div>
      </section>

      <section class="hl-warning-settings overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel" aria-labelledby="hl-warning-window-title">
        <div class="flex items-start gap-3 border-b border-border-subtle bg-card px-4 py-3">
          <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true">
            <PbIcon :icon="PhCalendarBlank" :size="16" />
          </span>
          <div class="min-w-0">
            <h3 id="hl-warning-window-title" class="m-0 text-md font-semibold text-primary">{{ t('misc.apikeys.hlWarningWindowTitle') }}</h3>
            <p class="mt-0.5 text-sm text-muted">{{ t('misc.apikeys.hlWarningWindowHint') }}</p>
          </div>
        </div>

        <div class="grid gap-4 px-4 py-4">
          <div class="flex max-w-[260px] min-w-0 flex-col gap-1">
            <Label for="hlWarningDays">{{ t('misc.apikeys.warningThresholdDays') }}</Label>
            <div class="relative">
              <Input type="number" id="hlWarningDays" v-model.number="days" min="1" max="365" class="pr-14 font-mono text-md" aria-describedby="hlWarningDaysHint" :disabled="loading || saving" />
              <span class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted">{{ t('misc.apikeys.days') }}</span>
            </div>
            <p id="hlWarningDaysHint" class="text-xs text-muted">{{ t('misc.apikeys.hlWarningRangeHint') }}</p>
          </div>

          <div class="rounded-md border border-border-subtle bg-card px-3 py-2.5">
            <div class="flex items-start gap-2">
              <PbIcon class="mt-0.5 shrink-0 text-accent-soft" :icon="PhBell" :size="15" />
              <div>
                <div class="text-sm font-medium text-primary">{{ t('misc.apikeys.hlWarningDailyTitle') }}</div>
                <p class="mt-0.5 text-sm leading-relaxed text-secondary">{{ t('misc.apikeys.telegramWarningDesc') }}</p>
              </div>
            </div>
          </div>
        </div>

        <footer class="flex items-center justify-end border-t border-border-subtle bg-card px-4 py-3 max-[560px]:items-stretch">
          <Button type="button" variant="primary" :loading="saving" :disabled="loading" class="max-[560px]:w-full" @click="save">
            <PbIcon :icon="PhFloppyDisk" :size="15" />
            {{ t('common.save') }}
          </Button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.hl-warning-workbench {
  color: var(--text-primary);
}

@media (max-width: 720px) {
  .hl-warning-page-head > span:last-child {
    display: none;
  }
}
</style>
