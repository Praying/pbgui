<script setup lang="ts">
/*
 * API Server settings pane, ported 1:1 from the legacy static markup plus the
 * applySettings('api-server') / renderVpsHosts / saveApiServerSettings code in
 * frontend/services_monitor.html: the Connection fields (bind address with the
 * literal 0.0.0.0 placeholder, port 1024-65535), the VPS Monitoring section
 * (auto-restart checkbox, monitored-hosts tag multiselect, monitor threshold
 * grids, alert routing groups), the Alerts/Telegram fields (bot token behind a
 * togglePw eye button, chat id) and the Save button with its inline flash
 * message (_post/_flash).
 *
 * Loading follows the legacy _settingsLoaded gate: the App shell calls load()
 * once on first settings-tab activation; until the GET resolves the loading
 * placeholder stays visible (load failures are silent).
 */
import { onUnmounted, ref } from 'vue';
import { PhEye, PhFloppyDisk } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { apiBase } from '../config';
import type { AlertRoutingId, ApiServerSettingsData, PbDataSaveResponse } from '../types';
import MultiselectTags from './MultiselectTags.vue';
import MonitorThresholds from './MonitorThresholds.vue';
import AlertRouting from './AlertRouting.vue';

/** The 18 monitor fields legacy collectMonitorConfigFromForm walks, in order. */
const MONITOR_FIELDS = [
  'mem_warning_server', 'mem_error_server', 'swap_warning_server', 'swap_error_server',
  'disk_warning_server', 'disk_error_server', 'cpu_warning_server', 'cpu_error_server',
  'mem_warning_v7', 'mem_error_v7', 'swap_warning_v7', 'swap_error_v7',
  'cpu_warning_v7', 'cpu_error_v7', 'error_warning_v7', 'error_error_v7',
  'traceback_warning_v7', 'traceback_error_v7',
] as const;

/** The 13 alert-routing ids legacy collectAlertRoutingFromForm walks, in order. */
const ROUTING_IDS: AlertRoutingId[] = [
  'offline_gui', 'service_gui', 'system_gui', 'instance_gui',
  'ssh_lost_telegram', 'ssh_recovered_telegram',
  'service_down_telegram', 'service_restart_started_telegram', 'service_recovered_telegram',
  'system_problem_telegram', 'system_recovered_telegram',
  'instance_problem_telegram', 'instance_recovered_telegram',
];

/** Legacy _flash timeout before the inline message fades. */
const FLASH_MS = 3000;

const { t } = useI18n();

/** Legacy #apiserver-settings-wrap loading placeholder state. */
const loaded = ref(false);
const host = ref('');
const port = ref('');
const autoRestart = ref(true);
const availableHosts = ref<string[]>([]);
const enabledHosts = ref<string[]>([]);
/** Raw monitor input values keyed by legacy field name (renders 0 when absent). */
const monitorConfig = ref<Record<string, string>>({});
const telegramToken = ref('');
const telegramChatId = ref('');
/** Explicit routing flags; ids absent here render checked (legacy !== false). */
const routing = ref<Record<string, boolean>>({});
/** Legacy togglePw: the token input flips password ↔ text and lights the eye. */
const tokenVisible = ref(false);

const saveMsg = ref('');
const saveMsgIsError = ref(false);
const saveMsgVisible = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** Legacy applySettings('api-server'): fill the form from the payload. */
function applySettings(data: ApiServerSettingsData): void {
  host.value = data.host || '0.0.0.0';
  port.value = String(data.port || 8000);
  autoRestart.value = data.auto_restart !== false;
  availableHosts.value = data.available_hosts || [];
  enabledHosts.value = data.enabled_hosts || [];

  const config: Record<string, string> = {};
  for (const field of MONITOR_FIELDS) {
    const value = data.monitor_config?.[field];
    if (value !== undefined) config[field] = String(value);
  }
  monitorConfig.value = config;

  telegramToken.value = data.telegram_token || '';
  telegramChatId.value = data.telegram_chat_id || '';

  const flags: Record<string, boolean> = {};
  for (const id of ROUTING_IDS) {
    if (data[id] !== undefined) flags[id] = Boolean(data[id]);
  }
  routing.value = flags;
  loaded.value = true;
}

