import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface JsonPanelGlobal {
  copyJsonPanel(preId: string, button?: HTMLButtonElement): Promise<void>;
}

declare global {
  interface Window {
    PBGuiJsonPanel?: JsonPanelGlobal;
    copyJsonPanel?: JsonPanelGlobal['copyJsonPanel'];
    expandJsonPanel?: (preId: string, button?: HTMLButtonElement) => void;
    zoomJsonPanel?: (preId: string, direction: number) => void;
  }
}

const JSON_PANEL_PATH = resolve(process.cwd(), 'js/json_panel.js');

function loadJsonPanel(): JsonPanelGlobal {
  window.eval(readFileSync(JSON_PANEL_PATH, 'utf8'));
  if (!window.PBGuiJsonPanel) throw new Error('PBGui JSON panel was not registered');
  return window.PBGuiJsonPanel;
}

function installConfig(text: string): HTMLButtonElement {
  const config = document.createElement('pre');
  config.id = 'raw-config-json';
  config.textContent = text;
  const button = document.createElement('button');
  button.textContent = 'Copy';
  document.body.append(config, button);
  return button;
}

function setClipboard(value: { writeText(text: string): Promise<void> } | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
  document.getElementById('pbgui-json-panel-styles')?.remove();
  delete window.PBGuiJsonPanel;
  delete window.copyJsonPanel;
  delete window.expandJsonPanel;
  delete window.zoomJsonPanel;
  Reflect.deleteProperty(document, 'execCommand');
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('shared JSON panel clipboard', () => {
  it('copies the current complete configuration with the Clipboard API', async () => {
    const completeConfig = '{\n  "backtest": {\n    "starting_balance": 1500\n  }\n}';
    const button = installConfig(completeConfig);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });

    await loadJsonPanel().copyJsonPanel('raw-config-json', button);

    expect(writeText).toHaveBeenCalledWith(completeConfig);
    expect(button.textContent).toBe('✓ Copied');
  });

  it('falls back to a temporary textarea when the Clipboard API is unavailable', async () => {
    const completeConfig = '{"live":{"approved_coins":{"long":["BTC"]}}}';
    const button = installConfig(completeConfig);
    let selectedText = '';
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        selectedText = (document.activeElement as HTMLTextAreaElement).value;
        return true;
      }),
    });
    setClipboard(undefined);

    await loadJsonPanel().copyJsonPanel('raw-config-json', button);

    expect(selectedText).toBe(completeConfig);
    expect(button.textContent).toBe('✓ Copied');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('uses the fallback when Clipboard API permission is denied', async () => {
    const completeConfig = '{"bot":{"long":{"n_positions":3}}}';
    const button = installConfig(completeConfig);
    const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const execCommand = vi.fn(() => true);
    setClipboard({ writeText });
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: execCommand,
    });

    await loadJsonPanel().copyJsonPanel('raw-config-json', button);

    expect(writeText).toHaveBeenCalledWith(completeConfig);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(button.textContent).toBe('✓ Copied');
  });

  it('shows a visible failure when neither copy mechanism succeeds', async () => {
    const button = installConfig('{"config":true}');
    setClipboard(undefined);
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => false),
    });

    await loadJsonPanel().copyJsonPanel('raw-config-json', button);

    expect(button.textContent).toBe('Copy failed');
  });
});
