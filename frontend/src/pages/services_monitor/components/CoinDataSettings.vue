<script setup lang="ts">
/*
 * PBCoinData settings pane, ported 1:1 from the legacy static Intervals markup
 * plus the applySettings('pbcoindata') / saveCoinDataSettings code in
 * frontend/services_monitor.html: the four interval number fields (fetch
 * interval 1-24h, fetch limit 200-5000 step 200, metadata interval 1-7d,
 * mapping interval 1-168h) and the Save button with its inline flash message
 * (_post/_flash).
 *
 * Loading follows the legacy _settingsLoaded gate: the App shell calls load()
 * once on first settings-tab activation; until the GET resolves the loading
 * placeholder stays visible (load failures are silent). The legacy page showed
 * the empty static form immediately — the placeholder matches the pbdata pane
 * pattern adopted by this migration.
 */
import { onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ApiError, apiFetch } from '@/shared/api';
import { serverMsg } from '@/shared/i18n';
import { apiBase } from '../config';
import type { CoinDataSettingsData, PbDataSaveResponse } from '../types';

/** Legacy _flash timeout before the inline message fades. */
const FLASH_MS = 3000;

const { t } = useI18n();

/** Legacy #coindata-settings-wrap loading placeholder state. */
const loaded = ref(false);
const fetchInterval = ref('');
const fetchLimit = ref('');
const metadataInterval = ref('');
const mappingInterval = ref('');

const saveMsg = ref('');
const saveMsgIsError = ref(false);
const saveMsgVisible = ref(false);
let flashTimer: ReturnType<typeof setTimeout> | undefined;

/** Legacy applySettings('pbcoindata'): fill the fields with `value || default`. */
function applySettings(data: CoinDataSettingsData): void {
  fetchInterval.value = String(data.fetch_interval || 24);
  fetchLimit.value = String(data.fetch_limit || 5000);
  metadataInterval.value = String(data.metadata_interval || 1);
  mappingInterval.value = String(data.mapping_interval || 24);
  loaded.value = true;
}

/** Legacy loadSettings('pbcoindata'): GET /settings/pbcoindata, silent on failure. */
async function load(): Promise<void> {
  try {
    applySettings(await apiFetch<CoinDataSettingsData>(`${apiBase()}/settings/pbcoindata`));
  } catch {
    /* legacy .catch(function () {}) leaves the form untouched */
  }
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

/** Legacy saveCoinDataSettings: parseInt(value || fallback, 10) per field. */
function save(): void {
  const body = {
    fetch_interval: parseInt(fetchInterval.value || '24', 10),
    fetch_limit: parseInt(fetchLimit.value || '5000', 10),
    metadata_interval: parseInt(metadataInterval.value || '1', 10),
    mapping_interval: parseInt(mappingInterval.value || '24', 10),
  };

  apiFetch<PbDataSaveResponse>(`${apiBase()}/settings/pbcoindata`, { method: 'POST', body: JSON.stringify(body) })
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
  <div class="settings-wrap" id="coindata-settings-wrap">
    <div v-if="!loaded" class="settings-loading">{{ t('sysmon.loadingSettings') }}</div>
    <template v-else>
      <div class="form-section-title">{{ t('sysmon.intervals') }}</div>
      <div class="form-row">
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.fetchInterval') }}</span>
          <input class="form-input narrow" type="number" id="coindata-fetch-interval" min="1" max="24" step="1" v-model="fetchInterval" />
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.fetchLimit') }}</span>
          <input class="form-input narrow" type="number" id="coindata-fetch-limit" min="200" max="5000" step="200" v-model="fetchLimit" />
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.metadataInterval') }}</span>
          <input class="form-input narrow" type="number" id="coindata-metadata-interval" min="1" max="7" step="1" v-model="metadataInterval" />
        </div>
        <div class="form-field">
          <span class="form-label">{{ t('sysmon.mappingInterval') }}</span>
          <input class="form-input narrow" type="number" id="coindata-mapping-interval" min="1" max="168" step="1" v-model="mappingInterval" />
        </div>
      </div>
      <button class="form-btn save" type="button" @click="save">&#128190; {{ t('common.save') }}</button>
      <span
        class="inline-msg"
        id="coindata-save-msg"
        :class="{ visible: saveMsgVisible, error: saveMsgIsError }"
      >{{ saveMsg }}</span>
    </template>
  </div>
</template>

<!-- Styles ported from frontend/services_monitor.html (settings-wrap + the
     static pbcoindata interval markup). -->
<style scoped>
.settings-wrap { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.settings-loading { color: #4a5568; font-style: italic; }
.form-section-title { font-size: var(--fs-sm); font-weight: 700; color: #94a3b8; margin: 0 0 0.5rem; }
.form-row { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1rem; }
.form-field { display: flex; flex-direction: column; gap: 3px; }
.form-label { font-size: var(--fs-xs); color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
.form-input {
  background: #1a202c; color: #e2e8f0; border: 1px solid #2d3748; border-radius: 5px;
  padding: 0 0.5rem; height: var(--input-h); font-size: var(--fs-sm); font-family: inherit; outline: none;
}
.form-input:focus { border-color: #4a5568; }
.form-input.narrow { width: 90px; }
.form-btn { padding: 0 1rem; height: var(--btn-h); border-radius: 5px; border: 1px solid #2d3748; background: #1a202c; color: #94a3b8; cursor: pointer; font-size: var(--fs-sm); font-family: inherit; transition: all 0.12s; }
.form-btn:hover { border-color: #4a5568; color: #e2e8f0; }
.form-btn.save { background: #1e3a5f; border-color: #2563eb; color: #93c5fd; }
.form-btn.save:hover { background: #1d4ed8; color: #fff; }
.inline-msg { font-size: var(--fs-xs); color: #4ade80; margin-left: 0.5rem; opacity: 0; transition: opacity 0.3s; }
.inline-msg.visible { opacity: 1; }
.inline-msg.error { color: #fca5a5; }
</style>
