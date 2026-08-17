import { computed, ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { pageFetch, PageApiError } from '../lib/pageApi';
import { confirmDialog } from '../lib/dialogs';
import type { Toasts } from './useToasts';
import type { TradFiProfile, TradFiProfilesResponse, TradFiProjection, Translator } from '../types';

/**
 * TradFi vault-profile section ported from api_keys_editor.html:2499-3089.
 * Split from the panel per the market_data useTradfiActions precedent.
 *
 * Concurrency model kept 1:1: a load generation + AbortController for
 * /tradfi/profiles reloads, a separate action generation + controller for
 * mutating actions, and a reveal generation so a stale reveal can never
 * populate the key field.
 */

export interface TradfiFormState {
  yfInstalled: boolean;
  yfVersion: string;
  yfError: string;
  yfLoadError: string;
}

export function useTradfi(t: Translator, toasts: Toasts) {
  const m = serverMsg;

  const providers = ref<string[]>([]);
  const providerNotes = ref<Record<string, string>>({});
  const providerLinks = ref<Record<string, { url: string; label: string }>>({});
  const needsSecret = ref<string[]>([]);
  const profiles = ref<TradFiProfile[]>([]);
  const projection = ref<TradFiProjection>({});
  const profilesError = ref('');

  const profileId = ref('');
  const provider = ref('');
  const label = ref('');
  const shared = ref(true);
  const active = ref(true);

  const apiKeyValue = ref('');
  const apiKeyRevealed = ref(false);
  const apiKeyVisible = ref(false);
  const apiSecretValue = ref('');

  const keySaved = ref(false);
  const secretSaved = ref(false);

  const yfInstalled = ref(false);
  const yfVersion = ref('');
  const yfError = ref('');
  const yfLoadError = ref('');

  const actionBusy = ref(false);
  const yfBusy = ref(false);
  const testing = ref('');

  let loadGeneration = 0;
  let loadController: AbortController | null = null;
  let actionGeneration = 0;
  let actionController: AbortController | null = null;
  let revealGeneration = 0;

  interface SaveIntent {
    profileId: string;
    provider: string;
    label: string;
    active: boolean;
    shared: boolean;
    apiKey: string;
    apiSecret: string;
    createNew: boolean;
    rotateReplacement: boolean;
    operationId?: string;
  }

  let pendingSaveIntent: (SaveIntent & { operationId: string }) | null = null;

  const selectedProfile = computed(() => profiles.value.find((item) => item && item.id === profileId.value) || null);
  const needsSecretNow = computed(() => needsSecret.value.includes(provider.value));
  const providerNote = computed(() => providerNotes.value[provider.value] || '');
  const providerLink = computed(() => providerLinks.value[provider.value] || null);
  const apiKeyPlaceholder = computed(() => (keySaved.value ? t('misc.apikeys.storedInVaultReplace') : t('misc.apikeys.enterApiKey')));
  const apiSecretPlaceholder = computed(() =>
    needsSecretNow.value ? (secretSaved.value ? t('misc.apikeys.storedInVaultReplace') : t('misc.apikeys.enterApiSecret')) : t('misc.apikeys.notRequired')
  );

  const profileStatus = computed(() => {
    const profile = selectedProfile.value;
    if (!profile) return t('misc.apikeys.newProfileSecretsNeverLoaded');
    return t('misc.apikeys.selectedVaultProfile', {
      id: profile.id ?? '',
      generation: profile.generation,
      activeState: profile.active ? t('misc.apikeys.locallyActive') : t('misc.apikeys.locallyInactive'),
      replicatedState: profile.replicated_active
        ? t('misc.apikeys.replicatedActiveGen', { generation: profile.activation_generation })
        : t('misc.apikeys.notReplicatedActive'),
      pendingState: profile.pending_delete
        ? t('misc.apikeys.deletePendingSuffix')
        : profile.pending
          ? t('misc.apikeys.pendingSuffix', { stage: profile.pending_stage || 'stored' })
          : '',
    });
  });

  const projectionText = computed(() => {
    const p = projection.value || {};
    const parts = [
      t('misc.apikeys.pb7Projection', { status: p.status || t('common.unknown') }),
      t('misc.apikeys.desired', { value: Number(p.desired_generation || 0) }),
      t('misc.apikeys.applied', { value: Number(p.applied_generation || 0) }),
      t('misc.apikeys.attempts', { value: Number(p.attempts || 0) }),
    ];
    if (p.last_error) parts.push(t('misc.apikeys.lastError', { error: p.last_error }));
    return parts.join(' · ');
  });

  const toggleLabel = computed(() => (selectedProfile.value?.active ? t('misc.apikeys.disable') : t('misc.apikeys.enable')));

  /* ── action plumbing (:2520-2566) ── */

  function invalidateAction(): void {
    actionGeneration += 1;
    actionController?.abort();
    actionController = null;
    actionBusy.value = false;
  }

  interface ActionContext {
    generation: number;
    profileId: string;
    provider: string;
    apiKey: string;
    apiSecret: string;
    controller: AbortController;
  }

  function beginAction(): ActionContext | null {
    if (actionBusy.value) return null;
    const context: ActionContext = {
      generation: ++actionGeneration,
      profileId: profileId.value,
      provider: provider.value,
      apiKey: apiKeyForAction(),
      apiSecret: apiSecretValue.value,
      controller: new AbortController(),
    };
    actionController = context.controller;
    actionBusy.value = true;
    return context;
  }

  function finishAction(context: ActionContext | null, clearSecrets: boolean): void {
    if (!context || context.generation !== actionGeneration) return;
    if (clearSecrets && profileId.value === context.profileId && provider.value === context.provider) {
      if (apiKeyValue.value === context.apiKey) apiKeyValue.value = '';
      if (apiSecretValue.value === context.apiSecret) apiSecretValue.value = '';
    }
    actionBusy.value = false;
    actionController = null;
  }

  /* ── reveal (:2676-2740) ── */

  function clearRevealedApiKey(): void {
    revealGeneration += 1;
    if (apiKeyRevealed.value) apiKeyValue.value = '';
    apiKeyRevealed.value = false;
    apiKeyVisible.value = false;
  }

  /** Key for a mutating action: a revealed value must never be resubmitted (:2687-2695). */
  function apiKeyForAction(): string {
    if (apiKeyRevealed.value) {
      clearRevealedApiKey();
      return '';
    }
    return apiKeyValue.value;
  }

  const revealBusy = ref(false);

  async function toggleApiKeyVisible(): Promise<void> {
    if (apiKeyVisible.value) {
      if (apiKeyRevealed.value) {
        clearRevealedApiKey();
      } else {
        apiKeyVisible.value = false;
      }
      return;
    }
    if (apiKeyValue.value) {
      apiKeyVisible.value = true;
      return;
    }
    const profile = selectedProfile.value;
    if (!profile || !profile.has_api_key) {
      toasts.showToast(t('misc.apikeys.noStoredApiKeyForProfile'), 'warning');
      return;
    }
    const requestedId = profileId.value;
    const generation = ++revealGeneration;
    revealBusy.value = true;
    try {
      const data = await pageFetch<{ value?: string }>('/tradfi/reveal', {
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify({ profile_id: requestedId }),
      });
      if (generation !== revealGeneration || requestedId !== profileId.value) return;
      apiKeyValue.value = String(data.value || '');
      apiKeyRevealed.value = true;
      apiKeyVisible.value = true;
    } catch (e) {
      if (generation !== revealGeneration) return;
      toasts.showToast(t('misc.apikeys.couldNotRevealApiKey', { error: m(e instanceof Error ? e.message : '') }), 'error');
    } finally {
      revealBusy.value = false;
    }
  }

  /* ── provider change (:2742-2788) ── */

  function onProviderChange(): void {
    invalidateAction();
    clearRevealedApiKey();
    const profile = selectedProfile.value;
    keySaved.value = Boolean(profile && profile.has_api_key);
    secretSaved.value = Boolean(profile && profile.has_api_secret);
    apiKeyValue.value = '';
    apiSecretValue.value = '';
  }

  function selectProfile(id: string): void {
    invalidateAction();
    const profile = profiles.value.find((item) => item && item.id === id) || null;
    profileId.value = profile ? String(profile.id) : '';
    if (profile) {
      provider.value = profile.provider || '';
      label.value = profile.label || '';
      shared.value = Boolean(profile.shared);
      active.value = Boolean(profile.active);
    } else {
      label.value = '';
      shared.value = true;
      active.value = true;
    }
    onProviderChange();
  }

  function newProfile(): void {
    selectProfile('');
  }

  /* ── load (:2631-2663) ── */

  async function loadTradfiData(): Promise<void> {
    const generation = ++loadGeneration;
    loadController?.abort();
    loadController = new AbortController();
    const selectedBeforeLoad = profileId.value;
    try {
      const data = await pageFetch<TradFiProfilesResponse>('/tradfi/profiles', {
        signal: loadController.signal,
        cache: 'no-store',
      });
      if (generation !== loadGeneration) return;
      providers.value = data.providers || [];
      providerNotes.value = data.provider_notes || {};
      providerLinks.value = data.provider_links || {};
      needsSecret.value = data.needs_secret || [];
      profiles.value = Array.isArray(data.profiles) ? data.profiles : [];
      projection.value = data.projection || {};
      profilesError.value = '';
      const retained = profiles.value.find((item) => item && item.id === selectedBeforeLoad);
      const explicitActive =
        profiles.value
          .filter((item) => item && item.active === true)
          .sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')))[0] || null;
      selectProfile((retained || explicitActive || { id: '' }).id || '');
    } catch (e) {
      if (generation !== loadGeneration || (e instanceof Error && e.name === 'AbortError')) return;
      profilesError.value = t('misc.apikeys.failedToLoadProfiles', { error: m(e instanceof Error ? e.message : '') });
      toasts.showToast(t('misc.apikeys.failedToLoadTradFiProfiles', { error: m(e instanceof Error ? e.message : '') }), 'error');
    }
    await checkYfinanceStatus();
  }

  /* ── yfinance (:2852-2921) ── */

  async function checkYfinanceStatus(): Promise<void> {
    try {
      const data = await pageFetch<{ installed?: boolean; version?: string; error?: string }>('/tradfi/yfinance/status');
      yfInstalled.value = Boolean(data.installed);
      yfVersion.value = data.version || '';
      yfError.value = data.error || '';
      yfLoadError.value = '';
    } catch (e) {
      yfLoadError.value = t('misc.apikeys.errorPrefix', { error: m(e instanceof Error ? e.message : '') });
    }
  }

  async function yfInstallToggle(): Promise<void> {
    const action = yfInstalled.value ? 'uninstall' : 'install';
    yfBusy.value = true;
    try {
      const data = await pageFetch<{ success?: boolean; message?: string }>('/tradfi/yfinance/' + action, { method: 'POST' });
      if (data.success) toasts.showToast(m(data.message || ''), 'success');
      else toasts.showToast(m(data.message || ''), 'error');
      await checkYfinanceStatus();
    } catch (e) {
      toasts.showToast(t('misc.apikeys.failed', { error: m(e instanceof Error ? e.message : '') }), 'error');
    } finally {
      yfBusy.value = false;
    }
  }

  async function yfTest(): Promise<void> {
    yfBusy.value = true;
    toasts.showToast(t('misc.apikeys.testingYfinance'), 'warning');
    try {
      const data = await pageFetch<{ success?: boolean; message?: string }>('/tradfi/test', {
        method: 'POST',
        body: JSON.stringify({ provider: 'yfinance' }),
      });
      toasts.updateAlert(m(data.message || ''), data.success ? 'success' : 'error');
    } catch (e) {
      toasts.updateAlert(t('misc.apikeys.failed', { error: m(e instanceof Error ? e.message : '') }), 'error');
    } finally {
      yfBusy.value = false;
    }
  }

  /* ── test / save / delete / retry (:2923-3089) ── */

  async function tradfiTest(): Promise<void> {
    const prov = provider.value;
    const key = apiKeyForAction().trim();
    const secret = apiSecretValue.value.trim();
    if (!key && !keySaved.value) {
      toasts.showToast(t('misc.apikeys.enterApiKeyFirst'), 'warning');
      return;
    }
    toasts.showToast(t('misc.apikeys.testingProvider', { provider: prov }), 'warning');
    const context = beginAction();
    if (!context) return;
    testing.value = 'test';
    try {
      const body = key || secret ? { provider: prov, api_key: key, api_secret: secret } : { profile_id: profileId.value };
      const data = await pageFetch<{ success?: boolean; message?: string }>('/tradfi/test', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: context.controller.signal,
      });
      if (context.generation !== actionGeneration) return;
      finishAction(context, true);
      toasts.updateAlert(m(data.message || ''), data.success ? 'success' : 'error');
    } catch (e) {
      if (context.generation !== actionGeneration || (e instanceof Error && e.name === 'AbortError')) return;
      toasts.updateAlert(t('misc.apikeys.testFailed', { error: m(e instanceof Error ? e.message : '') }), 'error');
    } finally {
      testing.value = '';
      finishAction(context, false);
    }
  }

  function currentSaveIntent(rotateReplacement: boolean): SaveIntent {
    return {
      profileId: profileId.value,
      provider: provider.value,
      label: label.value,
      active: active.value,
      shared: shared.value,
      apiKey: apiKeyForAction().trim(),
      apiSecret: apiSecretValue.value.trim(),
      createNew: !profileId.value,
      rotateReplacement: Boolean(rotateReplacement),
    };
  }

  function sameSaveIntent(left: SaveIntent | null, right: SaveIntent | null): boolean {
    if (!left || !right) return false;
    const keys: (keyof SaveIntent)[] = [
      'profileId',
      'provider',
      'label',
      'active',
      'shared',
      'apiKey',
      'apiSecret',
      'createNew',
      'rotateReplacement',
    ];
    return keys.every((key) => left[key] === right[key]);
  }

  async function checkPendingSave(
    intent: SaveIntent
  ): Promise<{ operationId: string; completedProfile: TradFiProfile | null; blocked: boolean }> {
    if (!pendingSaveIntent) return { operationId: '', completedProfile: null, blocked: false };
    const pending = pendingSaveIntent;
    const status = await pageFetch<TradFiProfilesResponse>('/tradfi/profiles', { cache: 'no-store' });
    const profile =
      (status.profiles || []).find(
        (item) => item && (item.pending_operation_id === pending.operationId || item.last_operation_id === pending.operationId)
      ) || null;
    if (!sameSaveIntent(pending, intent)) {
      if (profile && profile.pending) {
        toasts.showToast(
          t('misc.apikeys.operationStillPending', { operationId: pending.operationId, profileId: profile.id ?? '' }),
          'warning'
        );
        return { operationId: pending.operationId, completedProfile: null, blocked: true };
      }
      pendingSaveIntent = null;
      if (profile) {
        toasts.showToast(
          t('misc.apikeys.operationAlreadyCompleted', { operationId: pending.operationId, profileId: profile.id ?? '' }),
          'warning'
        );
        return { operationId: pending.operationId, completedProfile: null, blocked: true };
      }
      return { operationId: '', completedProfile: null, blocked: false };
    }
    if (profile && profile.last_operation_id === pending.operationId && !profile.pending) {
      return { operationId: pending.operationId, completedProfile: profile, blocked: false };
    }
    return { operationId: pending.operationId, completedProfile: null, blocked: false };
  }

  function newOperationId(prefix: string): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return prefix + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  async function tradfiSave(rotateReplacement: boolean): Promise<void> {
    const intent = currentSaveIntent(rotateReplacement);
    const key = intent.apiKey;
    const secret = intent.apiSecret;
    const profile = selectedProfile.value;
    if (rotateReplacement && !profile) {
      toasts.showToast(t('misc.apikeys.selectProfileToRotate'), 'warning');
      return;
    }
    if (rotateReplacement && !key) {
      toasts.showToast(t('misc.apikeys.enterReplacementApiKey'), 'warning');
      return;
    }
    if (!key && !keySaved.value) {
      toasts.showToast(t('misc.apikeys.enterApiKeyFirst'), 'warning');
      return;
    }
    const context = beginAction();
    if (!context) return;
    try {
      const checked = await checkPendingSave(intent);
      if (context.generation !== actionGeneration || checked.blocked) return;
      if (checked.completedProfile) {
        pendingSaveIntent = null;
        profileId.value = String(checked.completedProfile.id || '');
        finishAction(context, true);
        await loadTradfiData();
        toasts.showToast(t('misc.apikeys.tradfiOperationAlreadyCompleted', { operationId: checked.operationId }), 'success');
        return;
      }
      const operationId = checked.operationId || newOperationId('tradfi-');
      pendingSaveIntent = { ...intent, operationId };
      const data = await pageFetch<{ status?: string; profile?: TradFiProfile }>('/tradfi/config', {
        method: 'PUT',
        body: JSON.stringify({
          profile_id: intent.profileId || null,
          provider: intent.provider,
          label: intent.label,
          active: intent.active,
          shared: intent.shared,
          api_key: key || null,
          api_secret: secret || null,
          operation_id: operationId,
          create_new: intent.createNew,
        }),
        signal: context.controller.signal,
      });
      if (context.generation !== actionGeneration) return;
      pendingSaveIntent = null;
      finishAction(context, true);
      profileId.value = String(data?.profile?.id || profileId.value || '');
      await loadTradfiData();
      toasts.showToast(
        data.status === 'pending' ? t('misc.apikeys.tradfiProfileSavedPending') : t('misc.apikeys.tradfiConfigSaved'),
        data.status === 'pending' ? 'warning' : 'success'
      );
    } catch (e) {
      if (context.generation !== actionGeneration || (e instanceof Error && e.name === 'AbortError')) return;
      if (pendingSaveIntent && e instanceof PageApiError && e.operationId) pendingSaveIntent.operationId = e.operationId;
      const operationText = pendingSaveIntent?.operationId || (e instanceof PageApiError ? e.operationId : '') || '';
      toasts.showToast(
        t('misc.apikeys.saveStatusUncertain', {
          operation: operationText ? ' for operation ' + operationText : '',
          error: m(e instanceof Error ? e.message : ''),
        }),
        'error'
      );
    } finally {
      finishAction(context, false);
    }
  }

  async function tradfiToggleActive(): Promise<void> {
    const profile = selectedProfile.value;
    if (!profile) return;
    active.value = !profile.active;
    await tradfiSave(false);
  }

  async function tradfiClear(): Promise<void> {
    if (
      !(await confirmDialog({
        title: t('misc.apikeys.deleteTradfiProfileTitle'),
        message: t('misc.apikeys.deleteTradfiProfileMessage', { profileId: profileId.value }),
        confirmText: t('common.delete'),
      }))
    )
      return;
    let context: ActionContext | null = null;
    try {
      if (!profileId.value) {
        toasts.showToast(t('misc.apikeys.noVaultProfileForProvider'), 'warning');
        return;
      }
      context = beginAction();
      if (!context) return;
      const data = await pageFetch<{ status?: string }>('/tradfi/config?profile_id=' + encodeURIComponent(profileId.value), {
        method: 'DELETE',
        signal: context.controller.signal,
      });
      if (context.generation !== actionGeneration) return;
      finishAction(context, true);
      keySaved.value = false;
      secretSaved.value = false;
      profileId.value = '';
      await loadTradfiData();
      toasts.showToast(
        data.status === 'pending_delete' ? t('misc.apikeys.tradfiProfileDeletePending') : t('misc.apikeys.tradfiProfileDeleted'),
        data.status === 'pending_delete' ? 'warning' : 'success'
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toasts.showToast(t('misc.apikeys.failed', { error: m(e instanceof Error ? e.message : '') }), 'error');
    } finally {
      finishAction(context, false);
    }
  }

  async function retryProjection(): Promise<void> {
    const context = beginAction();
    if (!context) return;
    const operationId = newOperationId('tradfi-projection-');
    try {
      const data = await pageFetch<{ ok?: boolean; projection?: TradFiProjection }>('/tradfi/projection/retry', {
        method: 'POST',
        body: JSON.stringify({ operation_id: operationId }),
        signal: context.controller.signal,
      });
      if (context.generation !== actionGeneration) return;
      projection.value = data.projection || {};
      await loadTradfiData();
      toasts.showToast(
        data.ok ? t('misc.apikeys.pb7TradfiProjectionCurrent') : t('misc.apikeys.pb7TradfiProjectionPending'),
        data.ok ? 'success' : 'warning'
      );
    } catch (e) {
      if (context.generation !== actionGeneration || (e instanceof Error && e.name === 'AbortError')) return;
      toasts.showToast(t('misc.apikeys.projectionRetryFailed', { error: m(e instanceof Error ? e.message : '') }), 'error');
      await loadTradfiData();
    } finally {
      finishAction(context, false);
    }
  }

  return {
    providers,
    profiles,
    profilesError,
    profileId,
    provider,
    label,
    shared,
    active,
    apiKeyValue,
    apiKeyRevealed,
    apiKeyVisible,
    apiSecretValue,
    keySaved,
    secretSaved,
    selectedProfile,
    needsSecretNow,
    providerNote,
    providerLink,
    apiKeyPlaceholder,
    apiSecretPlaceholder,
    profileStatus,
    projectionText,
    toggleLabel,
    actionBusy,
    yfBusy,
    revealBusy,
    testing,
    yfInstalled,
    yfVersion,
    yfError,
    yfLoadError,
    loadTradfiData,
    selectProfile,
    newProfile,
    onProviderChange,
    toggleApiKeyVisible,
    clearRevealedApiKey,
    yfInstallToggle,
    yfTest,
    tradfiTest,
    tradfiSave,
    tradfiToggleActive,
    tradfiClear,
    retryProjection,
  };
}

export type TradfiStore = ReturnType<typeof useTradfi>;
