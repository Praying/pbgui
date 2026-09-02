<script setup lang="ts">
/*
 * Welcome page — the Vue port of frontend/welcome.html (1,597 lines; legacy
 * line refs below are provenance):
 *
 * ┌──────────────────────────┬─ Legacy regions ────────────────────────────┐
 * │ App (this shell)         │ markup :744-920, globals :923-976, wiring   │
 * │                          │ :1526-1587                                  │
 * │ useWelcome               │ bootstrap :1435-1445, render* :1283-1356,    │
 * │                          │ save/setup+password :****-****, browser      │
 * │                          │ :1039-1157, banner :1002-1011                │
 * │ loginSecurity lib        │ loginSecuritySummary :1248-1264              │
 * │ config                   │ %%TOKEN%%/%%API_ORIGIN%% :925-935, next :937 │
 * └──────────────────────────┴─────────────────────────────────────────────┘
 *
 * NOT PORTED (documented):
 *  - updateActiveSectionFromScroll (:1159-1175) — dead in legacy: only one
 *    section is ever un-hidden at a time (focusSection :1028-1037), so the
 *    scroll-proximity loop always resolved to that single visible section.
 *  - in-page sidebar + resize (:744-769, :1564-1585) — sections moved into
 *    the workbench rail (AppShell sections API); the disabled password
 *    section replaces the openPasswordSection guard (:1501-1508).
 *
 * Deliberate deviations (documented):
 *  - The token lives in the store (cleared when bootstrap reports an
 *    unauthenticated session :1439) — boot.js supplies the initial value.
 *  - The disable-auth confirm keeps the PBGuiDialogs global (same script as
 *    legacy :922); Escape closes the file browser (:1556-1561) and the
 *    browser modal closes via its own buttons/backdrop-free paths only.
 *
 * Styling: the legacy styles/welcome.css rules became Tailwind utilities on
 * this template plus lib/uiClasses.ts (shared/variant sets); the <style>
 * block below carries what utilities cannot express. Legacy class names
 * stay on the elements as inert anchors for the suite and the shared
 * components.css chrome.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { PhQuestion } from '@phosphor-icons/vue';
import { useI18n } from 'vue-i18n';
import { useAiPageContext } from '@/shared/ai/context';
import AppShell from '@/shared/components/AppShell.vue';
import IconButton from '@/shared/components/IconButton.vue';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
} from '@/shared/components/ui/select';
import type { PageSection } from '@/shared/navigation';
import { useWelcome } from './composables/useWelcome';
import { apiOrigin, bootSerial, bootVersion } from './config';
import {
  bannerClass,
  browserEntryClass,
  issueToneClass,
  statusBadgeToneClass,
} from './lib/uiClasses';

const { t } = useI18n();

/* AI drawer page context — Vue port of the legacy welcome registration. */
useAiPageContext({
  id: 'welcome',
  getContext: () => ({
    section: store.activeSection.value === 'password' ? 'Authentication settings' : store.activeSection.value,
  }),
});

const store = useWelcome({ t: (key, params) => t(key, params ?? {}) });

/* Meta pills (:1414-1415): bootstrap payload version/serial win, falling
   back to the boot-injected %%VERSION%%/%%SERIAL%% until it loads. */
const metaVersion = computed(() => String(store.bootstrap.value?.version || bootVersion() || ''));
const metaSerial = computed(() => String(store.bootstrap.value?.serial || bootSerial() || ''));
const apiOriginText = apiOrigin();

/* Page sections live in the rail (accordion under the active page).
   Password stays listed but inert until the session authenticates —
   the disabled state replaces the legacy guard branch. */
const sections = computed<PageSection[]>(() => [
  { key: 'overview', label: t('misc.welcome.overview') },
  { key: 'setup', label: t('misc.welcome.setup') },
  { key: 'password', label: t('misc.welcome.password'), disabled: !store.canSave.value },
]);

function onSectionSelect(sectionKey: string): void {
  if (sectionKey === 'overview' || sectionKey === 'setup' || sectionKey === 'password') {
    store.focusSection(sectionKey);
  }
}

const statusGroups = computed(() => {
  const rows = store.statusRows.value;
  return [
    { key: 'security', label: t('misc.welcome.security'), rows: rows.slice(0, 1) },
    { key: 'pb7', label: 'PB7', rows: rows.slice(1, 4) },
    { key: 'pb8', label: t('misc.welcome.pb8OptionalGroup'), rows: rows.slice(4, 8) },
    { key: 'node', label: t('misc.welcome.node'), rows: rows.slice(8) },
  ];
});

