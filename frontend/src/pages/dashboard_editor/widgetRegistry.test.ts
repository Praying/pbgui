import { describe, expect, it } from 'vitest';
import { PALETTE_TYPES, type RenderableWidgetType } from './lib/grid';
import { registerWidget, widgetComponent } from './widgetRegistry';

/* The recon's circularity resolution: D-2 ships EmptyCell stubs for every
   renderable type; D-4..7 replace entries via registerWidget. */

describe('widgetRegistry', () => {
  it('maps every renderable type to a component (EmptyCell stubs)', () => {
    for (const type of PALETTE_TYPES) {
      expect(widgetComponent(type)).toBeTruthy();
    }
  });

  it('excludes NONE (not a renderable widget)', () => {
    expect(PALETTE_TYPES).not.toContain('NONE');
  });

  it('registerWidget replaces a stub (D-4..7 contract)', () => {
    const replacement = { name: 'WidgetPnl' } as never;
    registerWidget('PNL' as RenderableWidgetType, replacement);
    expect(widgetComponent('PNL')).toBe(replacement);
    /* the rest keep their stubs */
    expect(widgetComponent('TOP')).not.toBe(replacement);
  });
});
