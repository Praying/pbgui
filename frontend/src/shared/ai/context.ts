/*
 * Vue-side bridge for the shared PBGui AI page-context contract.
 *
 * Legacy pages get window.PBGuiAI (registerPageContext / collectContext /
 * focusedField, plus the page-action and UI-control bridge) from
 * frontend/pbgui_nav.js; Vue pages load neither that script nor the topnav,
 * so this module installs the same facade for the Vue bundle.
 * js/ai_drawer.js only reads window.PBGuiAI.collectContext(),
 * registerPageAction, continuePageAction and tryLocalCommand, so keeping
 * the shapes identical is what lets the drawer serve both frontend
 * generations.
 *
 * Sanitisation (bounded text, entity projection, the credential/secret/
 * session/log denylist, the control visibility/sensitivity gates and the
 * 40 KiB context budget) mirrors pbgui_nav.js verbatim — relax nothing
 * here without relaxing it there: the values cross into model context.
 */
import { onBeforeUnmount, onMounted } from 'vue';

import { getBoot } from '@/shared/boot';
import { WORKBENCH_NAVIGATION } from '@/shared/navigation';

export interface AiContextEntity {
  kind: string;
  version?: string;
  name: string;
}

export interface AiFocusedField {
  path: string;
  label?: string;
  value?: string;
  validation?: string;
}

export interface AiPageContext {
  section?: string;
  entities?: AiContextEntity[];
  focused_field?: AiFocusedField | null;
}

export interface AiPageContextRegistration {
  id: string;
  getContext: () => AiPageContext | null | undefined;
}

/** A runnable AI page action (legacy window.PBGuiAI.registerPageAction). */
export interface AiPageActionRegistration {
  id: string;
  entity_kind: string;
  run: (name: string, entity: AiContextEntity, payload: AiActionPayload) => unknown;
}

export interface AiActionPayload {
  action?: string;
  entity?: AiContextEntity;
  value?: unknown;
  [key: string]: unknown;
}

/** One interactive control exposed to the model (legacy descriptor shape). */
export interface AiControlDescriptor {
  id: string;
  role: string;
  label: string;
  operations: string[];
  context?: string;
  options?: { value: string; label: string }[];
}

type Unregister = () => void;

interface PbGuiAiFacade {
  registerPageContext?: (registration: AiPageContextRegistration) => Unregister;
  collectContext?: () => AiCollectedContext;
  focusedField?: (
    allowlist: Record<string, { path: string; label?: string; validation?: string }>,
  ) => AiFocusedField | null;
  registerPageAction?: (registration: AiPageActionRegistration) => Unregister;
  continuePageAction?: (url: string) => boolean;
  tryLocalCommand?: (message: string) => { handled: boolean; message?: string };
  open?: () => void;
  close?: () => void;
  toggle?: () => void;
}

export interface AiCollectedContext {
  schema_version: number;
  page_key: string;
  title: string;
  guide_topic?: string;
  section?: string;
  entities: AiContextEntity[];
  actions?: { id: string; entity_kind: string }[];
  controls?: AiControlDescriptor[];
  focused_field?: AiFocusedField | null;
}

/** Page-level metadata the drawer merges into every collected context. */
const pageMeta: { pageKey: string; title: string; guideTopic?: string } = {
  pageKey: '',
  title: '',
};

const providers = new Map<string, () => AiPageContext | null | undefined>();

/* ── Page actions (legacy _aiPageActions, pbgui_nav.js) ────────────────── */
const pageActions = new Map<string, AiPageActionRegistration>();
/** Last continuePageAction target: the drawer re-sends actions, the browser must not loop. */
let actionNavigationTarget = '';

/* ── UI-control bridge (legacy _aiControl*, pbgui_nav.js) ──────────────── */
const controlIds = new WeakMap<Element, string>();
let controlElements: Record<string, { element: Element; descriptor: AiControlDescriptor }> = {};
let controlSequence = 0;
/** Module-level singletons: AppShell mounts once per page load, but keep it idempotent anyway. */
let uiActionListenerInstalled = false;
let builtInActionsRegistered = false;

