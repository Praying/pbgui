<script setup lang="ts">
/*
 * TradFi panel (:921-1016 markup): yfinance box, vault profile table,
 * projection status + retry, and the profile form. All behavior lives in
 * composables/useTradfi.ts (legacy :2499-3089).
 */
import { onMounted, ref } from 'vue';
import { PhEye, PhEyeSlash, PhLinkSimple } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { serverMsg } from '@/shared/i18n';
import PbIcon from '@/shared/components/PbIcon.vue';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { SelectContent, SelectItem, SelectRoot, SelectTrigger } from '@/shared/components/ui/select';
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
  <div id="tradfiPanel" class="hl-expiry-panel mx-auto mb-5 w-[min(100%,1500px)] rounded-lg border border-border-subtle bg-panel p-4 max-[768px]:p-3">
    <div class="border-b border-border-subtle pb-3 max-[768px]:flex-wrap" style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
      <BackButton @back="emit('back')" />
      <h3 class="text-lg tracking-tight text-primary" style="margin:0;">{{ t('misc.apikeys.tradfiDataProvider') }}</h3>
    </div>
    <p style="font-size:var(--fs-sm); color:var(--text-secondary); margin-bottom:8px;" v-html="t('misc.apikeys.stockPerpBacktestsDesc')"></p>
    <p
      style="font-size:var(--fs-sm); background:var(--bg-elevated); border-left:3px solid var(--accent); padding:8px 10px; border-radius:4px; margin-bottom:16px; color:var(--text-secondary);"
      v-html="t('misc.apikeys.betterAlternativeDesc')"
    ></p>

    <!-- yfinance section -->
    <div style="border:1px solid var(--border-default); border-radius:6px; padding:12px; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span>{{ t('misc.apikeys.yfinanceDesc') }}</span>
          <span
            id="yfStatus"
            style="margin-left:8px; font-size:var(--fs-sm);"
            :style="{
              color: store.yfLoadError.value
                ? 'var(--danger)'
                : store.yfError.value
                  ? 'var(--danger)'
                  : store.yfInstalled.value
                    ? 'var(--success)'
                    : 'var(--warning)',
            }"
          >
            <template v-if="store.yfLoadError.value">{{ store.yfLoadError.value }}</template>
            <template v-else-if="store.yfError.value">{{ serverMsg(store.yfError.value) }}</template>
            <template v-else-if="store.yfInstalled.value">&#10003; {{ t('misc.apikeys.yfinanceInstalled', { version: store.yfVersion.value }) }}</template>
            <template v-else>&#9888; {{ t('misc.apikeys.notInstalled') }}</template>
          </span>
        </div>
        <div style="display:flex; gap:8px;">
          <Button
            type="button"
            size="sm"
            :variant="store.yfInstalled.value ? 'danger' : 'primary'"
            id="btnYfInstall"
            :loading="store.yfBusy.value"
            @click="store.yfInstallToggle()"
          >
            {{ store.yfInstalled.value ? t('misc.apikeys.uninstall') : t('misc.apikeys.install') }}
          </Button>
        <Button type="button" variant="info" size="sm" id="btnYfTest" v-show="store.yfInstalled.value" :loading="store.yfBusy.value" @click="store.yfTest()">
            {{ t('misc.apikeys.test') }}
          </Button>
        </div>
      </div>
    </div>

    <!-- Extended provider section -->
    <div style="border:1px solid var(--border-default); border-radius:6px; padding:12px;">
      <span>{{ t('misc.apikeys.extendedProviderDesc') }}</span>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;">
        <span style="font-size:var(--fs-sm);color:var(--text-secondary);">{{ t('misc.apikeys.selectExactVaultProfile') }}</span>
        <Button type="button" variant="secondary" size="sm" @click="store.newProfile()">{{ t('misc.apikeys.newProfile') }}</Button>
      </div>
      <div class="tradfi-profile-wrap my-3 overflow-x-auto rounded-md border border-border-subtle max-[768px]:max-w-full">
        <table class="tradfi-profile-table w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.profileId') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.provider') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.label') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.localState') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.replicatedSelection') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.pending') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.shared') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.generation') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.apiKey') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.apiSecret') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.origin') }}</th>
              <th class="sticky top-0 z-[1] border-b border-border-default bg-card px-2.5 py-2 text-left text-secondary whitespace-nowrap">{{ t('misc.apikeys.updated') }}</th>
            </tr>
          </thead>
          <tbody id="tradfiProfilesBody">
            <tr v-if="store.profilesError.value">
              <td colspan="12" class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap" style="color:var(--danger);cursor:default;">{{ store.profilesError.value }}</td>
            </tr>
            <tr v-else-if="!store.profiles.value.length">
              <td colspan="12" class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap" style="color:var(--text-secondary);cursor:default;">{{ t('misc.apikeys.noTradfiProfiles') }}</td>
            </tr>
            <tr
              v-else
              v-for="(profile, profileIdx) in store.profiles.value"
              :key="profile.id ?? profileIdx"
              class="cursor-pointer transition-colors duration-[120ms] ease-standard"
              :class="{ selected: profile.id === store.profileId.value }"
              :data-profile-id="profile.id"
              @click="store.selectProfile(String(profile.id || ''))"
            >
              <td class="tradfi-profile-id border-b border-border-subtle px-2.5 py-2 font-mono text-muted whitespace-nowrap">{{ profile.id }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.provider || '-' }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.label || '-' }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap" :class="profile.active ? 'tradfi-active text-success-soft font-bold' : 'tradfi-inactive text-warning'">
                {{ profile.active ? t('misc.apikeys.active') : t('misc.apikeys.inactive') }}
              </td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap" :class="profile.replicated_active ? 'tradfi-active text-success-soft font-bold' : 'tradfi-inactive text-warning'">
                {{ profile.replicated_active ? t('misc.apikeys.selectedGen', { gen: profile.activation_generation }) : t('misc.apikeys.notSelected') }}
              </td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">
                <template v-if="profile.pending_delete">{{ t('misc.apikeys.deletePending') }}</template>
                <template v-else-if="profile.pending">
                  {{ t('misc.apikeys.pendingWithStage', { stage: profile.pending_stage || 'stored' })
                  }}<template v-if="profile.pending_operation_id"> ({{ profile.pending_operation_id }})</template>
                </template>
                <template v-else>-</template>
              </td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.shared ? t('common.yes') : t('common.no') }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.generation }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.has_api_key ? t('misc.apikeys.stored') : t('misc.apikeys.missing') }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.has_api_secret ? t('misc.apikeys.stored') : t('misc.apikeys.notStored') }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.origin || '-' }}</td>
              <td class="border-b border-border-subtle px-2.5 py-2 whitespace-nowrap">{{ profile.updated_at || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="tradfi-projection-status my-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-subtle bg-card px-3 py-2.5">
        <div class="tradfi-projection-copy min-w-0 text-sm text-secondary [overflow-wrap:anywhere]" id="tradfiProjectionStatus">{{ store.projectionText.value }}</div>
        <Button
          variant="secondary"
          size="sm"
          id="btnTradfiProjectionRetry"
          type="button"
          :disabled="store.actionBusy.value"
          @click="store.retryProjection()"
        >
          {{ t('misc.apikeys.retryPb7Projection') }}
        </Button>
      </div>
      <div class="form-grid mb-3 grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1" style="margin-top:12px;">
        <div class="form-group flex flex-col gap-1.5">
          <Label for="tradfiProfileId">{{ t('misc.apikeys.selectedProfileId') }}</Label>
          <Input type="text" id="tradfiProfileId" readonly :model-value="store.profileId.value" :placeholder="t('misc.apikeys.newProfile')" />
        </div>
        <div class="form-group flex flex-col gap-1.5">
          <span id="tradfiProvider-label" class="text-xs font-semibold uppercase tracking-label text-secondary">{{ t('misc.apikeys.provider') }}</span>
          <SelectRoot :model-value="store.provider.value" @update:model-value="store.provider.value = $event; store.onProviderChange()">
            <SelectTrigger id="tradfiProvider" aria-labelledby="tradfiProvider-label">
              <span :class="store.provider.value ? undefined : 'text-placeholder'">{{ store.provider.value }}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="p in store.providers.value" :key="p" :value="p">{{ p }}</SelectItem>
            </SelectContent>
          </SelectRoot>
          <a
            id="tradfiProviderLink"
            :href="store.providerLink.value ? store.providerLink.value.url : '#'"
            target="_blank"
            rel="noopener noreferrer"
            :style="{ display: store.providerLink.value ? 'flex' : 'none', alignItems: 'center', gap: '4px', fontSize: 'var(--fs-sm)', color: 'var(--accent)', textDecoration: 'none', marginTop: '4px' }"
          >
            <PbIcon :icon="PhLinkSimple" />
            <span id="tradfiProviderLinkLabel">{{ store.providerLink.value ? store.providerLink.value.label || t('misc.apikeys.getApiKey') : '' }}</span>
          </a>
        </div>
        <div class="form-group flex flex-col gap-1.5">
          <Label for="tradfiLabel">{{ t('misc.apikeys.label') }}</Label>
          <Input type="text" id="tradfiLabel" v-model="store.label.value" maxlength="120" :placeholder="t('misc.apikeys.profileLabel')" />
        </div>
        <div class="form-group flex flex-col gap-1.5" style="display:flex;gap:18px;align-items:center;padding-top:24px;">
          <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
            <Checkbox id="tradfiShared" v-model="store.shared.value" />
            <span>{{ t('misc.apikeys.shared') }}</span>
          </label>
          <label style="display:flex;gap:6px;align-items:center;cursor:pointer;">
            <Checkbox id="tradfiActive" v-model="store.active.value" />
            <span>{{ t('misc.apikeys.active') }}</span>
          </label>
        </div>
        <div class="form-group flex flex-col gap-1.5">
          <Label for="tradfiApiKey">{{ t('misc.apikeys.apiKey') }}</Label>
          <div class="pw-wrap relative flex items-center">
            <Input id="tradfiApiKey" class="flex-1 pr-9" v-model="store.apiKeyValue.value" :type="store.apiKeyVisible.value ? 'text' : 'password'" autocomplete="new-password" />
            <Button
              type="button"
              variant="ghost"
              class="pw-eye-btn absolute right-2 h-auto border-0 bg-transparent p-0 text-md leading-none font-normal text-muted hover:bg-transparent hover:text-secondary active:scale-100"
              :disabled="store.revealBusy.value"
              :aria-label="t('misc.apikeys.showHideStoredApiKey')"
              :title="t('misc.apikeys.showHideStoredApiKey')"
              @click="store.toggleApiKeyVisible()"
            >
              <PbIcon :icon="store.apiKeyVisible.value ? PhEyeSlash : PhEye" />
            </Button>
          </div>
          <div style="font-size:var(--fs-xs);color:var(--text-secondary);margin-top:4px;">{{ t('misc.apikeys.clickEyeToReveal') }}</div>
        </div>
        <div class="form-group flex flex-col gap-1.5" id="tradfiSecretGroup">
          <Label for="tradfiApiSecret">{{ t('misc.apikeys.apiSecret') }}</Label>
          <div class="pw-wrap relative flex items-center">
            <Input
              id="tradfiApiSecret"
              class="flex-1 pr-9"
              v-model="store.apiSecretValue.value"
              :type="secretVisible ? 'text' : 'password'"
              :disabled="!store.needsSecretNow.value"
              :placeholder="store.apiSecretPlaceholder.value"
            />
            <Button
              type="button"
              variant="ghost"
              class="pw-eye-btn absolute right-2 h-auto border-0 bg-transparent p-0 text-md leading-none font-normal text-muted hover:bg-transparent hover:text-secondary active:scale-100"
              :aria-label="t('misc.apikeys.showHideStoredApiKey')"
              :title="t('misc.apikeys.showHideStoredApiKey')"
              @click="secretVisible = !secretVisible"
            >
              <PbIcon :icon="secretVisible ? PhEyeSlash : PhEye" />
            </Button>
          </div>
        </div>
      </div>
      <p id="tradfiProviderNote" style="font-size:var(--fs-sm); color:var(--text-secondary); margin:4px 0 12px;">{{ store.providerNote.value }}</p>
      <p id="tradfiProfileStatus" style="font-size:var(--fs-sm); color:var(--text-secondary); margin:4px 0 12px;">{{ store.profileStatus.value }}</p>
      <div id="tradfiActions" class="max-[768px]:items-stretch" style="display:flex; gap:8px; flex-wrap:wrap;">
        <Button type="button" variant="info" size="sm" class="max-[768px]:flex-[1_1_150px]" :disabled="store.actionBusy.value" @click="store.tradfiTest()">
          <span v-if="store.testing.value === 'test'" class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span>
          {{ t('misc.apikeys.testConnection') }}
        </Button>
        <Button type="button" variant="primary" size="sm" id="btnTradfiSave" class="max-[768px]:flex-[1_1_150px]" :disabled="store.actionBusy.value" @click="store.tradfiSave(false)">
          {{ t('misc.apikeys.createUpdate') }}
        </Button>
        <Button type="button" variant="secondary" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiRotate" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiSave(true)">
          {{ t('misc.apikeys.rotateReplacement') }}
        </Button>
        <Button type="button" variant="secondary" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiToggle" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiToggleActive()">
          {{ store.toggleLabel.value }}
        </Button>
        <Button type="button" variant="danger" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiDelete" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiClear()">
          {{ t('misc.apikeys.deleteProfile') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Row interactions ported from styles/api_keys_editor.css — hover/selected
   paint the td cells from the row state, a descendant relationship utilities
   cannot express. Declaration order keeps .selected above :hover as before.
   'tradfi-profile-table' / 'selected' remain as inert anchors. */
.tradfi-profile-table tbody tr:hover td {
  background: rgb(var(--text-secondary-rgb) / 0.05);
}

.tradfi-profile-table tbody tr.selected td {
  background: rgb(var(--accent-rgb) / 0.14);
}
</style>
