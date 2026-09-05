/*
 * The Welcome store — the reactive port of welcome.html :940-1587: bootstrap
 * load (:1435-1445), the summary/status/issues view models (:1248-1356,
 * :1283-1322), save-setup (:1447-1468), the password/disable-auth flows
 * (:1470-1524), the file browser (:1039-1157) and the banner (:1002-1011).
 */

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { serverMsg } from '@/shared/i18n';
import { apiOrigin } from '../config';
import { loginSecuritySummary, type LoginSecurity } from '../lib/loginSecurity';

/** fetchJson (:985-1000) — non-JSON bodies degrade to {detail: text}. */
async function fetchJson(url: string, options: RequestInit = {}): Promise<Record<string, unknown>> {
  const headers = new Headers(options.headers);
  const response = await fetch(url, { ...options, credentials: 'same-origin', headers });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { detail: text };
    }
  }
  if (!response.ok) {
    throw new Error(String(data.detail || `Request failed with status ${response.status}`));
  }
  return data;
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const STATUS_COVERED_ISSUES = new Set([
  'Passivbot V7 path is not configured.',
  'Passivbot V7 python interpreter is not configured.',
  'Passivbot V8 path is not configured.',
  'Passivbot V8 python interpreter is not configured.',
]);

export interface StatusRow {
  label: string;
  state: string;
  detail: string;
  tone: StatusTone;
}

export interface SummaryView {
  auth: string;
  authCopy: string;
  pb7: string;
  pb7Copy: string;
  pb8: string;
  pb8Copy: string;
  identity: string;
  roleText: string;
  authTone: StatusTone;
  pb7Tone: StatusTone;
  pb8Tone: StatusTone;
  identityTone: StatusTone;
  sbAuth: string;
  sbPb7: string;
  sbPb8: string;
}

export interface IssueRow {
  kind: 'warning' | 'error';
  text: string;
}

export interface BrowserEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export type BannerKind = 'info' | 'error' | 'success';

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export interface UseWelcome {
  banner: Ref<{ message: string; kind: BannerKind }>;
  activeSection: Ref<'overview' | 'setup' | 'password'>;
  bootstrap: Ref<Record<string, any> | null>;
  pb7dir: Ref<string>;
  pb7venv: Ref<string>;
  pb8dir: Ref<string>;
  pb8venv: Ref<string>;
  pbname: Ref<string>;
  role: Ref<string>;
  currentPassword: Ref<string>;
  newPassword: Ref<string>;
  fileBrowser: Ref<{
    open: boolean;
    target: string;
    mode: 'directory' | 'python';
    currentPath: string;
    parentPath: string;
    selectedPath: string;
    entries: BrowserEntry[];
  }>;
  summaryView: ComputedRef<SummaryView>;
  statusRows: ComputedRef<StatusRow[]>;
  issues: ComputedRef<IssueRow[]>;
  loginSecurityBanner: ComputedRef<{ summary: string; showAck: boolean }>;
  canSave: ComputedRef<boolean>;
  authDisabled: ComputedRef<boolean>;
  loadBootstrap(message?: string, kind?: BannerKind): Promise<void>;
  saveSetup(): Promise<void>;
  changePassword(): Promise<void>;
  disableAuthentication(confirmDialog: (options: Record<string, unknown>) => Promise<boolean>): Promise<void>;
  acknowledgeLoginSecurity(): Promise<void>;
  openFileBrowser(target: string, mode: 'directory' | 'python'): Promise<void>;
  loadFileBrowser(path: string): Promise<void>;
  applyFileBrowserSelection(): void;
  closeFileBrowser(): void;
  setBanner(message: string, kind: BannerKind): void;
  focusSection(name: 'overview' | 'setup' | 'password'): void;
}

