<script setup lang="ts">
/*
 * TradFi panel (:921-1016 markup): yfinance box, vault profile table,
 * projection status + retry, and the profile form. All behavior lives in
 * composables/useTradfi.ts (legacy :2499-3089).
 */
import { onMounted, ref } from 'vue';
import {
  PhArrowClockwise,
  PhCheckCircle,
  PhClockCounterClockwise,
  PhDatabase,
  PhEye,
  PhEyeSlash,
  PhFloppyDisk,
  PhKey,
  PhLinkSimple,
  PhPlugsConnected,
  PhPlus,
  PhPower,
  PhTrash,
  PhWarningCircle,
} from '@phosphor-icons/vue';
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

function onProfileRowKeydown(event: KeyboardEvent, profileId: string): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  store.selectProfile(profileId);
}
</script>

<template>
  <div id="tradfiPanel" class="tradfi-workbench hl-expiry-panel mx-auto mb-5 grid w-[min(100%,1500px)] gap-4">
    <header class="tradfi-page-head flex items-start justify-between gap-4 rounded-lg border border-border-subtle bg-panel px-4 py-3.5 shadow-panel max-[768px]:flex-col">
      <div class="flex min-w-0 items-start gap-3">
        <BackButton class="mt-0.5" @back="emit('back')" />
        <div class="min-w-0">
          <h2 class="m-0 text-xl font-semibold tracking-tight text-primary">{{ t('misc.apikeys.tradfiDataProvider') }}</h2>
          <p class="mt-1 max-w-[80ch] text-sm leading-relaxed text-secondary">{{ t('misc.apikeys.tradfiOverview') }}</p>
        </div>
      </div>
      <span class="tradfi-page-mark grid h-9 w-9 shrink-0 place-items-center rounded-md border border-accent/30 bg-accent/10 text-accent-soft" aria-hidden="true">
        <PbIcon :icon="PhDatabase" :size="18" />
      </span>
    </header>

    <div class="tradfi-intro-grid grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 max-[900px]:grid-cols-1">
      <div class="tradfi-intro-card rounded-lg border border-border-subtle bg-panel px-4 py-3 text-sm leading-relaxed text-secondary" v-html="t('misc.apikeys.stockPerpBacktestsDesc')"></div>
      <div class="tradfi-recommendation rounded-lg border border-accent/20 bg-accent/8 px-4 py-3 text-sm leading-relaxed text-secondary" v-html="t('misc.apikeys.betterAlternativeDesc')"></div>
    </div>

    <!-- yfinance section -->
    <section class="tradfi-section rounded-lg border border-border-subtle bg-panel shadow-panel" aria-labelledby="tradfi-recent-title">
      <div class="tradfi-section-head flex items-start justify-between gap-4 border-b border-border-subtle bg-card px-4 py-3 max-[768px]:flex-col">
        <div class="flex min-w-0 items-start gap-3">
          <span class="tradfi-section-icon grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhClockCounterClockwise" :size="16" /></span>
          <div class="min-w-0">
            <h3 id="tradfi-recent-title" class="m-0 text-md font-semibold text-primary">{{ t('misc.apikeys.tradfiRecentTitle') }}</h3>
            <p class="mt-0.5 text-sm text-muted">{{ t('misc.apikeys.tradfiRecentHint') }}</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2 max-[768px]:w-full">
          <Button
            type="button"
            size="sm"
            :variant="store.yfInstalled.value ? 'secondary' : 'primary'"
            id="btnYfInstall"
            :loading="store.yfBusy.value"
            @click="store.yfInstallToggle()"
          >
            <PbIcon :icon="store.yfInstalled.value ? PhTrash : PhPlus" :size="14" />
            {{ store.yfInstalled.value ? t('misc.apikeys.uninstall') : t('misc.apikeys.install') }}
          </Button>
          <Button type="button" variant="info" size="sm" id="btnYfTest" v-show="store.yfInstalled.value" :loading="store.yfBusy.value" @click="store.yfTest()">
            <PbIcon :icon="PhPlugsConnected" :size="14" />
            {{ t('misc.apikeys.test') }}
          </Button>
        </div>
      </div>
      <div class="tradfi-provider-summary flex items-center justify-between gap-4 px-4 py-3 max-[768px]:items-start max-[768px]:flex-col">
        <div class="min-w-0">
          <div class="font-medium text-primary">{{ t('misc.apikeys.yfinanceDesc') }}</div>
          <div class="mt-1 text-sm text-muted">{{ t('misc.apikeys.stockPerpBacktestsDesc').replace(/<[^>]+>/g, '') }}</div>
        </div>
        <span
          id="yfStatus"
          class="tradfi-status-badge inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
          :class="store.yfLoadError.value || store.yfError.value ? 'border-danger/30 bg-danger/10 text-danger-soft' : store.yfInstalled.value ? 'border-success/30 bg-success/10 text-success-soft' : 'border-warning/30 bg-warning/10 text-warning-soft'"
        >
          <PbIcon :icon="store.yfLoadError.value || store.yfError.value ? PhWarningCircle : store.yfInstalled.value ? PhCheckCircle : PhWarningCircle" :size="14" />
          <template v-if="store.yfLoadError.value">{{ store.yfLoadError.value }}</template>
          <template v-else-if="store.yfError.value">{{ serverMsg(store.yfError.value) }}</template>
          <template v-else-if="store.yfInstalled.value">{{ t('misc.apikeys.yfinanceInstalled', { version: store.yfVersion.value }) }}</template>
          <template v-else>{{ t('misc.apikeys.notInstalled') }}</template>
        </span>
      </div>
    </section>

    <!-- Extended provider section -->
    <section class="tradfi-section overflow-hidden rounded-lg border border-border-subtle bg-panel shadow-panel" aria-labelledby="tradfi-vault-title">
      <div class="tradfi-section-head flex items-start justify-between gap-4 border-b border-border-subtle bg-card px-4 py-3 max-[768px]:flex-col">
        <div class="flex min-w-0 items-start gap-3">
          <span class="tradfi-section-icon grid h-8 w-8 shrink-0 place-items-center rounded-md border border-accent/25 bg-accent/8 text-accent-soft" aria-hidden="true"><PbIcon :icon="PhKey" :size="16" /></span>
          <div class="min-w-0">
            <h3 id="tradfi-vault-title" class="m-0 text-md font-semibold text-primary">{{ t('misc.apikeys.tradfiVaultTitle') }}</h3>
            <p class="mt-0.5 text-sm text-muted">{{ t('misc.apikeys.tradfiVaultHint') }}</p>
          </div>
        </div>
        <Button type="button" variant="info" size="sm" @click="store.newProfile()"><PbIcon :icon="PhPlus" :size="14" />{{ t('misc.apikeys.newProfile') }}</Button>
      </div>
      <div class="tradfi-profile-wrap overflow-x-auto border-b border-border-subtle max-[768px]:max-w-full">
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
              <td colspan="12" class="cursor-default border-b border-border-subtle px-3 py-5 text-danger-soft whitespace-nowrap">{{ store.profilesError.value }}</td>
            </tr>
            <tr v-else-if="!store.profiles.value.length">
              <td colspan="12" class="cursor-default border-b border-border-subtle px-3 py-5 text-center text-secondary whitespace-nowrap">{{ t('misc.apikeys.noTradfiProfiles') }}</td>
            </tr>
            <tr
              v-else
              v-for="(profile, profileIdx) in store.profiles.value"
              :key="profile.id ?? profileIdx"
              class="cursor-pointer transition-colors duration-[120ms] ease-standard"
              :class="{ selected: profile.id === store.profileId.value }"
              :data-profile-id="profile.id"
              tabindex="0"
              @click="store.selectProfile(String(profile.id || ''))"
              @keydown="onProfileRowKeydown($event, String(profile.id || ''))"
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
      <div class="tradfi-projection-status flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-card/45 px-4 py-2.5">
        <div class="flex min-w-0 items-center gap-2 text-sm text-secondary [overflow-wrap:anywhere]" id="tradfiProjectionStatus"><PbIcon class="shrink-0 text-accent-soft" :icon="PhArrowClockwise" :size="15" />{{ store.projectionText.value }}</div>
        <Button
          variant="secondary"
          size="sm"
          id="btnTradfiProjectionRetry"
          type="button"
          :disabled="store.actionBusy.value"
          @click="store.retryProjection()"
        >
          <PbIcon :icon="PhArrowClockwise" :size="14" />
          {{ t('misc.apikeys.retryPb7Projection') }}
        </Button>
      </div>
      <div class="tradfi-editor-head flex items-start justify-between gap-4 border-b border-border-subtle px-4 py-3 max-[768px]:flex-col">
        <div>
          <h4 class="m-0 text-base font-semibold text-primary">{{ t('misc.apikeys.tradfiProfileEditorTitle') }}</h4>
          <p class="mt-0.5 text-sm text-muted">{{ t('misc.apikeys.tradfiProfileEditorHint') }}</p>
        </div>
        <span class="inline-flex items-center gap-1.5 rounded-full border border-border-default bg-card px-2.5 py-1 font-mono text-xs text-secondary">
          {{ store.profileId.value || t('misc.apikeys.newProfile') }}
        </span>
      </div>
      <div class="form-grid grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 px-4 py-4 max-[900px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[768px]:grid-cols-1">
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
            class="tradfi-provider-link mt-1 inline-flex items-center gap-1 text-sm text-accent no-underline hover:text-accent-soft hover:underline"
            :href="store.providerLink.value ? store.providerLink.value.url : '#'"
            target="_blank"
            rel="noopener noreferrer"
            v-show="store.providerLink.value"
          >
            <PbIcon :icon="PhLinkSimple" />
            <span id="tradfiProviderLinkLabel">{{ store.providerLink.value ? store.providerLink.value.label || t('misc.apikeys.getApiKey') : '' }}</span>
          </a>
        </div>
        <div class="form-group flex flex-col gap-1.5">
          <Label for="tradfiLabel">{{ t('misc.apikeys.label') }}</Label>
          <Input type="text" id="tradfiLabel" v-model="store.label.value" maxlength="120" :placeholder="t('misc.apikeys.profileLabel')" />
        </div>
        <div class="tradfi-toggle-group flex min-h-8 items-center gap-5 rounded-md border border-border-subtle bg-card px-3 py-2 max-[900px]:col-span-2 max-[768px]:col-span-1">
          <label class="flex cursor-pointer items-center gap-2 text-sm text-secondary hover:text-primary">
            <Checkbox id="tradfiShared" v-model="store.shared.value" />
            <span>{{ t('misc.apikeys.shared') }}</span>
          </label>
          <label class="flex cursor-pointer items-center gap-2 text-sm text-secondary hover:text-primary">
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
          <div class="mt-1 text-xs leading-relaxed text-muted">{{ t('misc.apikeys.clickEyeToReveal') }}</div>
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
      <div class="tradfi-editor-status grid gap-2 border-t border-border-subtle bg-card/35 px-4 py-3 text-sm text-secondary">
        <p id="tradfiProviderNote" class="m-0" :class="store.providerNote.value ? '' : 'hidden'">{{ store.providerNote.value }}</p>
        <p id="tradfiProfileStatus" class="m-0 [overflow-wrap:anywhere]">{{ store.profileStatus.value }}</p>
      </div>
      <div id="tradfiActions" class="flex flex-wrap items-center gap-2 border-t border-border-subtle bg-card px-4 py-3 max-[768px]:items-stretch">
        <Button type="button" variant="info" size="sm" class="max-[768px]:flex-[1_1_150px]" :disabled="store.actionBusy.value" @click="store.tradfiTest()">
          <span v-if="store.testing.value === 'test'" class="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-secondary border-t-accent align-middle"></span>
          <PbIcon v-else :icon="PhPlugsConnected" :size="14" />
          {{ t('misc.apikeys.testConnection') }}
        </Button>
        <Button type="button" variant="primary" size="sm" id="btnTradfiSave" class="max-[768px]:flex-[1_1_150px]" :disabled="store.actionBusy.value" @click="store.tradfiSave(false)">
          <PbIcon :icon="PhFloppyDisk" :size="14" />
          {{ t('misc.apikeys.createUpdate') }}
        </Button>
        <Button type="button" variant="secondary" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiRotate" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiSave(true)">
          <PbIcon :icon="PhArrowClockwise" :size="14" />
          {{ t('misc.apikeys.rotateReplacement') }}
        </Button>
        <Button type="button" variant="secondary" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiToggle" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiToggleActive()">
          <PbIcon :icon="PhPower" :size="14" />
          {{ store.toggleLabel.value }}
        </Button>
        <Button type="button" variant="danger" size="sm" class="max-[768px]:flex-[1_1_150px]" id="btnTradfiDelete" :disabled="store.actionBusy.value || !store.selectedProfile.value" @click="store.tradfiClear()">
          <PbIcon :icon="PhTrash" :size="14" />
          {{ t('misc.apikeys.deleteProfile') }}
        </Button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tradfi-workbench {
  color: var(--text-primary);
}

