<script setup lang="ts">
/*
 * Edit/Create panel (:709-827 markup): masked credential fields with
 * reveal-on-eye (reveal-key POST, generation-guarded), exchange-dependent
 * field groups, HL/Bybit inline expiry checks, advanced JSON options,
 * validation, rename+save, delete, and connection testing.
 * Legacy logic :1493-2259.
 */
import { computed, reactive, ref } from 'vue';
import { PhArrowClockwise, PhCaretDown, PhCaretRight, PhEye, PhEyeSlash } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import BackButton from './BackButton.vue';
import ExpiryBadge from './ExpiryBadge.vue';
import { pageFetch } from '../lib/pageApi';
import { confirmDialog } from '../lib/dialogs';
import { hasSavedValue, maskedFieldValue, newMaskedField } from '../lib/masked';
import { injectToasts } from '../composables/useToasts';
import type { ApiKeysStore } from '../composables/useApiKeysStore';
import type { BybitExpiryInfo, ConnectionTestResult, HlExpiryInfo, UserDetail, UserSaveData } from '../types';

const props = defineProps<{ store: ApiKeysStore }>();

const emit = defineEmits<{ (e: 'back'): void; (e: 'users-changed'): void }>();

const { t } = useI18n();
const toasts = injectToasts();
const store = props.store;

const editMode = ref<'create' | 'edit' | null>(null);
const editingName = ref<string | null>(null);
const panelUser = ref<UserDetail | null>(null);
const formDirty = ref(false);

const name = ref('');
const exchange = ref('');
const originalExchange = ref('');
const wallet = ref('');
const isVault = ref(false);
const quote = ref('');
const optionsText = ref('');
const extraText = ref('');
const advancedOpen = ref(false);

const keyField = reactive(newMaskedField(''));
const secretField = reactive(newMaskedField(''));
const passphraseField = reactive(newMaskedField(''));
const privateKeyField = reactive(newMaskedField(''));

const secretVisible = ref(false);
let apiKeyRevealGeneration = 0;

const saving = ref(false);
const testing = ref(false);

const balance = ref<{ visible: boolean; success: boolean; value: number | null; error: string }>({
  visible: false,
  success: false,
  value: null,
  error: '',
});

const hlInline = ref<{ exp: HlExpiryInfo | null; dateText: string; errorText: string }>({ exp: null, dateText: '', errorText: '' });
const bybitInline = ref<{ exp: BybitExpiryInfo | null; dateText: string; ips: string[] | null; errorText: string }>({
  exp: null,
  dateText: '',
  ips: null,
  errorText: '',
});
const checkingHl = ref(false);
const checkingBybit = ref(false);

const isEdit = computed(() => editMode.value === 'edit');
const isHL = computed(() => exchange.value === 'hyperliquid');
const isBybit = computed(() => exchange.value === 'bybit');
const needsPassphrase = computed(() => store.passphraseExchanges.value.includes(exchange.value));
const title = computed(() => (isEdit.value ? t('misc.apikeys.editPrefix', { name: name.value }) : t('misc.apikeys.newUser')));
const lockedByInUse = computed(() => isEdit.value && Boolean(panelUser.value?.in_use));
const deleteVisible = computed(() => isEdit.value && !panelUser.value?.in_use);
const savedLeaveBlank = computed(() => t('misc.apikeys.savedLeaveBlank'));

defineExpose({
  openEdit,
  openCreate,
  confirmDelete,
  formDirty,
  clearRevealedApiKey,
  clearSecretInputs,
  /** Currently edited user name — read by the AI page context (null = create form). */
  editingName,
});

/* ── open / populate (:1494-1604) ── */