/** Cross-page routes for page-action continuation (legacy FASTAPI_PAGES). */
const PAGE_ROUTES: Record<string, string> = {};
for (const group of WORKBENCH_NAVIGATION) {
  for (const item of group.items) PAGE_ROUTES[item.pageKey] = item.href;
}

function aiOrigin(): string {
  return getBoot().origin || window.location.origin;
}

function aiPageAction(value: unknown): AiPageActionRegistration | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiPageActionRegistration>;
  if (typeof raw.run !== 'function') return null;
  const id = aiContextText(raw.id, 64);
  const entityKind = aiContextText(raw.entity_kind, 128);
  if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(id) || !/^[A-Za-z0-9_.-]{1,128}$/.test(entityKind)) return null;
  return { id, entity_kind: entityKind, run: raw.run };
}

function registerPageAction(registration: AiPageActionRegistration): Unregister {
  const action = aiPageAction(registration);
  if (!action) return () => {};
  const key = `${action.id}:${action.entity_kind}`;
  pageActions.set(key, action);
  return () => {
    pageActions.delete(key);
  };
}

/** Navigate to a legacy/Vue page carrying the AI continuation flag (pbgui_nav.js contract). */
export function continuePageAction(url: string): boolean {
  try {
    const target = new URL(String(url || ''), window.location.href);
    if (target.origin !== window.location.origin && target.origin !== aiOrigin()) return false;
    target.searchParams.set('pbgui_ai_action', '1');
    if (actionNavigationTarget === target.href) return false;
    actionNavigationTarget = target.href;
    window.location.assign(target.href);
  } catch {
    // Malformed URL — ignore, the AI falls back to telling the user.
  }
  return false;
}