const browserTitle = computed(() => {
  const target = store.fileBrowser.value.target || '';
  const version = target.indexOf('pb8') === 0 ? 'V8' : 'V7';
  return target.endsWith('venv')
    ? t('misc.welcome.selectPythonInterpreter', { version })
    : t('misc.welcome.selectPassivbotPath', { version });
});

const currentPwVisible = ref(false);
const newPwVisible = ref(false);

/* disable-auth confirm via the legacy PBGuiDialogs global (:1503-1509) —
   local casts, not declare global: another page's PBGuiDialogs shape must
   not merge into the global Window type across page bundles. */
type DialogsGlobal = { confirm?: (options: Record<string, unknown>) => Promise<boolean> };
type SharedHelpGlobal = { open?: (keyword: string, opts: { token: string }) => void };

function confirmDialog(options: Record<string, unknown>): Promise<boolean> {
  const dialogs = (window as Window & { PBGuiDialogs?: DialogsGlobal }).PBGuiDialogs;
  if (dialogs?.confirm) return dialogs.confirm(options);
  return Promise.resolve(window.confirm(String(options.message)) as boolean);
}

async function onDisableAuth(): Promise<void> {
  await store.disableAuthentication(confirmDialog);
}

/* ── file browser keyboard (:1556-1561) ── */

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && store.fileBrowser.value.open) {
    store.closeFileBrowser();
  }
}

/* ── help opener (:969-974) ── */

function openWelcomeHelp(): void {
  const sharedHelp = (window as Window & { PBGuiSharedHelp?: SharedHelpGlobal }).PBGuiSharedHelp;
  if (!sharedHelp || typeof sharedHelp.open !== 'function') return;
  sharedHelp.open('welcome', { token: store.token.value });
}

onMounted(() => {
  document.title = t('misc.welcome.title');
  (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER = openWelcomeHelp;
  document.addEventListener('keydown', onKeydown);
  void store.loadBootstrap();
});


onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});
</script>

