<script setup lang="ts">
import { reactive, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
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
      <header class="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-default px-3.5 py-3"><h2>{{ t('v7optimize.queueSettings') }}</h2><Button type="button" @click="emit('close')">{{ t('common.close') }}</Button></header>
      <div class="grid min-h-0 gap-3 overflow-auto p-3.5 text-primary">
        <label class="grid gap-1.5 text-xs text-secondary">{{ t('v7optimize.autostartCpu') }}<Input v-model.number="draft.cpu" type="number" min="1" :max="settings.cpu_max" /></label>
        <label><Checkbox v-model="draft.cpu_override" /> {{ t('v7optimize.overrideConfigCpu') }}</label>
        <label><Checkbox v-model="draft.use_pbgui_market_data" /> {{ t('v7optimize.usePbguiMarketData') }}</label>
        <label><Checkbox v-model="draft.autostart" /> {{ t('v7optimize.autostart') }}</label>
      </div>
      <footer class="flex shrink-0 items-center justify-end gap-2.5 border-t border-border-default px-3.5 py-3"><Button type="button" @click="emit('close')">{{ t('common.cancel') }}</Button><Button variant="info" type="button" @click="emit('save', { ...draft })">{{ t('common.save') }}</Button></footer>
    </section>
  </div>
</template>
