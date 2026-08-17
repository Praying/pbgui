<script setup lang="ts">
/**
 * Copy-config-to-user modal — v7_edit.html:1193-1210 markup, openCopyUserModal
 * (:2985-3020) and doCopyToUser (:3028-3112): target-user select (source user
 * and the instance itself excluded), PUT /instances/{name}/copy-config with
 * the collected config (user swapped, enabled_on disabled) + override files,
 * 409 "Update your VPS first" → PBGuiDialogs.alert(copyBlocked).
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useEditPageContext } from '../composables/useEditPage';
import { serverMsg } from '@/shared/i18n';
import { dialogsAlert } from '../lib/dialogs';

const { t } = useI18n();
const page = useEditPageContext();

const open = defineModel<boolean>({ required: true });
const targetUser = ref('');
const error = ref<{ summary: string; message: string } | null>(null);
const busy = ref(false);

const targetOptions = computed(() =>
  page.users.value
    .filter((user) => user.name && user.name !== page.state.user && user.name !== page.instanceName.value)
    .map((user) => user.name)
);

const unavailable = computed(() => page.isNew.value);
const canSubmit = computed(() => !unavailable.value && targetOptions.value.length > 0 && !busy.value);

function show(): void {
  error.value = unavailable.value
    ? { summary: t('v7run.copyUnavailable'), message: t('v7run.saveNewBeforeCopy') }
    : targetOptions.value.length === 0
      ? { summary: t('v7run.noTargetUser'), message: t('v7run.addUserBeforeCopy', { label: page.isV8 ? 'PB8' : 'PB7' }) }
      : null;
  targetUser.value = '';
  open.value = true;
}

function close(): void {
  open.value = false;
  error.value = null;
}

async function copy(): Promise<void> {
  if (!canSubmit.value) return;
  busy.value = true;
  try {
    await page.symbolsTags.whenSettled();
    if (!page.validateForSave()) return;
    if (page.isNew.value) throw new Error(t('v7run.saveNewBeforeCopy'));
    if (!targetUser.value) throw new Error(t('v7run.selectTargetUser'));
    if (targetUser.value === page.state.user) throw new Error(t('v7run.targetUserDifferent'));

    const config = JSON.parse(JSON.stringify(page.collect())) as Record<string, Record<string, unknown>>;
    config.live = { ...(config.live ?? {}), user: targetUser.value };
    config.pbgui = { ...(config.pbgui ?? {}), enabled_on: 'disabled' };
    const overrideConfigs = page.isV8 ? await page.coinOverrides.snapshotAllFiles() : {};

    const resp = await fetch(
      page.apiBaseOf() + '/instances/' + encodeURIComponent(page.instanceName.value) + '/copy-config',
      {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_user: targetUser.value, config, override_configs: overrideConfigs }),
      }
    );
    const data = (await resp.json().catch(() => ({}))) as {
      version?: number;
      sync?: { ok?: number; failed?: number };
      override_copy?: { copied?: string[]; missing?: string[] };
      detail?: unknown;
    };
    if (!resp.ok) {
      const detail = typeof data.detail === 'string' ? data.detail : resp.statusText || t('v7run.copyFailed');
      if (resp.status === 409 && detail.startsWith('Update your VPS first')) {
        if (!dialogsAlert({ title: t('v7run.copyBlocked'), message: serverMsg(detail), confirmText: t('common.ok') })) {
          error.value = { summary: t('v7run.copyBlocked'), message: serverMsg(detail) };
        }
      } else {
        error.value = { summary: t('v7run.copyFailed'), message: serverMsg(detail) };
      }
      return;
    }
    const syncOk = data.sync?.ok ?? 0;
    const syncFail = data.sync?.failed ?? 0;
    let suffix = '';
    if (syncOk > 0) suffix = t('v7run.sshSyncOk', { count: syncOk });
    else if (syncFail > 0) suffix = t('v7run.sshSyncFailed', { count: syncFail });
    const copied = data.override_copy?.copied?.length ?? 0;
    const missing = data.override_copy?.missing?.length ?? 0;
    if (copied > 0) suffix += t('v7run.overridesCount', { count: copied });
    close();
    if (missing > 0) {
      page.notify(t('v7run.copiedWithMissingOverrides', { user: targetUser.value, missing }) + suffix, 'err');
    } else {
      page.notify(t('v7run.copiedDisabledVersion', { user: targetUser.value, version: data.version ?? '' }) + suffix, 'ok');
    }
  } catch (e) {
    error.value = { summary: t('v7run.copyFailed'), message: e instanceof Error ? e.message : String(e) };
  } finally {
    busy.value = false;
  }
}

defineExpose({ show });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay open" id="copy-user-modal" @mousedown.self="close">
      <div class="modal-box" style="max-width: 520px">
        <h3>{{ t('v7run.copyConfigToUser') }}</h3>
        <div style="color: var(--text-dim); font-size: var(--fs-sm); line-height: 1.45">
          {{ t('v7run.copyConfigToUserDesc') }}
        </div>
        <div class="form-group">
          <label>{{ t('v7run.targetUser') }}</label>
          <select id="copy-user" v-model="targetUser" :disabled="unavailable">
            <option v-for="user in targetOptions" :key="user" :value="user">{{ user }}</option>
          </select>
        </div>
        <div v-if="error" class="field-status field-status-inline error" aria-live="polite">
          <div class="field-status-main">{{ error.summary }}</div>
          <div class="field-status-meta">{{ error.message }}</div>
        </div>
        <div class="modal-actions">
          <button class="btn btn-ok" id="btn-copy-user-ok" :disabled="!canSubmit" @click="copy()">
            <span v-if="busy" class="spinner"></span> {{ busy ? t('v7run.copying') : t('v7run.copy') }}
          </button>
          <button class="btn btn-cancel" @click="close()">{{ t('common.cancel') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
