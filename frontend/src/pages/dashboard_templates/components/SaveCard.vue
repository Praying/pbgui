<script setup lang="ts">
/**
 * Legacy Card 1 (dashboard_templates.html render/bindEvents): save the
 * current dashboard config as a template. GET /dashboards/{current} must
 * yield a truthy `config`, then POST /dashboards/templates/{name} with the
 * raw config; `status === 'ok'` → savedName ok message + `saved` emit, any
 * failure → legacy error message (network and non-ok responses were both
 * collapsed to cb(null) / a config-less body in the legacy callbacks).
 */
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { apiFetch } from '@/shared/api';
import { PhFloppyDisk } from '@phosphor-icons/vue';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { dashboardsUrl, templatesUrl } from '../config';
import type { DashboardConfigResponse, StatusResponse } from '../types';

const props = defineProps<{ current: string }>();

const emit = defineEmits<{ saved: [name: string] }>();
const { t } = useI18n();

const name = ref(props.current);
const msg = ref('');
const msgType = ref<'ok' | 'err' | ''>('');
let msgTimer: number | undefined;

/** Legacy showMsg: set text + ok/err class, auto-clear after 3500 ms. */
function showMsg(text: string, type: 'ok' | 'err'): void {
  msg.value = text;
  msgType.value = type;
  window.clearTimeout(msgTimer);
  msgTimer = window.setTimeout(() => {
    msg.value = '';
    msgType.value = '';
  }, 3500);
}

async function save(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed) {
    showMsg(t('dash.nameRequired'), 'err');
    return;
  }
  let config: DashboardConfigResponse;
  try {
    config = await apiFetch<DashboardConfigResponse>(
      `${dashboardsUrl()}/${encodeURIComponent(props.current)}`
    );
  } catch {
    config = {};
  }
  if (!config.config) {
    showMsg(t('dash.couldNotLoadConfig'), 'err');
    return;
  }
  try {
    await apiFetch<StatusResponse>(`${templatesUrl()}/${encodeURIComponent(trimmed)}`, {
      method: 'POST',
      body: JSON.stringify(config.config),
    });
    showMsg(t('dash.savedName', { name: trimmed }), 'ok');
    emit('saved', trimmed);
    // Legacy render() rebuilt the page after a save, resetting the input to CURRENT.
    name.value = props.current;
  } catch {
    showMsg(t('dash.errorSavingTemplate'), 'err');
  }
}

onUnmounted(() => window.clearTimeout(msgTimer));
</script>

<template>
  <div class="tpl-card">
    <div class="tpl-card-title">{{ t('dash.saveCurrentAsTemplate') }}</div>
    <div class="tpl-label">{{ t('dash.current') }} <strong>{{ current }}</strong></div>
    <div class="input-row">
      <Input
        id="save-name"
        v-model="name"
        type="text"
        class="flex-1"
        :placeholder="t('dash.templateNamePlaceholder')"
        autocomplete="off"
      />
      <Button id="btn-save" variant="info" size="sm" type="button" class="self-center" @click="save"><PbIcon :icon="PhFloppyDisk" :size="14" class="align-[-2px] inline-block" /> {{ t('common.save') }}</Button>
    </div>
    <div id="save-msg" class="msg" :class="msgType" role="status" aria-live="polite">{{ msg }}</div>
  </div>
</template>
