/*
 * Vue-side bridge for the shared PBGui AI page-context contract.
 *
 * Legacy pages get window.PBGuiAI (registerPageContext / collectContext /
 * focusedField) from frontend/pbgui_nav.js; Vue pages load neither that
 * script nor the topnav, so this module installs the same facade for the
 * Vue bundle. js/ai_drawer.js only reads window.PBGuiAI.collectContext(),
 * so keeping the shapes identical is what lets the drawer serve both
 * frontend generations.
 *
 * Sanitisation (bounded text, entity projection, the credential/secret/
 * session/log denylist) mirrors pbgui_nav.js verbatim — relax nothing here
 * without relaxing it there: the values cross into model context.
 */
import { onBeforeUnmount, onMounted } from 'vue';

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

type Unregister = () => void;

interface PbGuiAiFacade {
  registerPageContext?: (registration: AiPageContextRegistration) => Unregister;
  collectContext?: () => AiCollectedContext;
  focusedField?: (
    allowlist: Record<string, { path: string; label?: string; validation?: string }>,
  ) => AiFocusedField | null;
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
  focused_field?: AiFocusedField | null;
}

/** Page-level metadata the drawer merges into every collected context. */
const pageMeta: { pageKey: string; title: string; guideTopic?: string } = {
  pageKey: '',
  title: '',
};

const providers = new Map<string, () => AiPageContext | null | undefined>();

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
    facade.collectContext = (): AiCollectedContext => {
      const context: AiCollectedContext = {
        schema_version: 1,
        page_key: pageMeta.pageKey,
        title: pageMeta.title,
        guide_topic: pageMeta.guideTopic || '',
        entities: [],
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
      return context;
    };
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