async function openEdit(userName: string): Promise<boolean> {
  try {
    const user = await pageFetch<UserDetail>('/' + encodeURIComponent(userName));
    editMode.value = 'edit';
    editingName.value = userName;
    location.hash = '#edit/' + encodeURIComponent(userName);
    showPanel(user);
    return true;
  } catch (e) {
    toasts.showToast(t('misc.apikeys.failedToLoadUser', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
    return false;
  }
}

function openCreate(): void {
  editMode.value = 'create';
  editingName.value = null;
  showPanel({
    name: '',
    exchange: store.exchanges.value[0] || 'binance',
    in_use: false,
  });
}

function resetField(field: typeof keyField, masked: string): void {
  Object.assign(field, newMaskedField(masked));
}

function showPanel(user: UserDetail): void {
  clearRevealedApiKey();
  formDirty.value = false;
  panelUser.value = user;
  name.value = user.name || '';
  exchange.value = user.exchange || store.exchanges.value[0] || 'binance';
  originalExchange.value = exchange.value;
  resetField(keyField, isEdit.value ? user.key_masked || '' : '');
  resetField(secretField, isEdit.value ? user.secret_masked || '' : '');
  resetField(passphraseField, isEdit.value ? user.passphrase_masked || '' : '');
  resetField(privateKeyField, isEdit.value ? user.private_key_masked || '' : '');
  wallet.value = user.wallet_address || '';
  isVault.value = user.is_vault || false;
  quote.value = user.quote || '';
  optionsText.value = user.options ? JSON.stringify(user.options, null, 2) : '';
  extraText.value = user.extra ? JSON.stringify(user.extra, null, 2) : '';
  advancedOpen.value = false;
  secretVisible.value = false;
  balance.value = { visible: false, success: false, value: null, error: '' };

  if (user.exchange === 'hyperliquid' && isEdit.value) {
    const cached = store.hlExpiryData.value[user.name ?? ''];
    hlInline.value = {
      exp:
        cached ||
        {
          name: user.name ?? '',
          status: (user.hl_expiry_status || null) as HlExpiryInfo['status'],
          days_remaining: user.hl_days_remaining ?? null,
          valid_until_iso: user.hl_valid_until_iso ?? null,
          error: null,
        },
      dateText: '',
      errorText: '',
    };
  } else {
    hlInline.value = { exp: null, dateText: '', errorText: '' };
  }

  if (user.exchange === 'bybit' && isEdit.value) {
    const cached = store.bybitExpiryData.value[user.name ?? ''];
    bybitInline.value = {
      exp:
        cached ||
        {
          name: user.name ?? '',
          status: (user.bybit_expiry_status || null) as BybitExpiryInfo['status'],
          days_remaining: user.bybit_days_remaining ?? null,
          expires_at_iso: user.bybit_expires_at_iso ?? null,
          ips: null,
          error: null,
        },
      dateText: '',
      ips: cached ? cached.ips : null,
      errorText: '',
    };
  } else {
    bybitInline.value = { exp: null, dateText: '', ips: null, errorText: '' };
  }

  onExchangeChange();
}

/* ── exchange change (:1606-1627) ── */

function onExchangeChange(): void {
  if (isEdit.value && exchange.value !== originalExchange.value) {
    clearRevealedApiKey();
    resetField(keyField, '');
    resetField(secretField, '');
    resetField(passphraseField, '');
    resetField(privateKeyField, '');
    wallet.value = '';
    isVault.value = false;
  }
}

/* ── inline expiry checks (:1629-1709) ── */

function updateHlInline(exp: HlExpiryInfo | null): void {
  hlInline.value = {
    exp,
    dateText: exp && exp.valid_until_iso ? t('misc.apikeys.expires', { date: exp.valid_until_iso.split('T')[0] }) : '',
    errorText: '',
  };
}

function updateBybitInline(exp: BybitExpiryInfo | null, ips: string[] | null): void {
  bybitInline.value = {
    exp,
    dateText: exp && exp.expires_at_iso && exp.status !== 'no_expiry' ? t('misc.apikeys.expires', { date: exp.expires_at_iso.split('T')[0] }) : '',
    ips,
    errorText: '',
  };
}

async function checkSingleHlExpiry(): Promise<void> {
  if (!editingName.value) return;
  checkingHl.value = true;
  try {
    // Unsaved private keys travel only in the POST body, never the URL (:1645-1651)
    const unsavedKey = maskedFieldValue(privateKeyField);
    const data = await pageFetch<HlExpiryInfo>('/' + encodeURIComponent(editingName.value) + '/hl-expiry', unsavedKey ? {
      method: 'POST',
      body: JSON.stringify({ private_key: unsavedKey }),
    } : {});
    if (!unsavedKey && editingName.value) {
      store.hlExpiryData.value = { ...store.hlExpiryData.value, [editingName.value]: data };
    }
    updateHlInline(data);
  } catch (e) {
    hlInline.value = { ...hlInline.value, exp: null, errorText: t('misc.apikeys.errorPrefix', { error: serverMsg(e instanceof Error ? e.message : '') }) };
  } finally {
    checkingHl.value = false;
  }
}

async function checkSingleBybitExpiry(): Promise<void> {
  if (!editingName.value) return;
  checkingBybit.value = true;
  try {
    const data = await pageFetch<BybitExpiryInfo>('/' + encodeURIComponent(editingName.value) + '/bybit-expiry');
    if (editingName.value) {
      store.bybitExpiryData.value = { ...store.bybitExpiryData.value, [editingName.value]: data };
    }
    updateBybitInline(data, data.ips);
  } catch (e) {
    bybitInline.value = { ...bybitInline.value, exp: null, errorText: t('misc.apikeys.errorPrefix', { error: serverMsg(e instanceof Error ? e.message : '') }) };
  } finally {
    checkingBybit.value = false;
  }
}

/* ── reveal-key (:2203-2259) ── */

async function toggleApiKeyVisible(): Promise<void> {
  if (keyField.visible) {
    if (keyField.revealed) clearRevealedApiKey();
    else keyField.visible = false;
    return;
  }
  if (keyField.value) {
    keyField.visible = true;
    return;
  }
  if (!editingName.value || editMode.value !== 'edit') {
    keyField.visible = true;
    return;
  }
  try {
    const requestedName = editingName.value;
    const generation = ++apiKeyRevealGeneration;
    const data = await pageFetch<{ value?: string }>('/reveal-key', {
      method: 'POST',
      cache: 'no-store',
      body: JSON.stringify({ name: requestedName }),
    });
    if (generation !== apiKeyRevealGeneration || editMode.value !== 'edit' || editingName.value !== requestedName) return;
    keyField.value = data.value || '';
    keyField.revealed = true;
    keyField.visible = true;
  } catch (e) {
    toasts.showToast(t('misc.apikeys.couldNotRevealApiKey', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}

function clearRevealedApiKey(): void {
  apiKeyRevealGeneration += 1;
  if (keyField.revealed) keyField.value = '';
  keyField.revealed = false;
  keyField.visible = false;
}

/** pagehide secret hygiene (:2253-2259). */
function clearSecretInputs(): void {
  clearRevealedApiKey();
  keyField.value = '';
  secretField.value = '';
  passphraseField.value = '';
  privateKeyField.value = '';
}

function onKeyInput(): void {
  apiKeyRevealGeneration += 1;
  keyField.revealed = false;
}

/* ── save (:1822-1954) ── */

async function save(): Promise<void> {
  const userName = name.value.trim();
  if (!userName) {
    toasts.showToast(t('misc.apikeys.usernameRequired'), 'error');
    return;
  }

  const isCreate = editMode.value === 'create';

  if (isHL.value) {
    if (!wallet.value.trim()) {
      toasts.showToast(t('misc.apikeys.walletAddressRequired'), 'error');
      return;
    }
    const pkVal = maskedFieldValue(privateKeyField);
    const pkAlreadySaved = !isCreate && hasSavedValue(privateKeyField);
    if (pkVal === '' || (!pkVal && !pkAlreadySaved)) {
      toasts.showToast(t('misc.apikeys.privateKeyRequired'), 'error');
      return;
    }
  } else {
    const apiKey = maskedFieldValue(keyField);
    const apiKeyAlreadySaved = !isCreate && hasSavedValue(keyField);
    if (!apiKey && !apiKeyAlreadySaved) {
      toasts.showToast(t('misc.apikeys.apiKeyRequired'), 'error');
      return;
    }
    const secretVal = maskedFieldValue(secretField);
    const secretAlreadySaved = !isCreate && hasSavedValue(secretField);
    if (secretVal === '' || (!secretVal && !secretAlreadySaved)) {
      toasts.showToast(t('misc.apikeys.apiSecretRequired'), 'error');
      return;
    }
    if (needsPassphrase.value) {
      const ppVal = maskedFieldValue(passphraseField);
      const ppAlreadySaved = !isCreate && hasSavedValue(passphraseField);
      if (ppVal === '' || (!ppVal && !ppAlreadySaved)) {
        toasts.showToast(t('misc.apikeys.passphraseRequired', { exchange: exchange.value }), 'error');
        return;
      }
    }
  }

  let options: unknown = null;
  let extra: unknown = null;
  const optionsRaw = optionsText.value.trim();
  const extraRaw = extraText.value.trim();
  if (optionsRaw) {
    try {
      options = JSON.parse(optionsRaw);
    } catch {
      toasts.showToast(t('misc.apikeys.invalidJsonOptions'), 'error');
      return;
    }
  }
  if (extraRaw) {
    try {
      extra = JSON.parse(extraRaw);
    } catch {
      toasts.showToast(t('misc.apikeys.invalidJsonExtra'), 'error');
      return;
    }
  }

  const data: UserSaveData = {
    exchange: exchange.value,
    key: isHL.value ? null : maskedFieldValue(keyField),
    secret: isHL.value ? null : maskedFieldValue(secretField),
    passphrase: needsPassphrase.value ? maskedFieldValue(passphraseField) : null,
    wallet_address: isHL.value ? wallet.value || null : null,
    private_key: isHL.value ? maskedFieldValue(privateKeyField) : null,
    is_vault: isHL.value ? isVault.value : false,
    quote: quote.value || null,
    options,
    extra,
  };

  saving.value = true;
  try {
    if (editMode.value === 'create') {
      await pageFetch('/', { method: 'POST', body: JSON.stringify({ name: userName, data }) });
      toasts.showToast(t('misc.apikeys.userCreated', { name: userName }), 'success');
    } else {
      let currentName = editingName.value ?? userName;
      if (userName !== editingName.value) {
        await pageFetch('/' + encodeURIComponent(editingName.value ?? '') + '/rename', {
          method: 'PATCH',
          body: JSON.stringify({ new_name: userName }),
        });
        currentName = userName;
      }
      await pageFetch('/' + encodeURIComponent(currentName), { method: 'PUT', body: JSON.stringify(data) });
      toasts.showToast(t('misc.apikeys.userUpdated', { name: userName }), 'success');
    }
    const savedName = editMode.value === 'create' ? userName : editingName.value ?? userName;
    store.clearExpiryFor(savedName);
    formDirty.value = false;
    emit('back');
    emit('users-changed');
    await store.loadUsers();
    // Background expiry refresh so the table shows the real expiry without
    // an extra manual click (:1941-1947)
    if (data.private_key && data.exchange === 'hyperliquid') {
      const bgUser = savedName;
      pageFetch<HlExpiryInfo>('/' + encodeURIComponent(bgUser) + '/hl-expiry')
        .then((d) => {
          store.hlExpiryData.value = { ...store.hlExpiryData.value, [bgUser]: d };
        })
        .catch(() => {});
    }
  } catch (e) {
    toasts.showToast(t('misc.apikeys.saveFailed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  } finally {
    saving.value = false;
  }
}

/* ── delete (:1956-1988) ── */

async function doDelete(userName: string): Promise<void> {
  try {
    await pageFetch('/' + encodeURIComponent(userName), { method: 'DELETE' });
    toasts.showToast(t('misc.apikeys.userDeleted', { name: userName }), 'success');
    formDirty.value = false;
    emit('back');
    emit('users-changed');
    await store.loadUsers();
  } catch (e) {
    toasts.showToast(t('misc.apikeys.deleteFailed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  }
}

async function confirmDelete(userName: string): Promise<void> {
  if (
    !(await confirmDialog({
      title: t('misc.apikeys.deleteUserTitle'),
      message: t('misc.apikeys.deleteUserMessage', { name: userName }),
      detail: t('misc.apikeys.cannotBeUndone'),
      confirmText: t('common.delete'),
    }))
  )
    return;
  await doDelete(userName);
}

/* ── test connection (:1991-2049) ── */

async function testConnection(): Promise<void> {
  const userName = editMode.value === 'edit' ? editingName.value : name.value.trim();
  if (!userName || editMode.value === 'create') {
    toasts.showToast(t('misc.apikeys.saveBeforeTesting'), 'warning');
    return;
  }

  testing.value = true;
  const override: Record<string, string> = {};
  if (!isHL.value) {
    const keyVal = maskedFieldValue(keyField);
    if (keyVal) override.key = keyVal;
    const secretVal = maskedFieldValue(secretField);
    if (secretVal) override.secret = secretVal;
    const ppVal = maskedFieldValue(passphraseField);
    if (ppVal) override.passphrase = ppVal;
  } else {
    const walletVal = wallet.value.trim();
    if (walletVal) override.wallet_address = walletVal;
    const pkVal = maskedFieldValue(privateKeyField);
    if (pkVal) override.private_key = pkVal;
  }
  const hasOverride = Object.keys(override).length > 0;

  try {
    const result = await pageFetch<ConnectionTestResult>('/' + encodeURIComponent(userName) + '/test', {
      method: 'POST',
      body: hasOverride ? JSON.stringify(override) : undefined,
    });
    if (result.success) {
      balance.value = { visible: true, success: true, value: result.balance_futures ?? null, error: '' };
      toasts.showToast(t('misc.apikeys.connectionSuccessful'), 'success');
    } else {
      balance.value = {
        visible: true,
        success: false,
        value: null,
        error: serverMsg(result.error || '') || t('common.unknown'),
      };
      toasts.showToast(t('misc.apikeys.connectionFailed'), 'error');
    }
  } catch (e) {
    toasts.showToast(t('misc.apikeys.testFailed', { error: serverMsg(e instanceof Error ? e.message : '') }), 'error');
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div id="editPanel" class="edit-panel mx-auto mb-5 w-[min(100%,1500px)] rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3" @input="formDirty = true" @change="formDirty = true">
    <div class="border-b border-border-subtle pb-3" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 id="editPanelTitle" class="text-lg tracking-tight text-primary" style="margin:0;">{{ title }}</h3>
    </div>
    <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1">
      <div class="form-group flex flex-col gap-1.5">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.username') }}</label>
        <input type="text" id="editName" class="min-h-[34px] px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" v-model="name" maxlength="32" :disabled="lockedByInUse" />
      </div>
      <div class="form-group flex flex-col gap-1.5">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.exchange') }}</label>
        <select id="editExchange" class="min-h-[34px] px-2.5 py-1.5 disabled:cursor-not-allowed disabled:opacity-50" v-model="exchange" :disabled="lockedByInUse" @change="onExchangeChange">
          <option v-for="ex in store.exchanges.value" :key="ex" :value="ex">{{ ex }}</option>
        </select>
      </div>
      <div class="form-group flex flex-col gap-1.5" id="testBtnGroup" style="padding-top:20px;">
        <button class="btn pbgui-btn btn-info" id="btnTest" :disabled="testing" @click="testConnection">
          <span v-if="testing" class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span>
          {{ t('misc.apikeys.testConnection') }}
        </button>
      </div>
    </div>

    <!-- Standard fields (non-HL) -->
    <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1" id="standardFields" v-show="!isHL">
      <div class="form-group flex flex-col gap-1.5">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.apiKey') }}</label>
        <div class="pw-wrap relative flex items-center">
          <input
            id="editKey"
            class="min-h-[34px] flex-1 py-1.5 pl-2.5 pr-9"
            v-model="keyField.value"
            :type="keyField.visible ? 'text' : 'password'"
            :placeholder="keyField.masked ? '••••••••••• ' + savedLeaveBlank : ''"
            @input="onKeyInput"
          />
          <button
            type="button"
            class="pw-eye-btn absolute right-2 border-none bg-transparent p-0 text-md leading-none text-muted cursor-pointer select-none hover:text-secondary"
            :aria-label="t('misc.apikeys.showHideStoredApiKey')"
            :title="t('misc.apikeys.showHideStoredApiKey')"
            @click="toggleApiKeyVisible"
          ><PbIcon :icon="keyField.visible ? PhEyeSlash : PhEye" /></button>
        </div>
      </div>
      <div class="form-group flex flex-col gap-1.5">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.apiSecret') }}</label>
        <div class="pw-wrap relative flex items-center">
          <input id="editSecret" class="min-h-[34px] flex-1 py-1.5 pl-2.5 pr-9" v-model="secretField.value" :type="secretVisible ? 'text' : 'password'" :placeholder="secretField.masked ? '••••••••••• ' + savedLeaveBlank : ''" />
          <button
            type="button"
            class="pw-eye-btn absolute right-2 border-none bg-transparent p-0 text-md leading-none text-muted cursor-pointer select-none hover:text-secondary"
            :aria-label="t('misc.apikeys.showHideStoredApiKey')"
            :title="t('misc.apikeys.showHideStoredApiKey')"
            @click="secretVisible = !secretVisible"
          ><PbIcon :icon="secretVisible ? PhEyeSlash : PhEye" /></button>
        </div>
      </div>
      <div class="form-group flex flex-col gap-1.5" id="passphraseGroup" v-show="needsPassphrase">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.passphrasePassword') }}</label>
        <div class="pw-wrap relative flex items-center">
          <input type="password" id="editPassphrase" class="min-h-[34px] flex-1 py-1.5 pl-2.5 pr-9" v-model="passphraseField.value" :placeholder="passphraseField.masked ? '••••••••••• ' + savedLeaveBlank : ''" />
        </div>
      </div>
    </div>

    <!-- HL Expiry (edit mode, hyperliquid only) -->
    <div
      id="hlExpiryInline"
      :style="{ display: isHL && isEdit ? 'flex' : 'none', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', padding: '10px 14px', background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: '6px' }"
    >
      <span style="font-size:var(--fs-sm); color:var(--text-secondary);">{{ t('misc.apikeys.hlKeyExpiry') }}</span>
      <span id="hlExpiryInlineBadge" :style="{ color: hlInline.errorText ? 'var(--danger-soft)' : '' }">
        <template v-if="hlInline.errorText">{{ hlInline.errorText }}</template>
        <ExpiryBadge v-else-if="hlInline.exp" :exp="hlInline.exp" />
        <template v-else>—</template>
      </span>
      <span id="hlExpiryInlineDate" style="font-size:var(--fs-sm); color:var(--text-secondary);">{{ hlInline.dateText }}</span>
      <button class="btn pbgui-btn btn-sm btn-secondary" id="btnHLExpiryInline" :disabled="checkingHl" style="margin-left:auto;" @click="checkSingleHlExpiry">
        <PbIcon :icon="PhArrowClockwise" /> {{ checkingHl ? t('misc.apikeys.checkingEllipsis') : t('misc.apikeys.checkExpiry') }}
      </button>
    </div>

    <!-- Bybit Expiry (edit mode, bybit only) -->
    <div
      id="bybitExpiryInline"
      :style="{ display: isBybit && isEdit ? 'flex' : 'none', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', padding: '10px 14px', background: 'var(--bg-page)', border: '1px solid var(--border-default)', borderRadius: '6px' }"
    >
      <span style="font-size:var(--fs-sm); color:var(--text-secondary);">{{ t('misc.apikeys.bybitKeyExpiry') }}</span>
      <span id="bybitExpiryInlineBadge" :style="{ color: bybitInline.errorText ? 'var(--danger-soft)' : '' }">
        <template v-if="bybitInline.errorText">{{ bybitInline.errorText }}</template>
        <ExpiryBadge v-else-if="bybitInline.exp" :exp="bybitInline.exp" />
        <template v-else>—</template>
      </span>
      <span id="bybitExpiryInlineDate" style="font-size:var(--fs-sm); color:var(--text-secondary);">{{ bybitInline.dateText }}</span>
      <button class="btn pbgui-btn btn-sm btn-secondary" id="btnBybitExpiryInline" :disabled="checkingBybit" style="margin-left:auto;" @click="checkSingleBybitExpiry">
        <PbIcon :icon="PhArrowClockwise" /> {{ checkingBybit ? t('misc.apikeys.checkingEllipsis') : t('misc.apikeys.checkExpiryAndIps') }}
      </button>
      <div id="bybitIPList" v-show="bybitInline.ips !== null" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-default); width:100%;">
        <span style="font-size:var(--fs-xs); color:var(--text-secondary); display:block; margin-bottom:4px;">{{ t('misc.apikeys.whitelistedIps') }}</span>
        <div id="bybitIPListContent" style="font-size:var(--fs-sm); color:var(--text-primary); line-height:1.8;">
          <template v-if="bybitInline.ips && bybitInline.ips.length > 0">
            <span v-for="ip in bybitInline.ips" :key="ip" style="font-family:monospace; margin-right:12px;">{{ ip }}</span>
          </template>
          <template v-else-if="bybitInline.ips !== null">{{ t('misc.apikeys.noIpsUnrestricted') }}</template>
        </div>
      </div>
    </div>

    <!-- Hyperliquid fields -->
    <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1" id="hlFields" v-show="isHL">
      <div class="form-group flex flex-col gap-1.5">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.walletAddress') }}</label>
        <input type="text" id="editWallet" class="min-h-[34px] px-2.5 py-1.5" v-model="wallet" />
      </div>
      <div class="form-group flex flex-col gap-1.5" style="grid-column: span 2;">
        <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.privateKey') }}</label>
        <div class="pw-wrap relative flex items-center">
          <input
            id="editPrivateKey"
            class="min-h-[34px] flex-1 py-1.5 pl-2.5 pr-9"
            v-model="privateKeyField.value"
            type="password"
            :placeholder="privateKeyField.masked ? '••••••••••• ' + savedLeaveBlank : ''"
          />
        </div>
      </div>
      <div class="form-checkbox flex items-center gap-2 pt-5">
        <input type="checkbox" id="editIsVault" class="h-4 w-4" v-model="isVault" />
        <label for="editIsVault" style="text-transform:none; font-size:var(--fs-base); color:var(--text-primary);">{{ t('misc.apikeys.vault') }}</label>
      </div>
    </div>

    <!-- Advanced (collapsible) -->
    <div class="expander mt-3">
      <button class="expander-toggle w-full cursor-pointer rounded-md border border-border-subtle bg-secondary/5 px-3 py-1.75 text-left text-sm text-secondary hover:border-border-strong hover:text-primary" @click="advancedOpen = !advancedOpen">
        <PbIcon id="advancedToggleIcon" :icon="advancedOpen ? PhCaretDown : PhCaretRight" /> {{ t('misc.apikeys.advancedOptional') }}
      </button>
      <div class="expander-content py-3" :class="advancedOpen ? 'open block' : 'hidden'">
        <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1">
          <div class="form-group flex flex-col gap-1.5">
            <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.quote') }}</label>
            <input type="text" id="editQuote" class="min-h-[34px] px-2.5 py-1.5" v-model="quote" placeholder="e.g. USDT" />
          </div>
        </div>
        <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1" style="grid-template-columns: 1fr 1fr;">
          <div class="form-group flex flex-col gap-1.5">
            <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.optionsJson') }}</label>
            <textarea id="editOptions" class="min-h-[60px] resize-y px-2.5 py-2 font-mono text-sm" v-model="optionsText" rows="3" placeholder='{"key": "value"}'></textarea>
          </div>
          <div class="form-group flex flex-col gap-1.5">
            <label class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.extraJson') }}</label>
            <textarea id="editExtra" class="min-h-[60px] resize-y px-2.5 py-2 font-mono text-sm" v-model="extraText" rows="3" placeholder='{"key": "value"}'></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- Balance display (after test) -->
    <div id="balanceDisplay" class="balance-display mt-3 flex flex-wrap gap-5" v-show="balance.visible">
      <div class="balance-box min-w-[200px] rounded-md border border-border-subtle bg-card p-3 text-center">
        <div class="label mb-1 text-xs uppercase tracking-label text-secondary">{{ balance.success ? t('misc.apikeys.futuresBalance') : t('misc.apikeys.connectionTest') }}</div>
        <div v-if="balance.success" class="value text-xl font-semibold text-success">{{ balance.value !== null ? balance.value.toFixed(2) : 'N/A' }}</div>
        <div v-else class="error text-base text-danger">{{ balance.error }}</div>
      </div>
    </div>

    <div class="form-actions mt-5 flex items-center justify-end gap-2 border-t border-border-subtle pt-3 max-[768px]:flex-col max-[768px]:items-stretch">
      <button class="btn pbgui-btn btn-danger max-[768px]:w-full" id="btnDelete" v-show="deleteVisible" @click="editingName && confirmDelete(editingName)">
        {{ t('common.delete') }}
      </button>
      <button class="btn pbgui-btn btn-primary max-[768px]:w-full" id="btnSave" :disabled="saving" @click="save">
        <span v-if="saving" class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span>
        {{ t('common.save') }}
      </button>
    </div>
  </div>
</template>
