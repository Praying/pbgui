import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { createI18n } from '@/shared/i18n';
import { initAiPageMeta, useAiPageAction, type AiCollectedContext } from './context';

/*
 * The bridge keeps singleton state (page actions, the ui-action listener,
 * built-in registrations), so the whole file shares ONE module instance:
 * fresh imports via vi.resetModules would stack extra pbgui:ai-ui-action
 * listeners whose closures point at dead module state. Tests instead own
 * their registrations (Map.set overwrites, unregister cleans up) while
 * beforeEach drops window.PBGuiAI so initAiPageMeta reinstalls the facade.
 */
vi.mock('@/shared/boot', () => ({
  getBoot: () => ({ token: 'tok', origin: 'http://pbgui.test:8000', version: '1.0.0', serial: 'S1' }),
}));

/** env.d.ts keeps the facade loosely typed; collectContext is typed for assertions. */
function collectedContext(facade: NonNullable<typeof window.PBGuiAI>): AiCollectedContext {
  return facade.collectContext!() as AiCollectedContext;
}

/** Install the facade exactly like AppShell does on mount. */
function initHost(): void {
  initAiPageMeta('dashboards', 'Dashboards');
}

beforeEach(() => {
  delete (window as { PBGuiAI?: unknown }).PBGuiAI;
  delete (window as { PBGUI_AI_PAGE_ACTIONS?: unknown }).PBGUI_AI_PAGE_ACTIONS;
});

afterEach(() => {
  delete (window as { PBGuiAI?: unknown }).PBGuiAI;
  delete (window as { PBGUI_AI_PAGE_ACTIONS?: unknown }).PBGUI_AI_PAGE_ACTIONS;
  document.body.innerHTML = '';
});

