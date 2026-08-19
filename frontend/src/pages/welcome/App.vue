<script setup lang="ts">
/*
 * Welcome page — the Vue port of frontend/welcome.html (1,597 lines; legacy
 * line refs below are provenance):
 *
 * ┌──────────────────────────┬─ Legacy regions ────────────────────────────┐
 * │ App (this shell)         │ markup :744-920, globals :923-976, wiring   │
 * │                          │ :1526-1587, sidebar resize :1564-1585        │
 * │ useWelcome               │ bootstrap :1435-1445, render* :1283-1356,    │
 * │                          │ save/setup+password :1447-1524, browser      │
 * │                          │ :1039-1157, banner :1002-1011                │
 * │ loginSecurity lib        │ loginSecuritySummary :1248-1264              │
 * │ config                   │ %%TOKEN%%/%%API_ORIGIN%% :925-935, next :937 │
 * └──────────────────────────┴─────────────────────────────────────────────┘
 *
 * NOT PORTED (documented):
 *  - updateActiveSectionFromScroll (:1159-1175) — dead in legacy: only one
 *    section is ever un-hidden at a time (focusSection :1028-1037), so the
 *    scroll-proximity loop always resolved to that single visible section.
 *
 * Deliberate deviations (documented):
 *  - The token lives in the store (cleared when bootstrap reports an
 *    unauthenticated session :1439) — boot.js supplies the initial value.
 *  - The disable-auth confirm keeps the PBGuiDialogs global (same script as
 *    legacy :922); Escape closes the file browser (:1556-1561) and the
 *    browser modal closes via its own buttons/backdrop-free paths only.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { useI18n } from 'vue-i18n';
import MigrationWatermark from '@/shared/components/MigrationWatermark.vue';
import { useWelcome } from './composables/useWelcome';
import { apiOrigin, bootSerial, bootVersion } from './config';

const { t } = useI18n();

const store = useWelcome({ t: (key, params) => t(key, params ?? {}) });

/* Meta pills (:1414-1415): bootstrap payload version/serial win, falling
   back to the boot-injected %%VERSION%%/%%SERIAL%% until it loads. */
const metaVersion = computed(() => String(store.bootstrap.value?.version || bootVersion() || ''));
const metaSerial = computed(() => String(store.bootstrap.value?.serial || bootSerial() || ''));
const apiOriginText = apiOrigin();

const sidebarEl = useTemplateRef<HTMLElement>('sidebar');

const SECTIONS = [
  { key: 'overview', labelKey: 'misc.welcome.overview' },
  { key: 'setup', labelKey: 'misc.welcome.setup' },
] as const;

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

function openPasswordSection(): void {
  if (!store.canSave.value) {
    store.setBanner(t('misc.welcome.logInBeforeChangingPassword'), 'error');
    store.focusSection('overview');
    return;
  }
  store.focusSection('password');
}

/* ── sidebar resize (:1564-1585) ── */

let resizeActive = false;

function onResizeMousedown(event: MouseEvent): void {
  event.preventDefault();
  resizeActive = true;
}
function onResizeMousemove(event: MouseEvent): void {
  if (!resizeActive || !sidebarEl.value) return;
  const width = Math.min(420, Math.max(160, event.clientX));
  sidebarEl.value.style.width = width + 'px';
}
function onResizeMouseup(): void {
  resizeActive = false;
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
  document.addEventListener('mousemove', onResizeMousemove);
  document.addEventListener('mouseup', onResizeMouseup);
  void store.loadBootstrap();
});


onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('mousemove', onResizeMousemove);
  document.removeEventListener('mouseup', onResizeMouseup);
  delete (window as Window & { PBGUI_HELP_OPENER?: () => void }).PBGUI_HELP_OPENER;
});
</script>

