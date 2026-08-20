<script setup lang="ts">
/*
 * TradFi panel (:921-1016 markup): yfinance box, vault profile table,
 * projection status + retry, and the profile form. All behavior lives in
 * composables/useTradfi.ts (legacy :2499-3089).
 */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import BackButton from './BackButton.vue';
import { useTradfi, type TradfiStore } from '../composables/useTradfi';
import { injectToasts } from '../composables/useToasts';

const emit = defineEmits<{ (e: 'back'): void }>();

const { t } = useI18n();
const toasts = injectToasts();

const props = defineProps<{ store: TradfiStore }>();

const store = props.store;

const secretVisible = ref(false);

onMounted(() => {
  void store.loadTradfiData();
});
</script>

<template>
  <div id="tradfiPanel" class="hl-expiry-panel">
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 style="margin:0;">{{ t('misc.apikeys.tradfiDataProvider') }}</h3>
    </div>
    <p style="font-size:var(--fs-sm); color:#94a3b8; margin-bottom:8px;" v-html="t('misc.apikeys.stockPerpBacktestsDesc')"></p>
    <p
      style="font-size:var(--fs-sm); background:#1a2744; border-left:3px solid #26a69a; padding:8px 10px; border-radius:4px; margin-bottom:16px; color:#a0aec0;"
      v-html="t('misc.apikeys.betterAlternativeDesc')"
    ></p>

    <!-- yfinance section -->
    <div style="border:1px solid #2d3748; border-radius:6px; padding:12px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span>{{ t('misc.apikeys.yfinanceDesc') }}</span>
          <span
            id="yfStatus"
            style="margin-left:8px; font-size:var(--fs-sm);"
            :style="{
              color: store.yfLoadError.value
                ? '#ef4444'
                : store.yfError.value
                  ? '#ef4444'
                  : store.yfInstalled.value
                    ? '#26a69a'
                    : '#d69e2e',
            }"
          >
            <template v-if="store.yfLoadError.value">{{ store.yfLoadError.value }}</template>
            <template v-else-if="store.yfError.value">{{ serverMsg(store.yfError.value) }}</template>
            <template v-else-if="store.yfInstalled.value">&#10003; {{ t('misc.apikeys.yfinanceInstalled', { version: store.yfVersion.value }) }}</template>
            <template v-else>&#9888; {{ t('misc.apikeys.notInstalled') }}</template>
          </span>
        </div>
        <div style="display:flex; gap:8px;">
          <button
            class="btn pbgui-btn btn-sm"
            :class="store.yfInstalled.value ? 'btn-danger' : 'btn-primary'"
            id="btnYfInstall"
            :disabled="store.yfBusy.value"
            @click="store.yfInstallToggle()"
          >
            <span v-if="store.yfBusy.value" class="spinner"></span>
            {{ store.yfInstalled.value ? t('misc.apikeys.uninstall') : t('misc.apikeys.install') }}
          </button>
        <button class="btn pbgui-btn btn-sm btn-info" id="btnYfTest" v-show="store.yfInstalled.value" :disabled="store.yfBusy.value" @click="store.yfTest()">
            <span v-if="store.yfBusy.value" class="spinner"></span>
            {{ t('misc.apikeys.test') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Extended provider section -->
    <div style="border:1px solid #2d3748; border-radius:6px; padding:12px;">
      <span>{{ t('misc.apikeys.extendedProviderDesc') }}</span>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;">
        <span style="font-size:var(--fs-sm);color:#94a3b8;">{{ t('misc.apikeys.selectExactVaultProfile') }}</span>
        <button class="btn pbgui-btn btn-sm btn-secondary" type="button" @click="store.newProfile()">{{ t('misc.apikeys.newProfile') }}</button>
      </div>
      <div class="tradfi-profile-wrap">
        <table class="tradfi-profile-table">
          <thead>
            <tr>
              <th>{{ t('misc.apikeys.profileId') }}</th>
              <th>{{ t('misc.apikeys.provider') }}</th>
              <th>{{ t('misc.apikeys.label') }}</th>
              <th>{{ t('misc.apikeys.localState') }}</th>
              <th>{{ t('misc.apikeys.replicatedSelection') }}</th>
              <th>{{ t('misc.apikeys.pending') }}</th>
              <th>{{ t('misc.apikeys.shared') }}</th>
              <th>{{ t('misc.apikeys.generation') }}</th>
              <th>{{ t('misc.apikeys.apiKey') }}</th>
              <th>{{ t('misc.apikeys.apiSecret') }}</th>
              <th>{{ t('misc.apikeys.origin') }}</th>
              <th>{{ t('misc.apikeys.updated') }}</th>
            </tr>
          </thead>
          <tbody id="tradfiProfilesBody">
            <tr v-if="store.profilesError.value">
              <td colspan="12" style="color:#ef4444;cursor:default;">{{ store.profilesError.value }}</td>
            </tr>
            <tr v-else-if="!store.profiles.value.length">
              <td colspan="12" style="color:#94a3b8;cursor:default;">{{ t('misc.apikeys.noTradfiProfiles') }}</td>
            </tr>
            <tr
              v-else
              v-for="(profile, profileIdx) in store.profiles.value"
              :key="profile.id ?? profileIdx"
              :class="{ selected: profile.id === store.profileId.value }"
              :data-profile-id="profile.id"
              @click="store.selectProfile(String(profile.id || ''))"
            >
              <td class="tradfi-profile-id">{{ profile.id }}</td>
              <td>{{ profile.provider || '-' }}</td>
              <td>{{ profile.label || '-' }}</td>
              <td :class="profile.active ? 'tradfi-active' : 'tradfi-inactive'">
                {{ profile.active ? t('misc.apikeys.active') : t('misc.apikeys.inactive') }}
              </td>
              <td :class="profile.replicated_active ? 'tradfi-active' : 'tradfi-inactive'">
                {{ profile.replicated_active ? t('misc.apikeys.selectedGen', { gen: profile.activation_generation }) : t('misc.apikeys.notSelected') }}
              </td>
              <td>
                <template v-if="profile.pending_delete">{{ t('misc.apikeys.deletePending') }}</template>
                <template v-else-if="profile.pending">
                  {{ t('misc.apikeys.pendingWithStage', { stage: profile.pending_stage || 'stored' })
                  }}<template v-if="profile.pending_operation_id"> ({{ profile.pending_operation_id }})</template>
                </template>
                <template v-else>-</template>
              </td>
              <td>{{ profile.shared ? t('common.yes') : t('common.no') }}</td>
              <td>{{ profile.generation }}</td>
              <td>{{ profile.has_api_key ? t('misc.apikeys.stored') : t('misc.apikeys.missing') }}</td>
              <td>{{ profile.has_api_secret ? t('misc.apikeys.stored') : t('misc.apikeys.notStored') }}</td>
              <td>{{ profile.origin || '-' }}</td>
              <td>{{ profile.updated_at || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="tradfi-projection-status">
        <div class="tradfi-projection-copy" id="tradfiProjectionStatus">{{ store.projectionText.value }}</div>
        <button
          class="btn pbgui-btn btn-sm btn-secondary"
          id="btnTradfiProjectionRetry"
          type="button"
          :disabled="store.actionBusy.value"
          @click="store.retryProjection()"
        >
          {{ t('misc.apikeys.retryPb7Projection') }}
        </button>
      </div>
      <div class="form-grid" style="margin-top:12px;">
        <div class="form-group">
          <label>{{ t('misc.apikeys.selectedProfileId') }}</label>
          <input type="text" id="tradfiProfileId" readonly :value="store.profileId.value" :placeholder="t('misc.apikeys.newProfile')" />
        </div>
        <div class="form-group">
          <label>{{ t('misc.apikeys.provider') }}</label>
          <select id="tradfiProvider" v-model="store.provider.value" @change="store.onProviderChange()">
            <option v-for="p in store.providers.value" :key="p" :value="p">{{ p }}</option>
          </select>
          <a
            id="tradfiProviderLink"
            :href="store.providerLink.value ? store.providerLink.value.url : '#'"
            target="_blank"
            rel="noopener noreferrer"
            :style="{ display: store.providerLink.value ? 'flex' : 'none', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-sm)', color: '#26a69a', textDecoration: 'none', marginTop: '4px' }"
          >
            &#128279;
            <span id="tradfiProviderLinkLabel">{{ store.providerLink.value ? store.providerLink.value.label || t('misc.apikeys.getApiKey') : '' }}</span>
          </a>
        </div>
        <div class="form-group">
          <label>{{ t('misc.apikeys.label') }}</label>
          <input type="text" id="tradfiLabel" v-model="store.label.value" maxlength="120" placeholder="Profile label" />
        </div>
        <div class="form-group" style="display:flex;gap:18px;align-items:center;padding-top:24px;">
          <label style="display:flex;gap:6px;align-items:center;">
            <input type="checkbox" id="tradfiShared" v-model="store.shared.value" />
            <span>{{ t('misc.apikeys.shared') }}</span>
          </label>
          <label style="display:flex;gap:6px;align-items:center;">
            <input type="checkbox" id="tradfiActive" v-model="store.active.value" />
            <span>{{ t('misc.apikeys.active') }}</span>
          </label>
        </div>
        <div class="form-group">
          <label>{{ t('misc.apikeys.apiKey') }}</label>
          <div class="pw-wrap">
            <input id="tradfiApiKey" v-model="store.apiKeyValue.value" :type="store.apiKeyVisible.value ? 'text' : 'password'" autocomplete="new-password" />
            <button
              type="button"
              class="pw-eye-btn"
              :disabled="store.revealBusy.value"
              tabindex="-1"
              :title="t('misc.apikeys.showHideStoredApiKey')"
              @click="store.toggleApiKeyVisible()"
            >
              {{ store.apiKeyVisible.value ? '🙈' : '👁' }}
            </button>
          </div>
          <div style="font-size:var(--fs-xs);color:#718096;margin-top:4px;">{{ t('misc.apikeys.clickEyeToReveal') }}</div>
        </div>
        <div class="form-group" id="tradfiSecretGroup">
          <label>{{ t('misc.apikeys.apiSecret') }}</label>
          <div class="pw-wrap">
            <input
              id="tradfiApiSecret"
              v-model="store.apiSecretValue.value"
              :type="secretVisible ? 'text' : 'password'"
              :disabled="!store.needsSecretNow.value"
              :placeholder="store.apiSecretPlaceholder.value"
            />
            <button type="button" class="pw-eye-btn" tabindex="-1" @click="secretVisible = !secretVisible">
              {{ secretVisible ? '🙈' : '👁' }}
            </button>
          </div>
        </div>
      </div>
      <p id="tradfiProviderNote" style="font-size:var(--fs-sm); color:#94a3b8; margin:4px 0 12px;">{{ store.providerNote.value }}</p>
      <p id="tradfiProfileStatus" style="font-size:var(--fs-sm); color:#94a3b8; margin:4px 0 12px;">{{ store.profileStatus.value }}</p>
      <div id="tradfiActions" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn pbgui-btn btn-sm btn-info" :disabled="store.actionBusy.value" @click="store.tradfiTest()">
          <span v-if="store.testing.value === 'test'" class="spinner"></span>
          {{ t('misc.apikeys.testConnection') }}
        </button>
        <button class="btn pbgui-btn btn-sm btn-primary" :disabled="store.actionBusy.value" @click="store.tradfiSave(false)">
          {{ t('misc.apikeys.createUpdate') }}
        </button>
        <button class="btn pbgui-btn btn-sm btn-secondary" id="btnTradfiRotate" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiSave(true)">
          {{ t('misc.apikeys.rotateReplacement') }}
        </button>
        <button class="btn pbgui-btn btn-sm btn-secondary" id="btnTradfiToggle" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiToggleActive()">
          {{ store.toggleLabel.value }}
        </button>
        <button class="btn pbgui-btn btn-sm btn-danger" id="btnTradfiDelete" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiClear()">
          {{ t('misc.apikeys.deleteProfile') }}
        </button>
      </div>
    </div>
  </div>
</template>