describe('PBGuiAI page-action bridge (v1.99.2–4 port)', () => {
  it('exposes registerPageAction / continuePageAction / tryLocalCommand and lists actions in collectContext', () => {
    initHost();
    const facade = window.PBGuiAI!;

    expect(typeof facade.registerPageAction).toBe('function');
    expect(typeof facade.continuePageAction).toBe('function');
    expect(typeof facade.tryLocalCommand).toBe('function');

    const unregister = facade.registerPageAction!({
      id: 'show_log',
      entity_kind: 'run_config',
      run: () => {},
    });
    const context = collectedContext(facade);
    expect(context.actions).toEqual([
      { id: 'activate', entity_kind: 'ui_control' },
      { id: 'set_value', entity_kind: 'ui_control' },
      { id: 'show_log', entity_kind: 'run_config' },
    ]);

    unregister();
    expect(collectedContext(facade).actions).not.toContainEqual({ id: 'show_log', entity_kind: 'run_config' });
  });

  it('collects visible controls and skips sensitive ones', () => {
    initHost();
    const facade = window.PBGuiAI!;

    // jsdom rects are all-zero, which the visibility gate treats as hidden,
    // and its computed opacity is '' for anything without an inline value
    // (Number('') === 0, no inheritance) — hence the rect spy plus the
    // per-control inline opacity.
    const rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue({ width: 100, height: 20, top: 0, bottom: 20, left: 0, right: 100 } as DOMRect);
    document.body.innerHTML = `
      <button id="btn-ok" style="opacity: 1">Start backtest</button>
      <button id="btn-hidden" style="opacity: 1" hidden>Hidden action</button>
      <input id="api-key" style="opacity: 1" type="password" placeholder="api key" />
      <input id="f-search" style="opacity: 1" placeholder="Filter configs" />
    `;
    try {
      const controls = collectedContext(facade).controls ?? [];
      const ids = controls.map((control) => control.label);

      expect(ids).toContain('Start backtest');
      expect(ids).toContain('Filter configs');
      expect(ids).not.toContain('Hidden action');
      expect(ids).not.toContain('api key');
      const search = controls.find((control) => control.label === 'Filter configs')!;
      expect(search.operations).toEqual(['set_value']);
    } finally {
      rectSpy.mockRestore();
    }
  });

  it('executes a same-page page action from pbgui:ai-ui-action and acks via preventDefault', () => {
    initHost();
    const facade = window.PBGuiAI!;

    const run = vi.fn();
    facade.registerPageContext!({
      id: 'productive-page',
      getContext: () => ({ entities: [{ kind: 'run_config', name: 'bot-1' }] }),
    });
    facade.registerPageAction!({ id: 'show_log', entity_kind: 'run_config', run });

    const event = new CustomEvent('pbgui:ai-ui-action', {
      cancelable: true,
      detail: {
        type: 'page.perform_action',
        target: { page_key: 'dashboards' },
        payload: { action: 'show_log', entity: { kind: 'run_config', name: 'bot-1' } },
      },
    });
    window.dispatchEvent(event);

    expect(run).toHaveBeenCalledWith('bot-1', { kind: 'run_config', name: 'bot-1' }, event.detail.payload);
    expect(event.defaultPrevented).toBe(true);

    // An action on an entity the page never exposed must not run.
    const unexposed = new CustomEvent('pbgui:ai-ui-action', {
      cancelable: true,
      detail: {
        type: 'page.perform_action',
        target: { page_key: 'dashboards' },
        payload: { action: 'show_log', entity: { kind: 'run_config', name: 'ghost' } },
      },
    });
    window.dispatchEvent(unexposed);
    expect(run).toHaveBeenCalledTimes(1);
    expect(unexposed.defaultPrevented).toBe(false);
  });

  it('continues a cross-page action with the pbgui_ai_action flag', () => {
    initHost();

    // jsdom's window.location is non-configurable, so stub the whole global.
    const assign = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      assign,
    });

    const event = new CustomEvent('pbgui:ai-ui-action', {
      cancelable: true,
      detail: {
        type: 'page.perform_action',
        target: { page_key: 'v7_run' },
        payload: { action: 'show_log', entity: { kind: 'run_config', name: 'bot-1' } },
      },
    });
    window.dispatchEvent(event);

    expect(assign).toHaveBeenCalledTimes(1);
    expect(String(assign.mock.calls[0]![0])).toContain('/api/v7/main_page?pbgui_ai_action=1');
    vi.unstubAllGlobals();
  });

  it('runs a local open-log command without a model turn', () => {
    initHost();
    const facade = window.PBGuiAI!;

    const run = vi.fn();
    facade.registerPageContext!({
      id: 'productive-page',
      getContext: () => ({ entities: [{ kind: 'run_config', name: 'bot-1' }] }),
    });
    facade.registerPageAction!({ id: 'show_log', entity_kind: 'run_config', run });

    const result = facade.tryLocalCommand!('please open the log window');
    expect(result.handled).toBe(true);
    expect(run).toHaveBeenCalledWith(
      'bot-1',
      expect.objectContaining({ kind: 'run_config', name: 'bot-1' }),
      expect.objectContaining({ action: 'show_log' }),
    );
    expect(facade.tryLocalCommand!('what is the best grid step?')).toEqual({ handled: false });
  });

  it('registers legacy PBGUI_AI_PAGE_ACTIONS entries on init', () => {
    const run = vi.fn();
    (window as { PBGUI_AI_PAGE_ACTIONS?: unknown[] }).PBGUI_AI_PAGE_ACTIONS = [
      { id: 'show_log', entity_kind: 'backtest_queue_item', run },
    ];
    initHost();
    const facade = window.PBGuiAI!;

    expect(collectedContext(facade).actions).toContainEqual({
      id: 'show_log',
      entity_kind: 'backtest_queue_item',
    });
  });
});

describe('PBGuiAI useAiPageAction composable', () => {
  it('unregisters the action when the component unmounts', async () => {
    initHost();

    const Comp = defineComponent({
      setup() {
        useAiPageAction({ id: 'show_log', entity_kind: 'run_config', run: () => {} });
        return () => null;
      },
    });
    const wrapper = mount(Comp, { global: { plugins: [createI18n('en')] } });
    await flushPromises();

    const facade = window.PBGuiAI!;
    expect(collectedContext(facade).actions).toContainEqual({ id: 'show_log', entity_kind: 'run_config' });

    wrapper.unmount();
    expect(collectedContext(facade).actions).not.toContainEqual({ id: 'show_log', entity_kind: 'run_config' });
  });
});