<template>
  <MigrationWatermark />
  <nav id="topnav"></nav>

  <div id="page-body">
    <div id="sidebar" ref="sidebar">
      <div id="sidebar-sticky">
        <div id="sidebar-header">
          <span class="sb-title">{{ t('misc.welcome.welcome') }}</span>
        </div>
        <div id="sidebar-toolbar">
          <button
            v-for="section in SECTIONS"
            :key="section.key"
            class="sb-btn"
            :class="{ active: store.activeSection.value === section.key }"
            @click="store.focusSection(section.key)"
          >{{ t(section.labelKey) }}</button>
          <hr class="sb-sep">
          <button class="sb-btn" id="sidebar-password-btn" :disabled="!store.canSave.value" @click="openPasswordSection">{{
            t('misc.welcome.password')
          }}</button>
        </div>
      </div>
      <div id="sidebar-resize" @mousedown="onResizeMousedown"></div>
    </div>

    <div id="main-content">
      <div id="banner" class="banner" :class="store.banner.value.message ? `show ${store.banner.value.kind}` : ''">
        {{ store.banner.value.message }}
      </div>

      <!-- Overview -->
      <section id="section-overview" class="page-section" data-section="overview" :hidden="store.activeSection.value !== 'overview'">
        <div class="panel overview-panel">
          <div class="overview-header">
            <div class="overview-heading">
              <h1 class="overview-title">{{ t('misc.welcome.systemOverview') }}</h1>
              <p class="overview-copy">{{ t('misc.welcome.overviewCopy') }}</p>
            </div>
            <div class="meta-strip" aria-label="PBGui runtime metadata">
              <div class="meta-pill"><strong>{{ t('misc.welcome.version') }}</strong> <span id="meta-version">{{ metaVersion }}</span></div>
              <div class="meta-pill"><strong>{{ t('misc.welcome.serial') }}</strong> <span id="meta-serial">{{ metaSerial }}</span></div>
              <div class="meta-pill meta-pill-wide"><strong>{{ t('misc.welcome.api') }}</strong> <span id="meta-origin">{{ apiOriginText }}</span></div>
            </div>
          </div>
          <div class="summary-grid">
            <div class="summary-card" :class="`summary-card--${store.summaryView.value.authTone}`" :data-tone="store.summaryView.value.authTone">
              <span class="summary-label">{{ t('misc.welcome.session') }}</span>
              <strong id="summary-auth">{{ store.summaryView.value.auth }}</strong>
              <p class="summary-copy" id="summary-auth-copy">{{ store.summaryView.value.authCopy }}</p>
            </div>
            <div class="summary-card summary-card--actionable" :class="`summary-card--${store.summaryView.value.pb7Tone}`" :data-tone="store.summaryView.value.pb7Tone">
              <span class="summary-label">PB7</span>
              <strong id="summary-pb7">{{ store.summaryView.value.pb7 }}</strong>
              <p class="summary-copy" id="summary-pb7-copy">{{ store.summaryView.value.pb7Copy }}</p>
              <button
                v-if="store.summaryView.value.pb7Tone !== 'success'"
                type="button"
                class="btn btn-secondary summary-action"
                @click="store.focusSection('setup')"
              >{{ t('misc.welcome.configurePb7') }}</button>
            </div>
            <div class="summary-card" :class="`summary-card--${store.summaryView.value.pb8Tone}`" :data-tone="store.summaryView.value.pb8Tone">
              <span class="summary-label">PB8</span>
              <strong id="summary-pb8">{{ store.summaryView.value.pb8 }}</strong>
              <p class="summary-copy" id="summary-pb8-copy">{{ store.summaryView.value.pb8Copy }}</p>
            </div>
            <div class="summary-card" :class="`summary-card--${store.summaryView.value.identityTone}`" :data-tone="store.summaryView.value.identityTone">
              <span class="summary-label">{{ t('misc.welcome.identity') }}</span>
              <strong id="summary-identity" :title="store.summaryView.value.identity">{{ store.summaryView.value.identity }}</strong>
              <p class="summary-copy" id="summary-role">{{ store.summaryView.value.roleText }}</p>
            </div>
          </div>
        </div>
        <div class="section-heading">
          <span class="section-kicker">{{ t('misc.welcome.runtime') }}</span>
          <p class="section-copy">{{ t('misc.welcome.runtimeCopy') }}</p>
        </div>
        <div class="panel">
          <h2 class="panel-title">{{ t('misc.welcome.runtimeStatus') }}</h2>
          <div class="status-list" id="status-list">
            <section v-for="group in statusGroups" :key="group.key" class="status-group" :data-group="group.key">
              <h3 class="status-group-title">{{ group.label }}</h3>
              <div class="status-group-rows">
                <div v-for="row in group.rows" :key="row.label" class="status-row">
                  <div class="status-label">{{ row.label }}</div>
                  <div class="status-value status-badge" :class="`status-badge--${row.tone}`" :data-tone="row.tone">{{ row.state }}</div>
                  <div class="status-detail">{{ row.detail }}</div>
                </div>
              </div>
            </section>
          </div>
          <div class="issues" id="issues">
            <div v-if="store.loginSecurityBanner.value.showAck" class="issue warning login-security-warning">
              <span>{{ store.loginSecurityBanner.value.summary }}</span>
              <button type="button" class="btn btn-secondary login-security-ack" @click="store.acknowledgeLoginSecurity()">{{
                t('misc.welcome.acknowledge')
              }}</button>
            </div>
            <div
              v-for="(issue, index) in store.issues.value"
              :key="`${issue.kind}-${index}`"
              class="issue"
              :class="issue.kind"
            >{{ issue.text }}</div>
          </div>
        </div>
      </section>

      <!-- Setup -->
      <section id="section-setup" class="page-section" data-section="setup" :hidden="store.activeSection.value !== 'setup'">
        <div class="section-heading settings-section-heading">
          <span class="section-kicker">{{ t('misc.welcome.runtimeSettings') }}</span>
          <p class="section-copy">{{ t('misc.welcome.runtimeSettingsCopy') }}</p>
        </div>
        <div class="panel settings-panel">
          <div class="panel-heading settings-panel-heading">
            <h2 class="panel-title">{{ t('misc.welcome.passivbotSetup') }}</h2>
            <p class="panel-copy">{{ t('misc.welcome.passivbotSetupCopy') }}</p>
          </div>

          <div class="runtime-groups">
            <section class="runtime-group runtime-group--pb7" aria-labelledby="pb7-group-title">
              <div class="group-heading">
                <h3 id="pb7-group-title" class="group-title">PB7</h3>
                <span class="group-caption">Passivbot V7</span>
              </div>
              <div class="field-grid">
                <div class="field full">
                  <label for="pb7dir">{{ t('misc.welcome.passivbotV7Path') }}</label>
                  <div class="field-browse">
                    <input id="pb7dir" v-model="store.pb7dir.value" type="text" placeholder="/path/to/pb7">
                    <button id="browse-pb7dir-btn" class="btn btn-secondary browse-btn" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb7dir', 'directory')">{{ t('misc.welcome.browse') }}</button>
                  </div>
                </div>
                <div class="field full">
                  <label for="pb7venv">{{ t('misc.welcome.passivbotV7Python') }}</label>
                  <div class="field-browse">
                    <input id="pb7venv" v-model="store.pb7venv.value" type="text" placeholder="/path/to/venv/bin/python">
                    <button id="browse-pb7venv-btn" class="btn btn-secondary browse-btn" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb7venv', 'python')">{{ t('misc.welcome.browse') }}</button>
                  </div>
                </div>
              </div>
            </section>

            <section class="runtime-group runtime-group--pb8" aria-labelledby="pb8-group-title">
              <div class="group-heading">
                <h3 id="pb8-group-title" class="group-title">PB8</h3>
                <span class="group-caption">Passivbot V8 · optional</span>
              </div>
              <div class="field-grid">
                <div class="field full">
                  <label for="pb8dir">{{ t('misc.welcome.passivbotV8Path') }}</label>
                  <div class="field-browse">
                    <input id="pb8dir" v-model="store.pb8dir.value" type="text" placeholder="/path/to/pb8">
                    <button id="browse-pb8dir-btn" class="btn btn-secondary browse-btn" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb8dir', 'directory')">{{ t('misc.welcome.browse') }}</button>
                  </div>
                </div>
                <div class="field full">
                  <label for="pb8venv">{{ t('misc.welcome.passivbotV8Python') }}</label>
                  <div class="field-browse">
                    <input id="pb8venv" v-model="store.pb8venv.value" type="text" placeholder="/path/to/venv_pb8/bin/python">
                    <button id="browse-pb8venv-btn" class="btn btn-secondary browse-btn" type="button" :disabled="!store.canSave.value" @click="store.openFileBrowser('pb8venv', 'python')">{{ t('misc.welcome.browse') }}</button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section class="identity-section" aria-labelledby="identity-section-title">
            <div class="section-divider">
              <h3 id="identity-section-title" class="group-title">{{ t('misc.welcome.identity') }}</h3>
            </div>
            <div class="field-grid identity-grid">
              <div class="field">
                <label for="pbname">{{ t('misc.welcome.botName') }}</label>
                <input id="pbname" v-model="store.pbname.value" type="text" maxlength="32">
              </div>
              <div class="field">
                <label for="role">{{ t('misc.welcome.role') }}</label>
                <select id="role" v-model="store.role.value">
                  <option value="slave">{{ t('misc.welcome.slave') }}</option>
                  <option value="master">{{ t('misc.welcome.master') }}</option>
                </select>
              </div>
            </div>
          </section>

          <div class="actions settings-actions">
            <span class="settings-action-note">{{ t('misc.welcome.saveSetupHint') }}</span>
            <button id="save-setup-btn" class="btn btn-primary" :disabled="!store.canSave.value" @click="store.saveSetup()">{{ t('misc.welcome.saveSetup') }}</button>
          </div>
        </div>
      </section>

      <!-- Password -->
      <section id="section-password" class="page-section password-section" data-section="password" :hidden="store.activeSection.value !== 'password'">
        <div class="section-heading password-section-heading">
          <span class="section-kicker">{{ t('misc.welcome.security') }}</span>
          <p class="section-copy">{{ t('misc.welcome.securityCopy') }}</p>
        </div>
        <div class="panel password-panel">
          <h2 class="panel-title" id="password-panel-title">{{
            store.authDisabled.value ? t('misc.welcome.enableAuthentication') : t('misc.welcome.changePassword')
          }}</h2>
          <p class="panel-copy" id="password-panel-copy">{{
            store.authDisabled.value ? t('misc.welcome.setPasswordToEnable') : t('misc.welcome.changePasswordSignsOut')
          }}</p>
          <div class="field-grid password-field-grid">
            <div class="field">
              <label for="current-password">{{ t('misc.welcome.currentPassword') }}</label>
              <div class="pw-wrap">
                <input id="current-password" v-model="store.currentPassword.value" :type="currentPwVisible ? 'text' : 'password'" autocomplete="current-password" :disabled="store.authDisabled.value">
                <button type="button" class="pw-eye-btn" :aria-label="t('misc.welcome.showHideCurrentPassword')" @click="currentPwVisible = !currentPwVisible">{{ currentPwVisible ? t('misc.welcome.hidePassword') : t('misc.welcome.showPassword') }}</button>
              </div>
            </div>
            <div class="field">
              <label for="new-password">{{ t('misc.welcome.newPassword') }}</label>
              <div class="pw-wrap">
                <input id="new-password" v-model="store.newPassword.value" :type="newPwVisible ? 'text' : 'password'" autocomplete="new-password" @keydown.enter="store.changePassword()">
                <button type="button" class="pw-eye-btn" :aria-label="t('misc.welcome.showHideNewPassword')" @click="newPwVisible = !newPwVisible">{{ newPwVisible ? t('misc.welcome.hidePassword') : t('misc.welcome.showPassword') }}</button>
              </div>
            </div>
          </div>
          <div class="actions password-actions">
            <button id="change-password-btn" class="btn btn-primary" @click="store.changePassword()">{{
              store.authDisabled.value ? t('misc.welcome.enablePasswordAuthentication') : t('misc.welcome.changePassword')
            }}</button>
          </div>
          <div v-if="!store.authDisabled.value" class="password-danger-zone">
            <div>
              <h3 class="danger-zone-title">{{ t('misc.welcome.disableAuthentication') }}</h3>
              <p class="danger-zone-copy">{{ t('misc.welcome.disableAuthenticationCopy') }}</p>
            </div>
            <button id="disable-auth-btn" class="btn btn-danger" type="button" @click="onDisableAuth()">{{ t('misc.welcome.disableAuthentication') }}</button>
          </div>
        </div>
      </section>
    </div>
  </div>

  <!-- File browser modal (:907-920) -->
  <div id="file-browser-modal" class="browser-modal" :hidden="!store.fileBrowser.value.open">
    <div class="panel browser-dialog" role="dialog" aria-modal="true" aria-labelledby="file-browser-title">
      <div class="browser-head">
        <h2 id="file-browser-title" class="panel-title">{{ browserTitle }}</h2>
        <button id="file-browser-close" class="btn btn-secondary" type="button" @click="store.closeFileBrowser()">{{ t('common.close') }}</button>
      </div>
      <div class="browser-toolbar">
        <button id="file-browser-up" class="btn btn-secondary" type="button" :disabled="!store.fileBrowser.value.parentPath || store.fileBrowser.value.parentPath === store.fileBrowser.value.currentPath" @click="store.loadFileBrowser(store.fileBrowser.value.parentPath)">{{ t('misc.welcome.up') }}</button>
        <button id="file-browser-select" class="btn btn-primary" type="button" :disabled="store.fileBrowser.value.mode === 'python' && !store.fileBrowser.value.selectedPath" @click="store.applyFileBrowserSelection()">{{
          store.fileBrowser.value.mode === 'directory' ? t('misc.welcome.selectThisFolder') : t('misc.welcome.selectSelectedFile')
        }}</button>
        <input id="file-browser-path" class="browser-path" type="text" readonly :value="store.fileBrowser.value.currentPath">
      </div>
      <div id="file-browser-list" class="browser-list">
        <div v-if="!store.fileBrowser.value.entries.length" class="browser-empty">{{ t('misc.welcome.noMatchingEntries') }}</div>
        <button
          v-for="entry in store.fileBrowser.value.entries"
          :key="entry.path"
          type="button"
          class="browser-entry"
          :class="{ selected: !entry.is_dir && entry.path === store.fileBrowser.value.selectedPath }"
          @click="entry.is_dir ? store.loadFileBrowser(entry.path) : (store.fileBrowser.value.selectedPath = entry.path)"
        >
          <span class="browser-entry-kind">{{ entry.is_dir ? 'DIR' : 'PY' }}</span>
          <span>{{ entry.name }}</span>
        </button>
      </div>
    </div>
  </div>
</template>