/** Legacy loadSettings('api-server'): GET /settings/api-server, silent on failure. */
async function load(): Promise<void> {
  try {
    applySettings(await apiFetch<ApiServerSettingsData>(`${apiBase()}/settings/api-server`));
  } catch {
    /* legacy .catch(function () {}) keeps the loading placeholder */
  }
}

/** Legacy togglePw: swap the input type and toggle the eye button color. */
function toggleTokenVisibility(): void {
  tokenVisible.value = !tokenVisible.value;
}

/** Legacy _flash: show the message, drop the visible class after 3s. */
function flash(text: string, isError: boolean): void {
  saveMsg.value = text;
  saveMsgIsError.value = isError;
  saveMsgVisible.value = true;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    saveMsgVisible.value = false;
  }, FLASH_MS);
}

/** Legacy collectMonitorConfigFromForm: parseFloat(value) || 0 for each field. */
function collectMonitorConfig(): Record<string, number> {
  const body: Record<string, number> = {};
  for (const field of MONITOR_FIELDS) {
    body[field] = parseFloat(monitorConfig.value[field] ?? '') || 0;
  }
  return body;
}

/** Legacy collectAlertRoutingFromForm: !!checked for each of the 13 ids. */
function collectAlertRouting(): Record<AlertRoutingId, boolean> {
  const body = {} as Record<AlertRoutingId, boolean>;
  for (const id of ROUTING_IDS) body[id] = routing.value[id] !== false;
  return body;
}

/** Legacy saveApiServerSettings: assemble the body and POST /settings/api-server. */
function save(): void {
  const body: Record<string, unknown> = {
    host: host.value || '0.0.0.0',
    port: parseInt(port.value || '8000', 10),
    auto_restart: autoRestart.value,
    enabled_hosts: enabledHosts.value,
    monitor_config: collectMonitorConfig(),
    telegram_token: telegramToken.value,
    telegram_chat_id: telegramChatId.value,
    ...collectAlertRouting(), // legacy Object.assign(body, collectAlertRoutingFromForm())
  };

  apiFetch<PbDataSaveResponse>(`${apiBase()}/settings/api-server`, { method: 'POST', body: JSON.stringify(body) })
    .then((data) => {
      // Legacy _post: apply.message wins, then common.saved; !ok → detail/common.error.
      const message = data?.apply && data.apply.message ? serverMsg(String(data.apply.message)) : t('common.saved');
      flash(data.ok ? message : data.detail ? serverMsg(data.detail) : t('common.error'), !data.ok);
    })
    .catch((error: unknown) => {
      // apiFetch folds non-ok JSON bodies into ApiError(detail) — the legacy
      // !ok detail branch; transport failures keep the errorPrefix shape.
      if (error instanceof ApiError) flash(error.detail ? serverMsg(error.detail) : t('common.error'), true);
      else flash(t('sysmon.errorPrefix', { msg: serverMsg((error as Error).message) }), true);
    });
}

onUnmounted(() => clearTimeout(flashTimer));

defineExpose({ load });
</script>