function aiControlVisible(element: Element): boolean {
  const control = element as HTMLElement & { disabled?: boolean };
  if (!element.isConnected || control.disabled || control.hidden) return false;
  if (element.closest('#pbgui-ai-drawer,[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(control);
  if (!style || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
    return false;
  }
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom >= 0 &&
    rect.right >= 0 &&
    rect.top <= window.innerHeight &&
    rect.left <= window.innerWidth
  );
}

function aiControlSensitive(element: Element, label: string): boolean {
  const control = element as HTMLInputElement;
  const type = String(control.type || '').toLowerCase();
  if (type === 'password' || type === 'file') return true;
  const identity = [control.id, control.name, control.autocomplete, label].join(' ');
  return /password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|session|cookie/i.test(identity);
}

function aiControlLabel(element: Element): string {
  const control = element as HTMLInputElement & { placeholder?: string };
  let label = element.getAttribute('aria-label') || element.getAttribute('title') || '';
  if (!label && control.labels && control.labels.length) label = control.labels[0]?.textContent || '';
  if (!label && element.tagName === 'INPUT') {
    const buttonType = ['button', 'submit', 'reset'].indexOf(String(control.type || '').toLowerCase()) >= 0;
    label = (buttonType ? control.value : control.placeholder) || control.name || control.id || '';
  }
  if (!label && (element.tagName === 'TEXTAREA' || element.tagName === 'SELECT' || (element as HTMLElement).isContentEditable)) {
    label = control.placeholder || control.name || control.id || element.tagName;
  }
  if (!label) label = element.textContent || control.name || control.id || element.tagName;
  return aiContextText(label, 160).replace(/\s+/g, ' ');
}

function aiControlContext(element: Element): string {
  const shell = element.closest('[role="dialog"],[aria-modal="true"],.modal.open,.visible');
  if (!shell || shell.id === 'pbgui-ai-drawer') return '';
  const heading = shell.querySelector('h1,h2,h3,[id$="-title"],.modal-title,.floating-preview-title');
  return aiContextText(heading ? heading.textContent : shell.id, 160).replace(/\s+/g, ' ');
}

function aiControlId(element: Element): string {
  let id = controlIds.get(element);
  if (!id) {
    controlSequence += 1;
    id = `control_${controlSequence}`;
    controlIds.set(element, id);
  }
  return id;
}

function aiControlDescriptor(element: Element): AiControlDescriptor | null {
  const control = element as HTMLInputElement & HTMLAnchorElement & { isContentEditable: boolean };
  const tag = String(element.tagName || '').toLowerCase();
  const type = String(control.type || '').toLowerCase();
  const role = String(element.getAttribute('role') || '').toLowerCase();
  const operations: string[] = [];
  if (
    tag === 'button' ||
    tag === 'a' ||
    role === 'button' ||
    ['button', 'submit', 'reset', 'checkbox', 'radio'].indexOf(type) >= 0
  ) {
    operations.push('activate');
  }
  if (tag === 'select' || tag === 'textarea' || control.isContentEditable || (tag === 'input' && operations.indexOf('activate') < 0)) {
    operations.push('set_value');
  }
  if (!operations.length) return null;
  if (tag === 'a') {
    try {
      if (new URL(control.href || '', window.location.href).origin !== window.location.origin) return null;
    } catch {
      return null;
    }
  }
  const label = aiControlLabel(element);
  if (!label || aiControlSensitive(element, label)) return null;
  const descriptor: AiControlDescriptor = {
    id: aiControlId(element),
    role: tag === 'input' ? type || 'input' : role || tag,
    label,
    operations,
  };
  const controlContext = aiControlContext(element);
  if (controlContext) descriptor.context = controlContext;
  if (tag === 'select') {
    descriptor.options = Array.from((element as HTMLSelectElement).options)
      .slice(0, 32)
      .map((option) => ({
        value: aiContextText(option.value, 160),
        label: aiContextText(option.textContent, 160),
      }))
      .filter((option) => !!option.label);
  }
  return descriptor;
}

function collectAIControls(): AiControlDescriptor[] {
  controlElements = {};
  const candidates: { element: Element; descriptor: AiControlDescriptor; index: number; priority: number }[] = [];
  const selector = 'button,a[href],input,select,textarea,[role="button"],[contenteditable="true"]';
  Array.from(document.querySelectorAll(selector)).forEach((element, index) => {
    if (!aiControlVisible(element)) return;
    const descriptor = aiControlDescriptor(element);
    if (!descriptor) return;
    candidates.push({ element, descriptor, index, priority: descriptor.context ? 0 : 1 });
  });
  candidates.sort((left, right) => left.priority - right.priority || left.index - right.index);
  return candidates.slice(0, 96).map((candidate) => {
    controlElements[candidate.descriptor.id] = { element: candidate.element, descriptor: candidate.descriptor };
    return candidate.descriptor;
  });
}

function resolveAIControl(controlId: string, operation: string): Element {
  collectAIControls();
  const entry = controlElements[String(controlId || '')];
  if (!entry || entry.descriptor.operations.indexOf(operation) < 0) {
    throw new Error('PBGui control is no longer available');
  }
  return entry.element;
}

function executeLocalPageAction(actionId: string, entity: AiContextEntity): boolean {
  const registration = pageActions.get(`${actionId}:${entity.kind}`);
  if (!registration) return false;
  return registration.run(entity.name, entity, { action: actionId, entity }) !== false;
}

/** Full page-context snapshot shared by the drawer facade and tryLocalCommand. */
function collectContextInternal(): AiCollectedContext {
  const context: AiCollectedContext = {
    schema_version: 1,
    page_key: pageMeta.pageKey,
    title: pageMeta.title,
    guide_topic: pageMeta.guideTopic || '',
    entities: [],
    actions: Array.from(pageActions.values())
      .sort((left, right) => (left.id + ':' + left.entity_kind < right.id + ':' + right.entity_kind ? -1 : 1))
      .slice(0, 16)
      .map((action) => ({ id: action.id, entity_kind: action.entity_kind })),
    controls: collectAIControls(),
  };
  for (const getContext of Array.from(providers.keys())
    .sort()
    .map((id) => providers.get(id)!)) {
    try {
      const value = getContext();
      if (!value || typeof value !== 'object') continue;
      if (value.section && !context.section) context.section = aiContextText(value.section, 128);
      if (Array.isArray(value.entities)) {
        for (const entity of value.entities.slice(0, 8)) {
          const projected = aiContextEntity(entity);
          if (projected) context.entities.push(projected);
        }
      }
      if (value.focused_field && !context.focused_field) {
        context.focused_field = aiContextFocusedField(value.focused_field);
      }
    } catch {
      // A broken provider must never break context collection.
    }
  }
  context.entities = context.entities.slice(0, 8);
  // Keep the whole context under 40 KiB — controls are the only unbounded part.
  while (context.controls!.length && JSON.stringify(context).length > 40 * 1024) context.controls!.pop();
  return context;
}

/** Local intent shortcuts (open log / close panel / click X) without a model turn. */
function tryLocalCommand(message: string): { handled: boolean; message?: string } {
  const text = String(message || '').trim().toLowerCase();
  if (!text) return { handled: false };
  const context = collectContextInternal();
  const logIntent = /\blog(?:fenster| window| panel)?\b/.test(text);
  const showIntent = /anzeigen|zeigen|oeffnen|öffnen|aufmachen|\bopen\b|\bshow\b/.test(text);
  if (logIntent && showIntent) {
    const logKinds = (context.actions || [])
      .filter((action) => action.id === 'show_log')
      .map((action) => action.entity_kind);
    const logEntities = context.entities.filter((entity) => logKinds.indexOf(entity.kind) >= 0);
    if (logEntities.length === 1 && logEntities[0] && executeLocalPageAction('show_log', logEntities[0])) {
      return { handled: true, message: 'PBGui opened the requested log.' };
    }
  }
  const closeIntent = /schlie(?:ss|ß)en|schliess|schließ|zumachen|\bclose\b|\bhide\b/.test(text);
  if (closeIntent) {
    let closeControls = (context.controls || []).filter((control) => {
      if (control.operations.indexOf('activate') < 0) return false;
      const label = control.label.toLowerCase();
      return /close|schlie|×|✕|^x$/.test(label);
    });
    if (logIntent) {
      const logCloseControls = closeControls.filter((control) => {
        return /log/.test((control.context || '').toLowerCase() + ' ' + control.label.toLowerCase());
      });
      if (logCloseControls.length) closeControls = logCloseControls;
    }
    if (
      closeControls.length === 1 &&
      closeControls[0] &&
      executeLocalPageAction('activate', { kind: 'ui_control', name: closeControls[0].id })
    ) {
      return { handled: true, message: 'PBGui closed the requested window.' };
    }
  }
  const clickMatch = text.match(/^(?:bitte\s+)?(?:klick(?:e)?|click|drueck(?:e)?|drück(?:e)?|press)\s+(?:auf\s+)?(.+?)\s*[.!]?$/);
  if (clickMatch && clickMatch[1] !== undefined) {
    const requested = clickMatch[1].trim();
    if (/delete|remove|loesch|lösch|start|stop|restart|save|speicher|apply|approve|reject|confirm|bestaetig|bestätig|submit|queue|deploy|update|install|execute|panic|kill|clear finished|\brun\b/.test(requested)) {
      return { handled: false };
    }
    const controls = (context.controls || []).filter((control) => {
      return control.operations.indexOf('activate') >= 0 && control.label.toLowerCase() === requested;
    });
    if (controls.length === 1 && controls[0] && executeLocalPageAction('activate', { kind: 'ui_control', name: controls[0].id })) {
      return { handled: true, message: `PBGui activated ${controls[0].label}.` };
    }
  }
  return { handled: false };
}

/** The drawer dispatches model-approved UI actions as pbgui:ai-ui-action events. */
function onAiUiAction(event: Event): void {
  const request = (event as CustomEvent).detail && typeof (event as CustomEvent).detail === 'object'
    ? (event as CustomEvent).detail as { type?: string; target?: { page_key?: string }; payload?: AiActionPayload }
    : {};
  if (request.type !== 'page.perform_action') return;
  const target = request.target && typeof request.target === 'object' ? request.target : {};
  const payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
  const entity = payload.entity && typeof payload.entity === 'object' ? (payload.entity as AiContextEntity) : {} as AiContextEntity;
  if (String(target.page_key || '') !== String(pageMeta.pageKey || '')) {
    const route = PAGE_ROUTES[String(target.page_key || '')];
    if (route) continuePageAction(`${aiOrigin()}${route}`);
    return;
  }
  const key = `${String(payload.action || '')}:${String(entity.kind || '')}`;
  const registration = pageActions.get(key);
  if (!registration) return;
  const context = collectContextInternal();
  const exposed =
    entity.kind === 'ui_control'
      ? (context.controls || []).some(
          (control) => control.id === entity.name && control.operations.indexOf(String(payload.action)) >= 0,
        )
      : context.entities.some((item) => item.kind === entity.kind && item.name === entity.name);
  if (!exposed) return;
  try {
    const result = registration.run(entity.name, entity, payload);
    if (result === false) return;
    event.preventDefault();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch((error: unknown) => {
        console.error('PBGui page action failed:', error);
      });
    }
  } catch (error) {
    event.preventDefault();
    console.error('PBGui page action failed:', error);
  }
}

