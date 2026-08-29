<script setup lang="ts">
/*
 * Edit/Create panel (:709-827 markup): masked credential fields with
 * reveal-on-eye (reveal-key POST, generation-guarded), exchange-dependent
 * field groups, HL/Bybit inline expiry checks, advanced JSON options,
 * validation, rename+save, delete, and connection testing.
 * Legacy logic :1493-2259.
 */
import { computed, reactive, ref } from 'vue';
import {
  PhArrowClockwise,
  PhCaretDown,
  PhCaretRight,
  PhEye,
  PhEyeSlash,
  PhFloppyDisk,
  PhIdentificationCard,
  PhKey,
  PhPlugsConnected,
  PhSlidersHorizontal,
  PhTrash,
} from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
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
  <div
    id="editPanel"
    class="edit-panel mx-auto mb-5 w-[min(100%,1180px)] overflow-hidden rounded-xl border border-secondary/14 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-rgb)/0.07),transparent_26rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] shadow-panel"
    @input="formDirty = true"
    @change="formDirty = true"
  >
    <header class="flex min-h-16 flex-wrap items-center gap-3 border-b border-secondary/12 px-5 py-3.5 max-[640px]:px-4">
      <BackButton @back="emit('back')" />
      <div class="min-w-0 flex-1">
        <h3 id="editPanelTitle" class="m-0 truncate text-lg font-semibold tracking-tight text-primary">{{ title }}</h3>
        <div class="mt-0.5 text-xs text-muted">{{ t('misc.apikeys.credentials') }}</div>
      </div>
      <span class="rounded-full border border-accent/18 bg-accent/8 px-2.5 py-1 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-accent-soft">
        {{ exchange || t('misc.apikeys.notSelected') }}
      </span>
    </header>

    <div class="grid grid-cols-[minmax(260px,0.78fr)_minmax(0,1.42fr)] gap-4 p-5 max-[900px]:grid-cols-1 max-[640px]:p-4">
      <section class="min-w-0 rounded-lg border border-secondary/12 bg-page/38 p-4" data-test="user-identity-section">
        <div class="mb-4 flex items-center gap-2.5 border-b border-secondary/10 pb-3">
          <div class="grid size-8 shrink-0 place-items-center rounded-md border border-accent/16 bg-accent/7 text-accent-soft">
            <PbIcon :icon="PhIdentificationCard" :size="17" />
          </div>
          <h4 class="m-0 text-sm font-semibold text-primary">{{ t('misc.apikeys.user') }}</h4>
        </div>

        <div class="grid gap-4">
          <div class="form-group flex flex-col gap-1.5">
            <Label for="editName">{{ t('misc.apikeys.username') }}</Label>
            <Input type="text" id="editName" v-model="name" maxlength="32" :disabled="lockedByInUse" />
          </div>
          <div class="form-group flex flex-col gap-1.5">
            <span id="editExchange-label" class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.exchange') }}</span>
            <SelectRoot
              :model-value="exchange"
              :disabled="lockedByInUse"
              @update:model-value="exchange = $event; onExchangeChange(); formDirty = true"
            >
              <SelectTrigger id="editExchange" aria-labelledby="editExchange-label">
                <span :class="exchange ? undefined : 'text-placeholder'">{{ exchange }}</span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="ex in store.exchanges.value" :key="ex" :value="ex">{{ ex }}</SelectItem>
              </SelectContent>
            </SelectRoot>
          </div>
        </div>
      </section>

      <section class="min-w-0 rounded-lg border border-secondary/12 bg-page/38 p-4" data-test="user-credentials-section">
        <div class="mb-4 flex flex-wrap items-center gap-3 border-b border-secondary/10 pb-3">
          <div class="flex min-w-0 flex-1 items-center gap-2.5">
            <div class="grid size-8 shrink-0 place-items-center rounded-md border border-accent/16 bg-accent/7 text-accent-soft">
              <PbIcon :icon="PhKey" :size="17" />
            </div>
            <h4 class="m-0 text-sm font-semibold text-primary">{{ t('misc.apikeys.credentials') }}</h4>
          </div>
          <div id="testBtnGroup">
            <Button type="button" variant="info" size="sm" id="btnTest" :loading="testing" @click="testConnection">
              <PbIcon :icon="PhPlugsConnected" /> {{ t('misc.apikeys.testConnection') }}
            </Button>
          </div>
        </div>

        <!-- Standard fields (non-HL) -->
        <div class="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1" id="standardFields" v-show="!isHL">
          <div class="form-group flex min-w-0 flex-col gap-1.5">
            <Label for="editKey">{{ t('misc.apikeys.apiKey') }}</Label>
            <div class="pw-wrap relative flex items-center">
              <Input
                id="editKey"
                class="flex-1 pr-9"
                v-model="keyField.value"
                :type="keyField.visible ? 'text' : 'password'"
                :placeholder="keyField.masked ? '••••••••••• ' + savedLeaveBlank : ''"
                @input="onKeyInput"
              />
              <Button
                type="button"
                variant="ghost"
                class="pw-eye-btn absolute right-2 h-auto border-0 bg-transparent p-0 text-md leading-none font-normal text-muted hover:bg-transparent hover:text-secondary active:scale-100"
                :aria-label="t('misc.apikeys.showHideStoredApiKey')"
                :title="t('misc.apikeys.showHideStoredApiKey')"
                @click="toggleApiKeyVisible"
              ><PbIcon :icon="keyField.visible ? PhEyeSlash : PhEye" /></Button>
            </div>
          </div>
          <div class="form-group flex min-w-0 flex-col gap-1.5">
            <Label for="editSecret">{{ t('misc.apikeys.apiSecret') }}</Label>
            <div class="pw-wrap relative flex items-center">
              <Input id="editSecret" class="flex-1 pr-9" v-model="secretField.value" :type="secretVisible ? 'text' : 'password'" :placeholder="secretField.masked ? '••••••••••• ' + savedLeaveBlank : ''" />
              <Button
                type="button"
                variant="ghost"
                class="pw-eye-btn absolute right-2 h-auto border-0 bg-transparent p-0 text-md leading-none font-normal text-muted hover:bg-transparent hover:text-secondary active:scale-100"
                :aria-label="t('misc.apikeys.showHideStoredApiKey')"
                :title="t('misc.apikeys.showHideStoredApiKey')"
                @click="secretVisible = !secretVisible"
              ><PbIcon :icon="secretVisible ? PhEyeSlash : PhEye" /></Button>
            </div>
          </div>
          <div class="form-group col-span-2 flex min-w-0 flex-col gap-1.5 max-[640px]:col-span-1" id="passphraseGroup" v-show="needsPassphrase">
            <Label for="editPassphrase">{{ t('misc.apikeys.passphrasePassword') }}</Label>
            <Input type="password" id="editPassphrase" v-model="passphraseField.value" :placeholder="passphraseField.masked ? '••••••••••• ' + savedLeaveBlank : ''" />
          </div>
        </div>

        <!-- Hyperliquid fields -->
        <div class="grid grid-cols-2 gap-4 max-[640px]:grid-cols-1" id="hlFields" v-show="isHL">
          <div class="form-group flex min-w-0 flex-col gap-1.5">
            <Label for="editWallet">{{ t('misc.apikeys.walletAddress') }}</Label>
            <Input type="text" id="editWallet" v-model="wallet" />
          </div>
          <div class="form-group flex min-w-0 flex-col gap-1.5">
            <Label for="editPrivateKey">{{ t('misc.apikeys.privateKey') }}</Label>
            <Input id="editPrivateKey" v-model="privateKeyField.value" type="password" :placeholder="privateKeyField.masked ? '••••••••••• ' + savedLeaveBlank : ''" />
          </div>
          <label class="form-checkbox col-span-2 flex cursor-pointer items-center gap-2 rounded-md border border-secondary/12 bg-secondary/5 px-3 py-2.5 text-sm text-primary max-[640px]:col-span-1">
            <Checkbox id="editIsVault" :model-value="isVault" @update:model-value="isVault = $event === true; formDirty = true" />
            {{ t('misc.apikeys.vault') }}
          </label>
        </div>

        <!-- HL Expiry (edit mode, hyperliquid only) -->
        <div id="hlExpiryInline" class="mt-4 flex flex-wrap items-center gap-2.5 rounded-md border border-secondary/12 bg-secondary/5 px-3 py-2.5" :style="{ display: isHL && isEdit ? 'flex' : 'none' }">
          <span class="text-xs font-semibold text-secondary">{{ t('misc.apikeys.hlKeyExpiry') }}</span>
          <span id="hlExpiryInlineBadge" :class="hlInline.errorText ? 'text-danger-soft' : ''">
            <template v-if="hlInline.errorText">{{ hlInline.errorText }}</template>
            <ExpiryBadge v-else-if="hlInline.exp" :exp="hlInline.exp" />
            <template v-else>—</template>
          </span>
          <span id="hlExpiryInlineDate" class="text-xs text-secondary">{{ hlInline.dateText }}</span>
          <Button type="button" variant="secondary" size="sm" id="btnHLExpiryInline" :disabled="checkingHl" class="ml-auto" @click="checkSingleHlExpiry">
            <PbIcon :icon="PhArrowClockwise" /> {{ checkingHl ? t('misc.apikeys.checkingEllipsis') : t('misc.apikeys.checkExpiry') }}
          </Button>
        </div>

        <!-- Bybit Expiry (edit mode, bybit only) -->
        <div id="bybitExpiryInline" class="mt-4 flex flex-wrap items-center gap-2.5 rounded-md border border-secondary/12 bg-secondary/5 px-3 py-2.5" :style="{ display: isBybit && isEdit ? 'flex' : 'none' }">
          <span class="text-xs font-semibold text-secondary">{{ t('misc.apikeys.bybitKeyExpiry') }}</span>
          <span id="bybitExpiryInlineBadge" :class="bybitInline.errorText ? 'text-danger-soft' : ''">
            <template v-if="bybitInline.errorText">{{ bybitInline.errorText }}</template>
            <ExpiryBadge v-else-if="bybitInline.exp" :exp="bybitInline.exp" />
            <template v-else>—</template>
          </span>
          <span id="bybitExpiryInlineDate" class="text-xs text-secondary">{{ bybitInline.dateText }}</span>
          <Button type="button" variant="secondary" size="sm" id="btnBybitExpiryInline" :disabled="checkingBybit" class="ml-auto" @click="checkSingleBybitExpiry">
            <PbIcon :icon="PhArrowClockwise" /> {{ checkingBybit ? t('misc.apikeys.checkingEllipsis') : t('misc.apikeys.checkExpiryAndIps') }}
          </Button>
          <div id="bybitIPList" v-show="bybitInline.ips !== null" class="mt-1 w-full border-t border-secondary/10 pt-2">
            <span class="mb-1 block text-xs text-secondary">{{ t('misc.apikeys.whitelistedIps') }}</span>
            <div id="bybitIPListContent" class="font-mono text-sm leading-relaxed text-primary">
              <template v-if="bybitInline.ips && bybitInline.ips.length > 0">
                <span v-for="ip in bybitInline.ips" :key="ip" class="mr-3">{{ ip }}</span>
              </template>
              <template v-else-if="bybitInline.ips !== null">{{ t('misc.apikeys.noIpsUnrestricted') }}</template>
            </div>
          </div>
        </div>

        <!-- Balance display (after test) -->
        <div id="balanceDisplay" class="mt-4" v-show="balance.visible" aria-live="polite">
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-secondary/12 bg-secondary/5 px-3 py-2.5">
            <div class="text-xs font-semibold uppercase tracking-label text-secondary">{{ balance.success ? t('misc.apikeys.futuresBalance') : t('misc.apikeys.connectionTest') }}</div>
            <div v-if="balance.success" class="font-mono text-lg font-semibold tabular-nums text-success">{{ balance.value !== null ? balance.value.toFixed(2) : 'N/A' }}</div>
            <div v-else class="text-sm text-danger">{{ balance.error }}</div>
          </div>
        </div>
      </section>

      <!-- Advanced (collapsible) -->
      <section class="col-span-2 overflow-hidden rounded-lg border border-secondary/12 bg-page/30 max-[900px]:col-span-1" data-test="user-advanced-section">
        <Button
          type="button"
          variant="ghost"
          class="expander-toggle h-auto w-full justify-start rounded-none border-0 bg-transparent px-4 py-3 text-left text-sm font-semibold text-secondary hover:bg-secondary/5 hover:text-primary active:scale-100"
          :aria-expanded="advancedOpen"
          @click="advancedOpen = !advancedOpen"
        >
          <span class="mr-1 grid size-7 place-items-center rounded-md border border-secondary/12 bg-secondary/5 text-accent-soft">
            <PbIcon :icon="PhSlidersHorizontal" :size="15" />
          </span>
          {{ t('misc.apikeys.advancedOptional') }}
          <PbIcon id="advancedToggleIcon" class="ml-auto" :icon="advancedOpen ? PhCaretDown : PhCaretRight" />
        </Button>
        <div class="expander-content border-t border-secondary/10 p-4" :class="advancedOpen ? 'open block' : 'hidden'">
          <div class="mb-4 max-w-[280px]">
            <div class="form-group flex flex-col gap-1.5">
              <Label for="editQuote">{{ t('misc.apikeys.quote') }}</Label>
              <Input type="text" id="editQuote" v-model="quote" placeholder="e.g. USDT" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4 max-[768px]:grid-cols-1">
            <div class="form-group flex min-w-0 flex-col gap-1.5">
              <Label for="editOptions">{{ t('misc.apikeys.optionsJson') }}</Label>
              <Textarea id="editOptions" v-model="optionsText" rows="4" class="font-mono text-sm" placeholder='{"key": "value"}' />
            </div>
            <div class="form-group flex min-w-0 flex-col gap-1.5">
              <Label for="editExtra">{{ t('misc.apikeys.extraJson') }}</Label>
              <Textarea id="editExtra" v-model="extraText" rows="4" class="font-mono text-sm" placeholder='{"key": "value"}' />
            </div>
          </div>
        </div>
      </section>
    </div>

    <footer class="form-actions flex items-center gap-2 border-t border-secondary/12 bg-page/42 px-5 py-3.5 max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:px-4">
      <Button type="button" variant="danger" class="mr-auto max-[640px]:mr-0 max-[640px]:w-full" id="btnDelete" v-show="deleteVisible" @click="editingName && confirmDelete(editingName)">
        <PbIcon :icon="PhTrash" /> {{ t('common.delete') }}
      </Button>
      <Button type="button" variant="primary" class="min-w-24 max-[640px]:w-full" id="btnSave" :loading="saving" @click="save">
        <PbIcon :icon="PhFloppyDisk" /> {{ t('common.save') }}
      </Button>
    </footer>
  </div>
</template>
