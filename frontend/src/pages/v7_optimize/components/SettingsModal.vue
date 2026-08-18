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
  <div v-if="open" class="opt-modal-backdrop">
    <section class="opt-modal opt-modal-small" role="dialog" aria-modal="true">
      <header class="opt-modal-head"><h2>{{ t('v7optimize.queueSettings') }}</h2><button class="opt-btn" @click="emit('close')">{{ t('common.close') }}</button></header>
      <div class="opt-modal-body opt-settings">
        <label class="opt-form-label">{{ t('v7optimize.autostartCpu') }}<input v-model.number="draft.cpu" class="opt-input" type="number" min="1" :max="settings.cpu_max" /></label>
        <label><input v-model="draft.cpu_override" type="checkbox" /> {{ t('v7optimize.overrideConfigCpu') }}</label>
        <label><input v-model="draft.use_pbgui_market_data" type="checkbox" /> {{ t('v7optimize.usePbguiMarketData') }}</label>
        <label><input v-model="draft.autostart" type="checkbox" /> {{ t('v7optimize.autostart') }}</label>
      </div>
      <footer class="opt-modal-actions"><button class="opt-btn" @click="emit('close')">{{ t('common.cancel') }}</button><button class="opt-btn primary" @click="emit('save', { ...draft })">{{ t('common.save') }}</button></footer>
    </section>
  </div>
</template>
