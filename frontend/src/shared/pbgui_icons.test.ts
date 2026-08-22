import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface PBGuiIconOptions {
  label?: string;
  size?: number;
}

interface PBGuiIconFactory {
  create(name: string, options?: PBGuiIconOptions): string;
}

declare global {
  interface Window {
    PBGuiIcons?: PBGuiIconFactory;
  }
}

const FRONTEND_DIRECTORY = resolve(process.cwd());
const ICON_HELPER_PATH = resolve(FRONTEND_DIRECTORY, 'js/pbgui_icons.js');
const NAVIGATION_PATH = resolve(FRONTEND_DIRECTORY, 'pbgui_nav.js');
const NAVIGATION_ICON_NAMES = [
  'house',
  'key',
  'arrows-clockwise',
  'wrench',
  'database',
  'desktop',
  'chart-bar',
  'file-text',
  'wallet',
  'play',
  'backspace',
  'gear',
  'eye',
  'target',
  'star',
] as const;
const NAVIGATION_ACTION_ICON_NAMES = [
  'bell',
  'shield-warning',
  'book-open',
  'info',
  'sign-out',
] as const;

function loadIconFactory(): PBGuiIconFactory {
  window.eval(readFileSync(ICON_HELPER_PATH, 'utf8'));

  if (!window.PBGuiIcons) {
    throw new Error('PBGui icon factory was not registered');
  }

  return window.PBGuiIcons;
}

afterEach(() => {
  delete window.PBGuiIcons;
});

describe('legacy PBGui icon helper', () => {
  it('renders every navigation icon from the local Phosphor Regular allowlist', () => {
    const iconFactory = loadIconFactory();

    for (const iconName of [...NAVIGATION_ICON_NAMES, ...NAVIGATION_ACTION_ICON_NAMES]) {
      const markup = iconFactory.create(iconName, { size: 18 });

      expect(markup).toContain('<svg');
      expect(markup).toContain('viewBox="0 0 256 256"');
      expect(markup).toContain('width="18" height="18"');
      expect(markup).toContain('fill="currentColor"');
      expect(markup).toContain('aria-hidden="true"');
      expect(markup).not.toContain('<script');
    }
  });

  it('escapes accessible labels before placing them in SVG attributes', () => {
    const iconFactory = loadIconFactory();
    const markup = iconFactory.create('house', {
      label: 'Open <home> & "settings"\nnow',
      size: 20,
    });

    expect(markup).toContain('role="img"');
    expect(markup).toContain('aria-label="Open &lt;home&gt; &amp; &quot;settings&quot; now"');
    expect(markup).not.toContain('aria-hidden');
    expect(markup).not.toContain('Open <home>');
  });

  it('rejects unknown names and non-numeric sizes', () => {
    const iconFactory = loadIconFactory();

    expect(() => iconFactory.create('unknown')).toThrow('Unknown PBGui icon');
    expect(() => iconFactory.create('house', { size: Number.NaN })).toThrow('finite positive number');
    expect(() => iconFactory.create('house', { size: '20' as unknown as number })).toThrow(
      'finite positive number',
    );
  });
});

describe('legacy PBGui navigation icon integration', () => {
  it('uses icon names and the shared factory instead of emoji entities', () => {
    const navigationSource = readFileSync(NAVIGATION_PATH, 'utf8');

    for (const iconName of NAVIGATION_ICON_NAMES) {
      expect(navigationSource).toContain(`icon: '${iconName}'`);
    }

    expect(navigationSource).toContain('window.PBGuiIcons.create(item.icon, { size: 18 })');
    expect(navigationSource).toContain("window.PBGuiIcons.create('bell', { size: 16 })");
    expect(navigationSource).toContain("window.PBGuiIcons.create('shield-warning', { size: 16 })");
    expect(navigationSource).toContain("window.PBGuiIcons.create('book-open', { size: 16 })");
    expect(navigationSource).toContain("window.PBGuiIcons.create('info', { size: 16 })");
    expect(navigationSource).toContain("window.PBGuiIcons.create('sign-out', { size: 16 })");
    expect(navigationSource).not.toMatch(/icon:\s*'&#(?:x[0-9a-f]+|\d+);'/i);
    expect(navigationSource).not.toContain('&#128276;');
    expect(navigationSource).not.toContain('&#128737;');
  });

  it('loads the local icon helper before navigation on every legacy fallback page', () => {
    const fallbackPages = readdirSync(FRONTEND_DIRECTORY)
      .filter((fileName) => fileName.endsWith('.html'))
      .map((fileName) => ({
        fileName,
        source: readFileSync(`${FRONTEND_DIRECTORY}/${fileName}`, 'utf8'),
      }))
      .filter(({ source }) => /<script src="\/app\/pbgui_nav\.js\?v=[^"]+"><\/script>/.test(source));

    expect(fallbackPages.length).toBeGreaterThan(0);
    for (const { fileName, source } of fallbackPages) {
      const iconHelperPosition = source.indexOf('<script src="/app/js/pbgui_icons.js?v=');
      const navigationPosition = source.indexOf('<script src="/app/pbgui_nav.js?v=');

      expect(iconHelperPosition, `${fileName} does not load pbgui_icons.js`).toBeGreaterThanOrEqual(0);
      expect(iconHelperPosition, `${fileName} loads icons after navigation`).toBeLessThan(
        navigationPosition,
      );
    }
  });
});