.tradfi-intro-card,
.tradfi-recommendation,
.tradfi-section,
.tradfi-page-head {
  box-shadow: var(--shadow-panel);
}

.tradfi-recommendation {
  position: relative;
  padding-left: 3.25rem;
}

.tradfi-recommendation::before {
  content: "i";
  position: absolute;
  top: 0.75rem;
  left: 1rem;
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border: 1px solid rgb(var(--accent-rgb) / 0.35);
  border-radius: var(--radius-full);
  background: var(--accent-bg);
  color: var(--accent-soft);
  font-size: var(--text-xs);
  font-weight: 700;
}

.tradfi-recommendation :deep(strong) {
  color: var(--accent-soft);
}

.tradfi-profile-wrap {
  background: var(--surface-panel);
  scrollbar-color: var(--border-strong) transparent;
  scrollbar-width: thin;
}

.tradfi-profile-wrap::-webkit-scrollbar {
  height: 6px;
}

.tradfi-profile-wrap::-webkit-scrollbar-thumb {
  border-radius: var(--radius-full);
  background: var(--border-strong);
}

.tradfi-profile-table th {
  font-size: var(--text-xs);
  font-weight: 650;
  letter-spacing: var(--tracking-label);
  text-transform: uppercase;
}

.tradfi-profile-table tbody tr {
  outline: none;
}

.tradfi-profile-table tbody tr:focus-visible td {
  background: rgb(var(--accent-rgb) / 0.08);
}

.tradfi-profile-table tbody tr:focus-visible td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.tradfi-profile-table tbody tr:hover td {
  background: rgb(var(--text-secondary-rgb) / 0.05);
}

.tradfi-profile-table tbody tr.selected td {
  background: var(--accent-bg);
}

.tradfi-profile-table tbody tr.selected td:first-child {
  box-shadow: inset 3px 0 0 var(--accent);
}

.tradfi-profile-table tbody tr:last-child td {
  border-bottom: 0;
}

.tradfi-editor-head,
.tradfi-editor-status,
.tradfi-projection-status {
  background-color: rgb(var(--bg-panel-rgb) / 0.55);
}

.tradfi-provider-link:focus-visible {
  border-radius: var(--radius-sm);
  outline: none;
  box-shadow: var(--focus-ring);
}

@media (max-width: 768px) {
  .tradfi-page-mark {
    display: none;
  }

  .tradfi-recommendation {
    padding-left: 3.25rem;
  }
}
</style>