const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

function aiContextText(value: unknown, limit: number): string {
  return String(value == null ? '' : value)
    .trim()
    .replace(CONTROL_CHARS, ' ')
    .slice(0, limit);
}

function aiContextSensitiveName(value: unknown): boolean {
  return /(^|[._\s-])(password|passwd|secret|token|api[_ -]?key|private[_ -]?key|credential|session|cookie|log|ssh)([._\s-]|$)/i.test(
    String(value || ''),
  );
}

function aiContextEntity(value: unknown): AiContextEntity | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiContextEntity>;
  const entity: AiContextEntity = {
    kind: aiContextText(raw.kind, 128),
    version: aiContextText(raw.version, 128),
    name: aiContextText(raw.name, 128),
  };
  if (!entity.kind || !entity.name || aiContextSensitiveName(entity.kind)) return null;
  return entity;
}

function aiContextFocusedField(value: unknown): AiFocusedField | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AiFocusedField>;
  const path = aiContextText(raw.path, 256);
  const label = aiContextText(raw.label, 256);
  if (!path || aiContextSensitiveName(path) || aiContextSensitiveName(label)) return null;
  const field: AiFocusedField = { path };
  if (label) field.label = label;
  const fieldValue = aiContextText(raw.value, 256);
  const validation = aiContextText(raw.validation, 256);
  if (fieldValue) field.value = fieldValue;
  if (validation) field.validation = validation;
  return field;
}