<template>
  <MigrationWatermark />
  <AppShell
    class="core-workbench-shell core-workbench-shell--welcome"
    page-key="/"
    :page-title="t('misc.welcome.welcome')"
    :page-family="t('nav.system')"
    :status-text="store.summaryView.value.auth"
    :status-tone="store.summaryView.value.authTone === 'info' ? 'neutral' : store.summaryView.value.authTone"
    :sections="sections"
    :active-section="store.activeSection.value"
    @update:section="onSectionSelect"
  >
    <template #header-actions>
      <IconButton
        class="pbgui-icon-button"
        :icon="PhQuestion"
        :label="t('nav.guide')"
        @click="openWelcomeHelp"
      />
    </template>

    <div id="page-body" class="relative flex h-[calc(100dvh_-_var(--nav-height))] min-h-0 overflow-hidden select-none bg-[linear-gradient(135deg,rgb(var(--bg-page-rgb)/0.98),rgb(var(--bg-panel-rgb)/0.96))]">
    <div class="workbench-page-content min-w-0 min-h-0 flex-1 overflow-y-auto select-text bg-page bg-[radial-gradient(circle_at_92%_0%,rgb(var(--accent-rgb)/0.1),transparent_28rem),radial-gradient(circle_at_4%_78%,rgb(var(--accent-rgb)/0.05),transparent_24rem),repeating-linear-gradient(135deg,rgb(var(--text-secondary-rgb)/0.018)_0_1px,transparent_1px_42px)] p-[var(--page-padding)]">
      <div id="banner" class="banner mb-3 rounded-[12px] py-3 px-3.5 text-base leading-[1.5]" :class="bannerClass(store.banner.value.message, store.banner.value.kind)">
        {{ store.banner.value.message }}
      </div>

      <!-- Overview -->
      <section id="section-overview" class="page-section grid w-[min(100%,1440px)] gap-4.5 mx-auto mb-5 scroll-mt-4" data-section="overview" :hidden="store.activeSection.value !== 'overview'">
        <div class="panel pbgui-panel overview-panel relative grid gap-4.5 overflow-hidden rounded-[14px] border border-border-subtle bg-[radial-gradient(circle_at_right_top,rgb(var(--accent-rgb)/0.1),transparent_34%),linear-gradient(180deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-page-rgb)/0.98))] shadow-[0_4px_14px_rgba(5,8,14,0.12)] p-5 max-[640px]:p-4">
          <div class="overview-header flex items-start justify-between gap-5 pb-5 border-b border-b-secondary/14 max-[980px]:flex-col">
            <div class="overview-heading min-w-0">
              <h1 class="overview-title m-0 max-w-none text-[clamp(28px,3vw,36px)] leading-[1.15] tracking-[-0.035em]">{{ t('misc.welcome.systemOverview') }}</h1>
              <p class="overview-copy mt-2.5 max-w-[58ch] text-primary leading-[1.5]">{{ t('misc.welcome.overviewCopy') }}</p>
            </div>
            <div class="meta-strip flex min-w-0 flex-wrap justify-end gap-1.5 m-0 max-[980px]:justify-start max-[640px]:grid max-[640px]:w-full max-[640px]:grid-cols-1" aria-label="PBGui runtime metadata">
              <div class="meta-pill inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-secondary/14 bg-page/42 px-2.5 py-1.75 text-xs text-secondary"><strong class="text-primary font-bold">{{ t('misc.welcome.version') }}</strong> <span id="meta-version">{{ metaVersion }}</span></div>
              <div class="meta-pill inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-secondary/14 bg-page/42 px-2.5 py-1.75 text-xs text-secondary"><strong class="text-primary font-bold">{{ t('misc.welcome.serial') }}</strong> <span id="meta-serial">{{ metaSerial }}</span></div>
              <div class="meta-pill meta-pill-wide inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-secondary/14 bg-page/42 px-2.5 py-1.75 text-xs text-secondary"><strong class="text-primary font-bold">{{ t('misc.welcome.api') }}</strong> <span id="meta-origin" class="min-w-0 truncate">{{ apiOriginText }}</span></div>
            </div>
          </div>
          <div class="summary-grid grid grid-cols-4 gap-3 max-[1400px]:grid-cols-2 max-[640px]:grid-cols-1">
            <div class="summary-card relative min-w-0 overflow-hidden min-h-[126px] max-[640px]:min-h-0 rounded-[12px] border border-secondary/14 bg-page/44 pt-3.75 pr-4 pb-3.75 pl-4.5 transition-[transform,border-color,background] duration-[0.18s] ease-[ease]" :class="`summary-card--${store.summaryView.value.authTone}`" :data-tone="store.summaryView.value.authTone">
              <span class="summary-label block mb-1.75 text-xs font-bold uppercase tracking-[0.08em]">{{ t('misc.welcome.session') }}</span>
              <strong id="summary-auth" class="block mb-1.5 truncate text-lg leading-[1.3] text-primary font-bold">{{ store.summaryView.value.auth }}</strong>
              <p class="summary-copy m-0 text-base text-secondary leading-[1.55]" id="summary-auth-copy">{{ store.summaryView.value.authCopy }}</p>
            </div>
            <div class="summary-card summary-card--actionable relative min-w-0 overflow-hidden min-h-[126px] max-[640px]:min-h-0 rounded-[12px] border border-secondary/14 bg-page/44 pt-3.75 pr-4 pb-3.75 pl-4.5 transition-[transform,border-color,background] duration-[0.18s] ease-[ease] flex flex-col items-start" :class="`summary-card--${store.summaryView.value.pb7Tone}`" :data-tone="store.summaryView.value.pb7Tone">
              <span class="summary-label block mb-1.75 text-xs font-bold uppercase tracking-[0.08em]">PB7</span>
              <strong id="summary-pb7" class="block mb-1.5 truncate text-lg leading-[1.3] text-primary font-bold">{{ store.summaryView.value.pb7 }}</strong>
              <p class="summary-copy m-0 text-base text-secondary leading-[1.55]" id="summary-pb7-copy">{{ store.summaryView.value.pb7Copy }}</p>
              <Button
                v-if="store.summaryView.value.pb7Tone !== 'success'"
                type="button"
                variant="secondary"
                size="sm"
                class="summary-action mt-auto"
                @click="store.focusSection('setup')"
              >{{ t('misc.welcome.configurePb7') }}</Button>
            </div>
            <div class="summary-card relative min-w-0 overflow-hidden min-h-[126px] max-[640px]:min-h-0 rounded-[12px] border border-secondary/14 bg-page/44 pt-3.75 pr-4 pb-3.75 pl-4.5 transition-[transform,border-color,background] duration-[0.18s] ease-[ease]" :class="`summary-card--${store.summaryView.value.pb8Tone}`" :data-tone="store.summaryView.value.pb8Tone">
              <span class="summary-label block mb-1.75 text-xs font-bold uppercase tracking-[0.08em]">PB8</span>
              <strong id="summary-pb8" class="block mb-1.5 truncate text-lg leading-[1.3] text-primary font-bold">{{ store.summaryView.value.pb8 }}</strong>
              <p class="summary-copy m-0 text-base text-secondary leading-[1.55]" id="summary-pb8-copy">{{ store.summaryView.value.pb8Copy }}</p>
            </div>
            <div class="summary-card relative min-w-0 overflow-hidden min-h-[126px] max-[640px]:min-h-0 rounded-[12px] border border-secondary/14 bg-page/44 pt-3.75 pr-4 pb-3.75 pl-4.5 transition-[transform,border-color,background] duration-[0.18s] ease-[ease]" :class="`summary-card--${store.summaryView.value.identityTone}`" :data-tone="store.summaryView.value.identityTone">
              <span class="summary-label block mb-1.75 text-xs font-bold uppercase tracking-[0.08em]">{{ t('misc.welcome.identity') }}</span>
              <strong id="summary-identity" :title="store.summaryView.value.identity" class="block mb-1.5 truncate text-lg leading-[1.3] text-primary font-bold">{{ store.summaryView.value.identity }}</strong>
              <p class="summary-copy m-0 text-base text-secondary leading-[1.55]" id="summary-role">{{ store.summaryView.value.roleText }}</p>
            </div>
          </div>
        </div>
        <div class="section-heading flex flex-col gap-1 mb-2 px-0.5 pt-0.5 pb-0">
          <span class="section-kicker text-sm font-bold uppercase tracking-[0.08em] text-accent-soft">{{ t('misc.welcome.runtime') }}</span>
          <p class="section-copy m-0 text-base">{{ t('misc.welcome.runtimeCopy') }}</p>
        </div>
        <div class="panel pbgui-panel rounded-[14px] border border-secondary/13 bg-card shadow-[0_18px_42px_rgba(5,8,14,0.18),0_1px_rgba(255,255,255,0.025)_inset] p-5 max-[640px]:p-4">
          <h2 class="panel-title m-0 mb-2 text-lg text-primary">{{ t('misc.welcome.runtimeStatus') }}</h2>
          <div class="status-list grid gap-3.5 mt-4.5" id="status-list">
            <section v-for="group in statusGroups" :key="group.key" class="status-group grid gap-2" :data-group="group.key">
              <h3 class="status-group-title m-0 text-muted text-xs font-bold uppercase tracking-[0.09em]">{{ group.label }}</h3>
              <div class="status-group-rows grid gap-2">
                <div v-for="row in group.rows" :key="row.label" class="status-row grid grid-cols-[130px_110px_minmax(0,1fr)] gap-2.5 items-center rounded-[10px] border border-secondary/12 bg-page/35 px-3.75 py-3.25 transition-[background,border-color] duration-[0.18s] ease-[ease] hover:border-accent/20 hover:bg-panel/48 max-[980px]:grid-cols-[minmax(120px,0.45fr)_minmax(0,1fr)] max-[640px]:grid-cols-1">
                  <div class="status-label text-primary font-bold">{{ row.label }}</div>
                  <div class="status-value status-badge w-fit min-w-[72px] px-2 py-1 rounded-full text-center text-sm font-bold uppercase tracking-[0.04em]" :class="[`status-badge--${row.tone}`, statusBadgeToneClass(row.tone)]" :data-tone="row.tone">{{ row.state }}</div>
                  <div class="status-detail text-secondary min-w-0 [overflow-wrap:anywhere] max-[980px]:col-span-full max-[640px]:col-auto">{{ row.detail }}</div>
                </div>
              </div>
            </section>
          </div>
          <div class="issues grid gap-3.5 mt-4.5" id="issues">
            <div v-if="store.loginSecurityBanner.value.showAck" class="issue warning login-security-warning flex items-center justify-between gap-3 py-3 px-3.5 rounded-[12px] text-base leading-[1.5] border border-warning/22 bg-warning-deep/38 text-warning-soft">
              <span class="min-w-0">{{ store.loginSecurityBanner.value.summary }}</span>
              <Button type="button" variant="secondary" class="login-security-ack shrink-0" @click="store.acknowledgeLoginSecurity()">{{
                t('misc.welcome.acknowledge')
              }}</Button>
            </div>
            <div
              v-for="(issue, index) in store.issues.value"
              :key="`${issue.kind}-${index}`"
              class="issue py-3 px-3.5 rounded-[12px] text-base leading-[1.5]"
              :class="[issue.kind, issueToneClass(issue.kind)]"
            >{{ issue.text }}</div>
          </div>
        </div>
      </section>

      <!-- Setup -->
      <section id="section-setup" class="page-section grid w-[min(100%,1600px)] gap-4 mx-auto mb-5 scroll-mt-4" data-section="setup" :hidden="store.activeSection.value !== 'setup'">
        <div class="section-heading settings-section-heading relative flex flex-col gap-1 mb-2 px-1 pt-1 pb-0.5 w-[min(100%,1600px)] max-[1400px]:w-full mx-auto">
          <span class="section-kicker pt-2 text-[16px] font-bold tracking-[-0.01em] text-primary">{{ t('misc.welcome.runtimeSettings') }}</span>
          <p class="section-copy mt-1 max-w-[66ch] text-secondary">{{ t('misc.welcome.runtimeSettingsCopy') }}</p>
        </div>
        <div class="panel settings-panel relative overflow-hidden rounded-[14px] border border-accent/16 bg-[radial-gradient(circle_at_100%_0%,rgb(var(--accent-deep-rgb)/0.08),transparent_24rem),linear-gradient(145deg,rgb(var(--bg-panel-rgb)/0.98),rgb(var(--bg-panel-rgb)/0.98))] shadow-[0_18px_42px_rgba(5,8,14,0.18),0_1px_rgba(255,255,255,0.025)_inset] p-[clamp(18px,2.5vw,28px)] max-[640px]:p-4 w-[min(100%,1600px)] max-[1400px]:w-full mx-auto">
          <div class="panel-heading settings-panel-heading pb-5 border-b border-b-secondary/14">
            <h2 class="panel-title m-0 mb-1.5 text-[20px] tracking-[-0.02em] text-primary">{{ t('misc.welcome.passivbotSetup') }}</h2>
            <p class="panel-copy m-0 max-w-[78ch] text-secondary text-base leading-[1.55]">{{ t('misc.welcome.passivbotSetupCopy') }}</p>
          </div>

          <div class="runtime-groups grid grid-cols-2 gap-4 mt-5.5 max-[980px]:grid-cols-1">
            <section class="runtime-group runtime-group--pb7 relative min-w-0 overflow-hidden rounded-[12px] border border-secondary/13 bg-page/44 p-4.5 max-[640px]:p-4 shadow-[0_10px_24px_rgba(5,8,14,0.12)]" aria-labelledby="pb7-group-title">
              <div class="group-heading flex items-center gap-2.5 mb-4.5 max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-1.75">
                <h3 id="pb7-group-title" class="group-title m-0 text-primary text-md leading-[1.3] tracking-[0.01em]">PB7</h3>
                <span class="group-caption px-1.75 py-0.75 rounded-full border border-secondary/12 bg-secondary/6 text-muted text-xs">Passivbot V7</span>
              </div>
              <div class="field-grid grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
                <div class="field full flex flex-col gap-1.75 col-span-full">
                  <Label for="pb7dir">{{ t('misc.welcome.passivbotV7Path') }}</Label>
                  <div class="field-browse grid grid-cols-[minmax(0,1fr)_62px] gap-2 items-center max-[640px]:grid-cols-1">
                    <Input id="pb7dir" v-model="store.pb7dir.value" type="text" placeholder="/path/to/pb7" />
                    <Button id="browse-pb7dir-btn" variant="info" class="browse-btn min-w-[62px]" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb7dir', 'directory')">{{ t('misc.welcome.browse') }}</Button>
                  </div>
                </div>
                <div class="field full flex flex-col gap-1.75 col-span-full">
                  <Label for="pb7venv">{{ t('misc.welcome.passivbotV7Python') }}</Label>
                  <div class="field-browse grid grid-cols-[minmax(0,1fr)_62px] gap-2 items-center max-[640px]:grid-cols-1">
                    <Input id="pb7venv" v-model="store.pb7venv.value" type="text" placeholder="/path/to/venv/bin/python" />
                    <Button id="browse-pb7venv-btn" variant="info" class="browse-btn min-w-[62px]" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb7venv', 'python')">{{ t('misc.welcome.browse') }}</Button>
                  </div>
                </div>
              </div>
            </section>

            <section class="runtime-group runtime-group--pb8 relative min-w-0 overflow-hidden rounded-[12px] border border-secondary/13 bg-page/44 p-4.5 max-[640px]:p-4 shadow-[0_10px_24px_rgba(5,8,14,0.12)]" aria-labelledby="pb8-group-title">
              <div class="group-heading flex items-center gap-2.5 mb-4.5 max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-1.75">
                <h3 id="pb8-group-title" class="group-title m-0 text-primary text-md leading-[1.3] tracking-[0.01em]">PB8</h3>
                <span class="group-caption px-1.75 py-0.75 rounded-full border border-secondary/12 bg-secondary/6 text-muted text-xs">Passivbot V8 · optional</span>
              </div>
              <div class="field-grid grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
                <div class="field full flex flex-col gap-1.75 col-span-full">
                  <Label for="pb8dir">{{ t('misc.welcome.passivbotV8Path') }}</Label>
                  <div class="field-browse grid grid-cols-[minmax(0,1fr)_62px] gap-2 items-center max-[640px]:grid-cols-1">
                    <Input id="pb8dir" v-model="store.pb8dir.value" type="text" placeholder="/path/to/pb8" />
                    <Button id="browse-pb8dir-btn" variant="info" class="browse-btn min-w-[62px]" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb8dir', 'directory')">{{ t('misc.welcome.browse') }}</Button>
                  </div>
                </div>
                <div class="field full flex flex-col gap-1.75 col-span-full">
                  <Label for="pb8venv">{{ t('misc.welcome.passivbotV8Python') }}</Label>
                  <div class="field-browse grid grid-cols-[minmax(0,1fr)_62px] gap-2 items-center max-[640px]:grid-cols-1">
                    <Input id="pb8venv" v-model="store.pb8venv.value" type="text" placeholder="/path/to/venv_pb8/bin/python" />
                    <Button id="browse-pb8venv-btn" variant="info" class="browse-btn min-w-[62px]" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb8venv', 'python')">{{ t('misc.welcome.browse') }}</Button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section class="identity-section mt-6 pt-5 border-t border-t-secondary/12" aria-labelledby="identity-section-title">
            <div class="section-divider flex items-center gap-3 mb-4">
              <h3 id="identity-section-title" class="group-title m-0 text-primary text-md leading-[1.3] tracking-[0.01em]">{{ t('misc.welcome.identity') }}</h3>
            </div>
            <div class="field-grid identity-grid grid grid-cols-2 gap-4 max-[980px]:grid-cols-1">
              <div class="field flex flex-col gap-1.75">
                <Label for="pbname">{{ t('misc.welcome.botName') }}</Label>
                <Input id="pbname" v-model="store.pbname.value" type="text" maxlength="32" />
              </div>
              <div class="field flex flex-col gap-1.75">
                <Label id="role-label" for="role">{{ t('misc.welcome.role') }}</Label>
                <SelectRoot v-model="store.role.value">
                  <SelectTrigger id="role" aria-labelledby="role-label">
                    <span>{{ store.role.value === 'master' ? t('misc.welcome.master') : t('misc.welcome.slave') }}</span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slave">{{ t('misc.welcome.slave') }}</SelectItem>
                    <SelectItem value="master">{{ t('misc.welcome.master') }}</SelectItem>
                  </SelectContent>
                </SelectRoot>
              </div>
            </div>
          </section>

          <div class="actions settings-actions flex flex-wrap gap-2 items-center justify-end mt-6 pt-4.5 border-t border-t-secondary/14 max-[640px]:flex-col max-[640px]:items-stretch">
            <span class="settings-action-note mr-auto max-w-[62ch] text-muted text-sm leading-[1.45] max-[640px]:mr-0">{{ t('misc.welcome.saveSetupHint') }}</span>
            <Button id="save-setup-btn" variant="primary" size="lg" class="min-w-24" :disabled="!store.canSave.value" @click="store.saveSetup()">{{ t('misc.welcome.saveSetup') }}</Button>
          </div>
        </div>
      </section>

      <!-- Password -->
      <section id="section-password" class="page-section password-section grid w-[min(100%,860px)] gap-4.5 mx-auto mb-5 scroll-mt-4" data-section="password" :hidden="store.activeSection.value !== 'password'">
        <div class="section-heading password-section-heading flex flex-col gap-1 mb-2 px-0.5 pt-0.5 pb-0 w-[min(100%,860px)] mx-auto">
          <span class="section-kicker text-sm font-bold uppercase tracking-[0.08em] text-accent-soft">{{ t('misc.welcome.security') }}</span>
          <p class="section-copy m-0 text-base">{{ t('misc.welcome.securityCopy') }}</p>
        </div>
        <div class="panel password-panel rounded-[14px] border border-secondary/13 bg-card shadow-[0_18px_42px_rgba(5,8,14,0.18),0_1px_rgba(255,255,255,0.025)_inset] p-6 max-[640px]:p-4 w-[min(100%,860px)] mx-auto">
          <h2 class="panel-title m-0 mb-2 text-lg text-primary" id="password-panel-title">{{
            store.authDisabled.value ? t('misc.welcome.enableAuthentication') : t('misc.welcome.changePassword')
          }}</h2>
          <p class="panel-copy m-0 text-base leading-[1.55] text-secondary" id="password-panel-copy">{{
            store.authDisabled.value ? t('misc.welcome.setPasswordToEnable') : t('misc.welcome.changePasswordSignsOut')
          }}</p>
          <div class="field-grid password-field-grid grid grid-cols-1 gap-3.5 mt-4.5">
            <div class="field flex flex-col gap-1.5">
              <Label for="current-password">{{ t('misc.welcome.currentPassword') }}</Label>
              <div class="pw-wrap relative flex items-center">
                <Input id="current-password" v-model="store.currentPassword.value" :type="currentPwVisible ? 'text' : 'password'" autocomplete="current-password" :disabled="store.authDisabled.value" class="flex-1 pr-[74px]" />
                <Button type="button" variant="ghost" size="sm" class="pw-eye-btn absolute right-1.25 top-1 bottom-1 px-2 text-xs font-bold" :aria-label="t('misc.welcome.showHideCurrentPassword')" @click="currentPwVisible = !currentPwVisible">{{ currentPwVisible ? t('misc.welcome.hidePassword') : t('misc.welcome.showPassword') }}</Button>
              </div>
            </div>
            <div class="field flex flex-col gap-1.5">
              <Label for="new-password">{{ t('misc.welcome.newPassword') }}</Label>
              <div class="pw-wrap relative flex items-center">
                <Input id="new-password" v-model="store.newPassword.value" :type="newPwVisible ? 'text' : 'password'" autocomplete="new-password" class="flex-1 pr-[74px]" @keydown.enter="store.changePassword()" />
                <Button type="button" variant="ghost" size="sm" class="pw-eye-btn absolute right-1.25 top-1 bottom-1 px-2 text-xs font-bold" :aria-label="t('misc.welcome.showHideNewPassword')" @click="newPwVisible = !newPwVisible">{{ newPwVisible ? t('misc.welcome.hidePassword') : t('misc.welcome.showPassword') }}</Button>
              </div>
            </div>
          </div>
          <div class="actions password-actions flex flex-wrap gap-2 mt-5">
            <Button id="change-password-btn" variant="primary" @click="store.changePassword()">{{
              store.authDisabled.value ? t('misc.welcome.enablePasswordAuthentication') : t('misc.welcome.changePassword')
            }}</Button>
          </div>
          <div v-if="!store.authDisabled.value" class="password-danger-zone flex items-center justify-between gap-5 mt-6 pt-4.5 border-t border-t-danger/20 max-[640px]:flex-col max-[640px]:items-stretch">
            <div>
              <h3 class="danger-zone-title m-0 mb-1.25 text-danger-soft text-md">{{ t('misc.welcome.disableAuthentication') }}</h3>
              <p class="danger-zone-copy m-0 max-w-[58ch] text-secondary leading-[1.45]">{{ t('misc.welcome.disableAuthenticationCopy') }}</p>
            </div>
            <Button id="disable-auth-btn" variant="danger" type="button" @click="onDisableAuth()">{{ t('misc.welcome.disableAuthentication') }}</Button>
          </div>
        </div>
      </section>
      </div>
    </div>
  </AppShell>

  <!-- File browser modal (:907-920) -->
  <div id="file-browser-modal" class="browser-modal fixed inset-0 z-[4100] flex items-center justify-center p-5 bg-page/78 backdrop-blur-[6px]" :hidden="!store.fileBrowser.value.open">
    <div class="panel browser-dialog flex flex-col gap-3 w-[min(860px,calc(100vw_-_40px))] max-h-[calc(100dvh_-_48px)] rounded-[14px] border border-secondary/13 bg-card shadow-[0_18px_42px_rgba(5,8,14,0.18),0_1px_rgba(255,255,255,0.025)_inset] p-5 max-[640px]:p-4" role="dialog" aria-modal="true" aria-labelledby="file-browser-title">
      <div class="browser-head flex items-center justify-between gap-3">
        <h2 id="file-browser-title" class="panel-title m-0 mb-2 text-lg text-primary">{{ browserTitle }}</h2>
        <Button id="file-browser-close" variant="secondary" type="button" @click="store.closeFileBrowser()">{{ t('common.close') }}</Button>
      </div>
      <div class="browser-toolbar flex flex-wrap gap-2 items-center">
        <Button id="file-browser-up" variant="secondary" type="button" :disabled="!store.fileBrowser.value.parentPath || store.fileBrowser.value.parentPath === store.fileBrowser.value.currentPath" @click="store.loadFileBrowser(store.fileBrowser.value.parentPath)">{{ t('misc.welcome.up') }}</Button>
        <Button id="file-browser-select" variant="primary" type="button" :disabled="store.fileBrowser.value.mode === 'python' && !store.fileBrowser.value.selectedPath" @click="store.applyFileBrowserSelection()">{{
          store.fileBrowser.value.mode === 'directory' ? t('misc.welcome.selectThisFolder') : t('misc.welcome.selectSelectedFile')
        }}</Button>
        <Input id="file-browser-path" class="browser-path flex-1 min-w-[280px]" type="text" readonly :model-value="store.fileBrowser.value.currentPath" />
      </div>
      <div id="file-browser-list" class="browser-list grid gap-1 min-h-60 max-h-[420px] overflow-y-auto p-1 rounded-[12px] border border-border-subtle bg-page">
        <div v-if="!store.fileBrowser.value.entries.length" class="browser-empty py-3 px-3.5 rounded-[10px] border border-dashed border-secondary/22 text-secondary text-center">{{ t('misc.welcome.noMatchingEntries') }}</div>
        <button
          v-for="entry in store.fileBrowser.value.entries"
          :key="entry.path"
          type="button"
          class="browser-entry"
          :class="browserEntryClass(!entry.is_dir && entry.path === store.fileBrowser.value.selectedPath)"
          @click="entry.is_dir ? store.loadFileBrowser(entry.path) : (store.fileBrowser.value.selectedPath = entry.path)"
        >
          <span class="browser-entry-kind text-muted text-sm font-bold uppercase tracking-[0.06em] shrink-0">{{ entry.is_dir ? 'DIR' : 'PY' }}</span>
          <span>{{ entry.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style>
/* ═══════════════════════════════════════════════════════════════
   Ported from styles/welcome.css (deleted at the Tailwind
   migration). Everything expressible as utilities moved onto this
   template plus lib/uiClasses.ts; the rules below stay as CSS for the
   documented reasons. The block is unscoped on purpose — the old
   stylesheet was page-global and the body rule has no component root
   to scope to.

   Dropped outright (identical values live in the src/styles/
   tailwind.css base + alias layers, or are superseded there): the
   body margin/padding/height/font/colour defaults, the bare
   button/input/select/label rules' font-size, cursor and focus-visible
   outline declarations, .page-section[hidden] and .browser-modal[hidden]
   (the base layer ships [hidden] { display: none !important }), the
   prefers-reduced-motion block, the dead rules for markup that left
   with the rail migration (.chip, .auth-status, .eyebrow, .lead,
   .muted, .grid-two, .route-*) and the declarations that a later
   same/higher-specificity rule in the same file always overrode
   (the media-query paddings under the refinement pass, .summary-action's
   accent tints under .btn-secondary, .settings-section-heading's 2px
   margin under .section-heading).
   ═══════════════════════════════════════════════════════════════ */

/* ── Page root chrome ─────────────────────────────────────────── */
/* Only the declarations that differ from the shared base layer stay:
   the overflow lock and the page's accent glow. */
body {
  overflow: hidden;
  background:
    radial-gradient(circle at 8% 4%, rgb(var(--accent-rgb) / 0.08), transparent 26rem),
    var(--bg-page);
}

/* ── Summary cards ────────────────────────────────────────────── */
/* The tone rides in the --summary-tone custom property so the label,
   the ::before bar and the color-mix() hover border share it — there
   is no utility form for custom-property-driven colour. */
.summary-card {
  --summary-tone: var(--text-secondary);
}
.summary-card--success { --summary-tone: var(--success); }
.summary-card--warning { --summary-tone: var(--warning); }
.summary-card--danger { --summary-tone: var(--danger); }
.summary-card--info { --summary-tone: var(--accent); }
.summary-card--neutral { --summary-tone: var(--text-secondary); }
.summary-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--summary-tone);
}
.summary-label {
  color: var(--summary-tone);
}
.summary-card:hover {
  border-color: color-mix(in srgb, var(--summary-tone) 42%, transparent);
  background: rgb(var(--bg-panel-rgb) / 0.68);
}

