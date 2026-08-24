<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { OptimizeSettings } from '../types';
const props = defineProps<{ open: boolean; settings: OptimizeSettings }>();
const emit = defineEmits<{ close: []; save: [value: Partial<OptimizeSettings>] }>();
const { t } = useI18n();
const draft = reactive({ autostart: false, cpu: 1, cpu_override: true, use_pbgui_market_data: false });
watch(() => props.open, (open) => { if (open) Object.assign(draft, props.settings); }, { immediate: true });
</script>

<template>
  <div v-if="open" class="fixed inset-0 z-[1000] grid place-items-center bg-backdrop">
    <section class="flex w-[min(520px,calc(100vw-30px))] flex-col rounded-lg border border-border-default bg-panel shadow-[0_20px_50px_rgba(5,8,14,0.45)] max-h-[min(760px,calc(100dvh-30px))]" role="dialog" aria-modal="true">
      <header class="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-default px-3.5 py-3"><h2>{{ t('v7optimize.queueSettings') }}</h2><button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="grid min-h-0 gap-3 overflow-auto p-3.5 text-primary">
        <label class="grid gap-1.5 text-xs text-secondary">{{ t('v7optimize.autostartCpu') }}<input v-model.number="draft.cpu" class="min-h-8 rounded-sm border border-border-default bg-panel px-[9px] py-1.5 text-primary" type="number" min="1" :max="settings.cpu_max" /></label>
        <label><input v-model="draft.cpu_override" type="checkbox" /> {{ t('v7optimize.overrideConfigCpu') }}</label>
        <label><input v-model="draft.use_pbgui_market_data" type="checkbox" /> {{ t('v7optimize.usePbguiMarketData') }}</label>
        <label><input v-model="draft.autostart" type="checkbox" /> {{ t('v7optimize.autostart') }}</label>
      </div>
      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-3.5 py-3"><button class="min-h-[30px] cursor-pointer rounded-sm border border-border-default bg-white/4 px-2.5 py-1.25 text-primary hover:border-accent" @click="emit('close')">{{ t('common.cancel') }}</button><button class="min-h-[30px] cursor-pointer rounded-sm border border-accent/55 bg-accent/18 px-2.5 py-1.25 text-accent" @click="emit('save', { ...draft })">{{ t('common.save') }}</button></footer>
    </section>
  </div>
</template>