export function useWelcome(options: { t: TranslateFn }): UseWelcome {
  const t = options.t;

  const banner = ref<{ message: string; kind: BannerKind }>({ message: '', kind: 'info' });
  const activeSection = ref<'overview' | 'setup' | 'password'>('overview');
  const bootstrap = ref<Record<string, any> | null>(null);
  const pb7dir = ref('');
  const pb7venv = ref('');
  const pb8dir = ref('');
  const pb8venv = ref('');
  const pbname = ref('');
  const role = ref('slave');
  const currentPassword = ref('');
  const newPassword = ref('');
  const fileBrowser = ref({
    open: false,
    target: '',
    mode: 'directory' as 'directory' | 'python',
    currentPath: '',
    parentPath: '',
    selectedPath: '',
    entries: [] as BrowserEntry[],
  });

  const auth = computed(() => (bootstrap.value?.auth || {}) as Record<string, any>);
  const setup = computed(() => (bootstrap.value?.setup || {}) as Record<string, any>);
  const pb8 = computed(() => (setup.value.pb8 || {}) as Record<string, any>);
  const loginSecurity = computed<LoginSecurity>(() => (auth.value.login_security || {}) as LoginSecurity);

  function setBanner(message: string, kind: BannerKind): void {
    banner.value = { message, kind };
  }

  function focusSection(name: 'overview' | 'setup' | 'password'): void {
    activeSection.value = name;
  }

  /* ── view models (:1283-1356) ── */

  const summaryView = computed<SummaryView>(() => {
    const pb8Optional = !pb8.value.required && !pb8.value.configured;
    return {
      auth: auth.value.authenticated ? t('misc.welcome.authenticated') : t('misc.welcome.guest'),
      authCopy: auth.value.authenticated
        ? t('misc.welcome.validTokenActive')
        : auth.value.password_required
          ? t('misc.welcome.useRootLoginPage')
          : t('misc.welcome.authenticatedAutomatically'),
      pb7: setup.value.ready
        ? t('misc.welcome.pb7Ready')
        : setup.value.import_ready
          ? t('misc.welcome.pb7SourceReady')
          : t('misc.welcome.pb7Blocked'),
      pb7Copy: setup.value.ready
        ? t('misc.welcome.sourceAndInterpreterValid')
        : setup.value.import_ready
          ? t('misc.welcome.sourceValidInterpreterNeedsAttention')
          : t('misc.welcome.apiStaysUpForPb7Fix'),
      pb8: pb8.value.ready
        ? t('misc.welcome.pb8Ready')
        : pb8Optional
          ? t('misc.welcome.pb8Optional')
          : pb8.value.source_ready
            ? t('misc.welcome.pb8Partial')
            : t('misc.welcome.pb8Blocked'),
      pb8Copy: pb8.value.ready
        ? t('misc.welcome.pb8ArtifactsValid')
        : pb8Optional
          ? t('misc.welcome.pb8NotConfiguredOnSlave')
          : pb8.value.source_ready
            ? t('misc.welcome.pb8ArtifactsNeedAttention')
            : t('misc.welcome.installPb8OrCorrectPaths'),
      identity: setup.value.pbname || t('misc.welcome.unnamedHost'),
      roleText: setup.value.master ? t('misc.welcome.masterRole') : t('misc.welcome.slaveRole'),
      authTone: auth.value.authenticated ? 'success' : 'warning',
      pb7Tone: setup.value.ready ? 'success' : setup.value.import_ready ? 'warning' : 'danger',
      pb8Tone: pb8.value.ready ? 'success' : pb8Optional ? 'neutral' : pb8.value.source_ready ? 'warning' : 'danger',
      identityTone: 'neutral',
      sbAuth: auth.value.authenticated ? t('misc.welcome.authenticated') : t('misc.welcome.guest'),
      sbPb7: setup.value.ready
        ? t('misc.welcome.pb7Ready')
        : setup.value.import_ready
          ? t('misc.welcome.importOnly')
          : t('misc.welcome.pb7Blocked'),
      sbPb8: pb8.value.ready
        ? t('misc.welcome.pb8Ready')
        : !pb8.value.required && !pb8.value.configured
          ? t('misc.welcome.pb8Optional')
          : pb8.value.source_ready
            ? t('misc.welcome.pb8Partial')
            : t('misc.welcome.pb8Blocked'),
    };
  });

  const statusRows = computed<StatusRow[]>(() => {
    const blockedAttempts = Number(loginSecurity.value.blocked_attempts || 0);
    const activeBlocks = Number(loginSecurity.value.active_blocks || 0);
    const pb8Optional = !pb8.value.required && !pb8.value.configured;
    return [
      {
        label: t('misc.welcome.loginSecurity'),
        state: activeBlocks
          ? t('misc.welcome.stateBlocked')
          : blockedAttempts
            ? loginSecurity.value.acknowledged
              ? t('misc.welcome.stateAcknowledged')
              : t('misc.welcome.stateObserved')
            : t('misc.welcome.stateClear'),
        detail: loginSecuritySummary(loginSecurity.value, t),
        tone: activeBlocks ? 'danger' : blockedAttempts ? 'warning' : 'success',
      },
      {
        label: t('misc.welcome.pb7Source'),
        state: setup.value.import_ready ? t('misc.welcome.stateReady') : t('misc.welcome.stateMissing'),
        detail: setup.value.src_dir || t('misc.welcome.noPb7PathConfigured'),
        tone: setup.value.import_ready ? 'success' : 'danger',
      },
      {
        label: t('misc.welcome.pb7Config'),
        state: setup.value.config_load_exists ? t('misc.welcome.stateAvailable') : t('misc.welcome.stateMissing'),
        detail: setup.value.config_load_file || t('misc.welcome.noConfigLoadPath'),
        tone: setup.value.config_load_exists ? 'success' : 'warning',
      },
      {
        label: t('misc.welcome.pb7Python'),
        state: setup.value.venv_ready ? t('misc.welcome.stateReady') : t('misc.welcome.stateMissing'),
        detail: setup.value.pb7venv || t('misc.welcome.noInterpreterConfigured'),
        tone: setup.value.venv_ready ? 'success' : 'warning',
      },
      {
        label: t('misc.welcome.pb8Source'),
        state: pb8Optional ? t('misc.welcome.stateOptional') : pb8.value.source_ready ? t('misc.welcome.stateReady') : t('misc.welcome.stateMissing'),
        detail: pb8.value.version
          ? `${pb8.value.src_dir || ''} (v${String(pb8.value.version).replace(/^v/, '')})`
          : pb8.value.src_dir || t('misc.welcome.noPb8PathConfigured'),
        tone: pb8Optional ? 'info' : pb8.value.source_ready ? 'success' : 'danger',
      },
      {
        label: t('misc.welcome.pb8Config'),
        state: pb8Optional ? t('misc.welcome.stateOptional') : pb8.value.config_ready ? t('misc.welcome.stateReady') : t('misc.welcome.stateMissing'),
        detail: pb8.value.config_schema
          ? `${pb8.value.config_schema_file || ''} (${pb8.value.config_schema})`
          : pb8.value.config_schema_file || t('misc.welcome.noPb8ConfigSchema'),
        tone: pb8Optional ? 'info' : pb8.value.config_ready ? 'success' : 'danger',
      },
      {
        label: t('misc.welcome.pb8Python'),
        state: pb8Optional ? t('misc.welcome.stateOptional') : pb8.value.python_ready ? t('misc.welcome.stateReady') : t('misc.welcome.stateMissing'),
        detail: pb8.value.pb8venv || t('misc.welcome.noPb8InterpreterConfigured'),
        tone: pb8Optional ? 'info' : pb8.value.python_ready ? 'success' : 'danger',
      },
      {
        label: t('misc.welcome.pb8CliRust'),
        state: pb8Optional
          ? t('misc.welcome.stateOptional')
          : pb8.value.cli_ready && pb8.value.rust_ready
            ? t('misc.welcome.stateReady')
            : t('misc.welcome.stateMissing'),
        detail: t('misc.welcome.cliRustDetail', {
          cli: pb8.value.cli_file || t('misc.welcome.missing'),
          rust: pb8.value.rust_file || t('misc.welcome.missing'),
        }),
        tone: pb8Optional ? 'info' : pb8.value.cli_ready && pb8.value.rust_ready ? 'success' : 'danger',
      },
      {
        label: t('misc.welcome.identity'),
        state: setup.value.master ? t('misc.welcome.stateMaster') : t('misc.welcome.stateSlave'),
        detail: setup.value.pbname || t('misc.welcome.unnamedHost'),
        tone: 'neutral',
      },
    ];
  });

  const issues = computed<IssueRow[]>(() => {
    const rows: IssueRow[] = [];
    const addIssue = (kind: IssueRow['kind'], message: string): void => {
      if (!STATUS_COVERED_ISSUES.has(message)) rows.push({ kind, text: serverMsg(message) });
    };
    const securityWarnings = (auth.value.security_warnings || []) as string[];
    securityWarnings.forEach((message) => addIssue('error', message));
    (setup.value.errors || []).forEach((message: string) => addIssue('error', message));
    (setup.value.warnings || []).forEach((message: string) => addIssue('warning', message));
    if (setup.value.master || pb8.value.configured) {
      (pb8.value.errors || []).forEach((message: string) => addIssue('error', message));
      (pb8.value.warnings || []).forEach((message: string) => addIssue('warning', message));
    }
    return rows;
  });

  const loginSecurityBanner = computed(() => ({
    summary: loginSecuritySummary(loginSecurity.value, t),
    showAck: Number(loginSecurity.value.blocked_attempts || 0) > 0 && !loginSecurity.value.acknowledged,
  }));

  const canSave = computed(() => Boolean(auth.value.authenticated));
  const authDisabled = computed(() => auth.value.auth_mode === 'disabled');

  /* ── actions ── */

  function applyBootstrap(data: Record<string, any>): void {
    bootstrap.value = data;
    const setupData = data.setup || {};
    const pb8Data = setupData.pb8 || {};
    pb7dir.value = setupData.pb7dir || '';
    pb7venv.value = setupData.pb7venv || '';
    pb8dir.value = pb8Data.pb8dir || '';
    pb8venv.value = pb8Data.pb8venv || '';
    pbname.value = setupData.pbname || '';
    role.value = setupData.role === 'master' ? 'master' : 'slave';
  }

  async function loadBootstrap(message = '', kind: BannerKind = 'info'): Promise<void> {
    try {
      let data = await fetchJson(`${apiOrigin()}/api/auth/bootstrap`);
      const authState = (data.auth || {}) as Record<string, unknown>;
      if (
        window.self === window.top &&
        authState.password_required === false &&
        authState.authenticated === false &&
        !authState.error
      ) {
        data = await fetchJson(`${apiOrigin()}/api/auth/passwordless-session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
      }
      applyBootstrap(data);
      setBanner(message, kind);
    } catch (error) {
      setBanner(serverMsg(error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  async function saveSetup(): Promise<void> {
    try {
      const data = await fetchJson(
        `${apiOrigin()}/api/auth/setup`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pb7dir: pb7dir.value,
            pb7venv: pb7venv.value,
            pb8dir: pb8dir.value,
            pb8venv: pb8venv.value,
            pbname: pbname.value,
            role: role.value,
          }),
        },
      );
      applyBootstrap(data);
      setBanner(serverMsg(String(data.message || '')) || t('misc.welcome.setupSaved'), 'success');
      focusSection('setup');
    } catch (error) {
      setBanner(serverMsg(error instanceof Error ? error.message : String(error)), 'error');
      focusSection('setup');
    }
  }

  async function submitAuthenticationChange(disableAuth: boolean): Promise<void> {
    try {
      const data = await fetchJson(
        `${apiOrigin()}/api/auth/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            current_password: currentPassword.value,
            new_password: disableAuth ? '' : newPassword.value,
            disable_auth: disableAuth,
          }),
        },
      );
      currentPassword.value = '';
      newPassword.value = '';
      setBanner(serverMsg(String(data.message || '')) || t('misc.welcome.passwordUpdated'), 'success');
      setTimeout(() => window.location.reload(), 250); // :1486
    } catch (error) {
      setBanner(serverMsg(error instanceof Error ? error.message : String(error)), 'error');
      focusSection('password');
    }
  }

  async function changePassword(): Promise<void> {
    if (!newPassword.value) {
      setBanner(t('misc.welcome.enterNewPassword'), 'error');
      focusSection('password');
      return;
    }
    await submitAuthenticationChange(false);
  }

  async function disableAuthentication(
    confirmDialog: (options: Record<string, unknown>) => Promise<boolean>
  ): Promise<void> {
    const confirmed = await confirmDialog({
      title: t('misc.welcome.disableAuthTitle'),
      message: t('misc.welcome.disableAuthMessage'),
      detail: t('misc.welcome.disableAuthDetail'),
      confirmText: t('misc.welcome.disableAuthConfirm'),
      cancelText: t('misc.welcome.keepAuthentication'),
    }); // PBGuiDialogs.confirm (:1503-1509)
    if (!confirmed) return;
    await submitAuthenticationChange(true);
  }

  async function acknowledgeLoginSecurity(): Promise<void> {
    try {
      const data = await fetchJson(`${apiOrigin()}/api/auth/login-security/ack`, { method: 'POST' });
      if (bootstrap.value) {
        bootstrap.value = {
          ...bootstrap.value,
          auth: { ...auth.value, login_security: (data as Record<string, any>).login_security || {} },
        };
      }
      setBanner(t('misc.welcome.loginSecurityAcknowledged'), 'success');
    } catch (error) {
      setBanner(serverMsg(error instanceof Error ? error.message : String(error)), 'error');
    }
  }

  /* ── file browser (:1039-1157) ── */

  async function openFileBrowser(target: string, mode: 'directory' | 'python'): Promise<void> {
    if (!auth.value.authenticated) {
      setBanner(t('misc.welcome.logInBeforeBrowsing'), 'error');
      focusSection('overview');
      return;
    }
    fileBrowser.value = {
      open: true,
      target,
      mode,
      currentPath: '',
      parentPath: '',
      selectedPath: '',
      entries: [],
    };
    const initial =
      target === 'pb7dir' ? pb7dir.value : target === 'pb7venv' ? pb7venv.value : target === 'pb8dir' ? pb8dir.value : pb8venv.value;
    await loadFileBrowser(initial);
  }

  async function loadFileBrowser(path: string): Promise<void> {
    try {
      const data = (await fetchJson(
        `${apiOrigin()}/api/auth/browse?path=${encodeURIComponent(path || '')}&mode=${encodeURIComponent(fileBrowser.value.mode)}`,
        {},
      )) as Record<string, any>;
      fileBrowser.value = {
        ...fileBrowser.value,
        currentPath: data.current_path || '',
        parentPath: data.parent_path || data.current_path || '',
        entries: data.entries || [],
        selectedPath: fileBrowser.value.mode === 'python' ? data.selected_path || '' : data.current_path || '',
      };
    } catch (error) {
      setBanner(error instanceof Error ? error.message : String(error), 'error');
    }
  }

  function applyFileBrowserSelection(): void {
    const { target, mode, currentPath, selectedPath } = fileBrowser.value;
    if (!target) return;
    const value = mode === 'directory' ? currentPath : selectedPath;
    if (!value) return;
    if (target === 'pb7dir') pb7dir.value = value;
    else if (target === 'pb7venv') pb7venv.value = value;
    else if (target === 'pb8dir') pb8dir.value = value;
    else if (target === 'pb8venv') pb8venv.value = value;
    closeFileBrowser();
  }

  function closeFileBrowser(): void {
    fileBrowser.value = { ...fileBrowser.value, open: false };
  }

  return {
    banner,
    activeSection,
    bootstrap,
    pb7dir,
    pb7venv,
    pb8dir,
    pb8venv,
    pbname,
    role,
    currentPassword,
    newPassword,
    fileBrowser,
    summaryView,
    statusRows,
    issues,
    loginSecurityBanner,
    canSave,
    authDisabled,
    loadBootstrap,
    saveSetup,
    changePassword,
    disableAuthentication,
    acknowledgeLoginSecurity,
    openFileBrowser,
    loadFileBrowser,
    applyFileBrowserSelection,
    closeFileBrowser,
    setBanner,
    focusSection,
  };
}