/* ── Decorative pseudo-elements ───────────────────────────────── */
.overview-panel::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent) 48%, rgb(var(--accent-rgb) / 0));
}

.section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-subtle);
}
#section-setup .section-divider::after {
  background: linear-gradient(90deg, rgb(var(--text-secondary-rgb) / 0.14), transparent);
}

#section-setup .settings-section-heading::before {
  content: '';
  position: absolute;
  top: 0;
  left: 4px;
  width: 34px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 18px rgb(var(--accent-rgb) / 0.5);
}

#section-setup .settings-panel::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 30%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(var(--accent-soft-rgb) / 0.5));
}

/* ── Runtime-group accents (custom-property driven) ───────────── */
#section-setup .runtime-group::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--runtime-group-accent), transparent 75%);
}
#section-setup .runtime-group--pb7 { --runtime-group-accent: var(--accent); }
#section-setup .runtime-group--pb8 { --runtime-group-accent: var(--success-soft); }
#section-setup .group-heading .group-title::before {
  content: '';
  display: inline-block;
  width: 7px;
  height: 7px;
  margin: 0 8px 1px 0;
  border-radius: 50%;
  background: var(--runtime-group-accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--runtime-group-accent) 65%, transparent);
}

/* ── Status groups ────────────────────────────────────────────── */
/* Adjacent-sibling separator — no utility form. */
.status-group + .status-group {
  padding-top: 4px;
  border-top: 1px solid var(--border-subtle);
}
</style>