<template>
  <div class="settings-wrap" id="apiserver-settings-wrap">
    <div v-if="!loaded" class="settings-loading">{{ t('sysmon.loadingSettings') }}</div>
    <template v-else>
      <div class="form-section-title">{{ t('sysmon.connection') }}</div>
      <div class="form-row">
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.bindAddress') }}</span>
          <input class="form-input medium" type="text" id="apiserver-host" placeholder="0.0.0.0" v-model="host" />
          <span class="form-hint">{{ t('sysmon.requiresRestart') }}</span>
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.port') }}</span>
          <input
            class="form-input narrow"
            type="number"
            id="apiserver-port"
            min="1024"
            max="65535"
            step="1"
            v-model="port"
          />
          <span class="form-hint">{{ t('sysmon.defaultPort') }}</span>
        </div>
      </div>

      <hr class="form-divider" />
      <div class="form-section-title">{{ t('sysmon.vpsMonitoring') }}</div>
      <div class="auto-restart-row">
        <input type="checkbox" id="apiserver-auto-restart" v-model="autoRestart" />
        <label for="apiserver-auto-restart">{{ t('sysmon.autoRestartServices') }}</label>
      </div>
      <div class="form-field hosts-field">
        <span class="form-label">{{ t('sysmon.monitoredVpsHosts') }} <span class="label-hint">{{ t('sysmon.clickToToggle') }}</span></span>
        <MultiselectTags
          id="vps-hosts-select"
          :options="availableHosts"
          v-model="enabledHosts"
          :filterable="false"
          empty-key="sysmon.noVpsHosts"
        />
      </div>
      <MonitorThresholds v-model:monitor-config="monitorConfig" />
      <hr class="form-divider" />
      <div class="form-section-title">{{ t('sysmon.alertsTelegram') }}</div>
      <div class="form-row telegram-row">
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.botToken') }}</span>
          <div class="pw-wrap">
            <input
              class="form-input token-input"
              :type="tokenVisible ? 'text' : 'password'"
              id="apiserver-telegram-token"
              :placeholder="t('sysmon.pasteToken')"
              autocomplete="off"
              v-model="telegramToken"
            />
            <button
              class="pw-eye"
              type="button"
              :title="t('sysmon.showHide')"
              :aria-label="t('sysmon.showHide')"
              :style="tokenVisible ? 'color: #93c5fd' : undefined"
              @click="toggleTokenVisibility"
            ><PbIcon :icon="PhEye" /></button>
          </div>
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.chatId') }}</span>
          <input
            class="form-input medium"
            type="text"
            id="apiserver-telegram-chat-id"
            :placeholder="t('sysmon.chatIdExample')"
            v-model="telegramChatId"
          />
        </div>
      </div>
      <AlertRouting v-model:routing="routing" />
      <div class="save-row">
        <button class="form-btn save" type="button" @click="save"><PbIcon :icon="PhFloppyDisk" /> {{ t('common.save') }}</button>
        <span
          class="inline-msg"
          id="apiserver-save-msg"
          :class="{ visible: saveMsgVisible, error: saveMsgIsError }"
        >{{ saveMsg }}</span>
      </div>
    </template>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (settings-wrap + the
     static api-server settings markup, inline styles promoted to classes). -->
<style scoped>
.settings-wrap { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.settings-loading { color: #4e4851; font-style: italic; }
.form-section-title { font-size: var(--fs-sm); font-weight: 700; color: #a29ca6; margin: 0 0 0.5rem; }
.form-divider { border: none; border-top: 1px solid #29262c; margin: 1rem 0; }
.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.form-field { display: flex; flex-direction: column; gap: 3px; }
.form-label { font-size: var(--fs-xs); color: #716b75; text-transform: uppercase; letter-spacing: 0.04em; }
.label-hint { color: #4e4851; font-weight: 400; }
.form-hint { font-size: var(--fs-xs); color: #4e4851; }
.form-input {
  background: #1f1d21; color: #eae7ea; border: 1px solid #37333a; border-radius: 5px;
  padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none;
}
.form-input:focus { border-color: #4e4851; }
.form-input.medium { width: 140px; }
.form-input.narrow { width: 90px; }
.auto-restart-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem; }
.auto-restart-row input { accent-color: #4da6ff; cursor: pointer; width: 15px; height: 15px; }
.auto-restart-row label { color: #a29ca6; font-size: var(--fs-sm); cursor: pointer; }
.hosts-field { margin-bottom: 0; }
.telegram-row { margin-bottom: 0; }
.pw-wrap { position: relative; display: inline-flex; align-items: center; }
.pw-wrap input { padding-right: 2rem; }
.token-input { width: 370px; }
.pw-eye { position: absolute; right: 0.4rem; background: none; border: none; cursor: pointer; color: #716b75; font-size: 1rem; line-height: 1; padding: 0; }
.pw-eye:hover { color: #a29ca6; }
.save-row { margin-top: 1rem; }
.form-btn { padding: 0 1rem; height: var(--btn-h); border-radius: 5px; border: 1px solid #37333a; background: #1f1d21; color: #a29ca6; cursor: pointer; font-size: var(--fs-sm); font-family: inherit; transition: all 0.12s; }
.form-btn:hover { border-color: #4e4851; color: #eae7ea; }
.form-btn.save { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
.form-btn.save:hover { background: #1d4ed8; color: #fff; }
.inline-msg { font-size: var(--fs-xs); color: #4ade80; margin-left: 0.5rem; opacity: 0; transition: opacity 0.3s; }
.inline-msg.visible { opacity: 1; }
.inline-msg.error { color: #fca5a5; }
</style>