/**
 * Install (or extend) the window.PBGuiAI facade and record which page owns
 * it. AppShell calls this on mount so every Vue page shares one bridge.
 */
export function initAiPageMeta(pageKey: string, title: string, guideTopic?: string): void {
  pageMeta.pageKey = pageKey.slice(0, 128);
  pageMeta.title = title.slice(0, 128);
  if (guideTopic !== undefined) pageMeta.guideTopic = guideTopic.slice(0, 128);

  const w = window as Window & { PBGuiAI?: PbGuiAiFacade };
  const facade = (w.PBGuiAI = w.PBGuiAI || {});
  if (typeof facade.registerPageContext !== 'function') {
    facade.registerPageContext = (registration: AiPageContextRegistration): Unregister => {
      if (!registration || typeof registration.id !== 'string' || typeof registration.getContext !== 'function') {
        return () => {};
      }
      const id = registration.id.slice(0, 64);
      providers.set(id, registration.getContext);
      return () => {
        providers.delete(id);
      };
    };
  }
  if (typeof facade.collectContext !== 'function') {
    facade.collectContext = collectContextInternal;
  }
  if (typeof facade.registerPageAction !== 'function') {
    facade.registerPageAction = registerPageAction;
  }
  if (typeof facade.continuePageAction !== 'function') {
    facade.continuePageAction = continuePageAction;
  }
  if (typeof facade.tryLocalCommand !== 'function') {
    facade.tryLocalCommand = tryLocalCommand;
  }
  if (!uiActionListenerInstalled) {
    uiActionListenerInstalled = true;
    window.addEventListener('pbgui:ai-ui-action', onAiUiAction as EventListener);
  }
  if (!builtInActionsRegistered) {
    builtInActionsRegistered = true;
    registerPageAction({
      id: 'activate',
      entity_kind: 'ui_control',
      run: (controlId) => {
        (resolveAIControl(controlId, 'activate') as HTMLElement).click();
      },
    });
    registerPageAction({
      id: 'set_value',
      entity_kind: 'ui_control',
      run: (controlId, _entity, payload) => {
        const element = resolveAIControl(controlId, 'set_value');
        const value = String(payload?.value == null ? '' : payload.value);
        if (element.tagName === 'SELECT' && !Array.from((element as HTMLSelectElement).options).some((option) => option.value === value)) {
          throw new Error('PBGui select option is no longer available');
        }
        if ((element as HTMLElement).isContentEditable) element.textContent = value;
        else (element as HTMLInputElement).value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
  }
  if (typeof facade.focusedField !== 'function') {
    facade.focusedField = (
      allowlist: Record<string, { path: string; label?: string; validation?: string }>,
    ): AiFocusedField | null => {
      const active = document.activeElement as HTMLInputElement | null;
      const descriptor = active && allowlist && allowlist[active.id];
      if (!descriptor || active.type === 'password') return null;
      return aiContextFocusedField({
        path: descriptor.path,
        label: descriptor.label,
        value: active.value,
        validation: descriptor.validation,
      });
    };
  }
  if (typeof window.PBGUI_AI_PAGE_CONTEXT === 'function') {
    facade.registerPageContext({ id: 'productive-page', getContext: window.PBGUI_AI_PAGE_CONTEXT });
  }
  if (Array.isArray(window.PBGUI_AI_PAGE_ACTIONS)) {
    window.PBGUI_AI_PAGE_ACTIONS.forEach((entry) => registerPageAction(entry as AiPageActionRegistration));
  }
}

/**
 * Register a page action for the lifetime of the calling component — the
 * Vue counterpart of assigning window.PBGUI_AI_PAGE_ACTIONS on a legacy
 * page (e.g. the show_log actions the v7 pages expose). Unregistration on
 * unmount keeps stale closures (dead adapters, unmounted panels) from
 * remaining callable from the drawer.
 */
export function useAiPageAction(registration: AiPageActionRegistration): void {
  let unregister: Unregister | undefined;
  onMounted(() => {
    const facade = (window as Window & { PBGuiAI?: PbGuiAiFacade }).PBGuiAI;
    if (facade && typeof facade.registerPageAction === 'function') {
      unregister = facade.registerPageAction(registration);
    }
  });
  onBeforeUnmount(() => {
    unregister?.();
  });
}

/**
 * Register a page context for the lifetime of the calling component.
 * Mirrors window.PBGuiAI.registerPageContext for pages that mount/unmount
 * their context with the component tree (legacy pages register once and
 * never unregister; the unregistration is what keeps stale closures from
 * reporting dead DOM state after a section unmounts).
 */
export function useAiPageContext(registration: AiPageContextRegistration): void {
  let unregister: Unregister | undefined;
  onMounted(() => {
    const facade = (window as Window & { PBGuiAI?: PbGuiAiFacade }).PBGuiAI;
    if (facade && typeof facade.registerPageContext === 'function') {
      unregister = facade.registerPageContext(registration);
    }
  });
  onBeforeUnmount(() => {
    unregister?.();
  });
}

/**
 * Typed wrapper for the focused-input allowlist check. Pages call this in
 * their getContext() instead of window.PBGuiAI.focusedField directly so
 * the collected shape stays AiFocusedField | null.
 */
export function aiFocusedField(
  allowlist: Record<string, { path: string; label?: string; validation?: string }>,
): AiFocusedField | null {
  const facade = (window as Window & { PBGuiAI?: PbGuiAiFacade }).PBGuiAI;
  if (!facade || typeof facade.focusedField !== 'function') return null;
  return (facade.focusedField(allowlist) as AiFocusedField | null) ?? null;
}
